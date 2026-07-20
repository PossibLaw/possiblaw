import copy
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
HELPER_PATH = REPO_ROOT / "config" / "possiblaw_config.py"
EXAMPLES_DIR = REPO_ROOT / "config" / "examples"


def load_helper():
    spec = importlib.util.spec_from_file_location("possiblaw_config", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load configuration helper")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_example(name: str):
    return json.loads((EXAMPLES_DIR / f"{name}.json").read_text(encoding="utf-8"))


class ConfigV1Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper = load_helper()

    def test_happy_path_all_reference_personas_validate(self):
        for name in ("firm", "in-house", "hybrid"):
            with self.subTest(name=name):
                config = load_example(name)
                validated = self.helper.validate_config(config, REPO_ROOT)
                self.assertEqual(validated["schema"], "possiblaw/config/v1")

    def test_effective_output_is_deterministic_and_redacts_every_env_reference(self):
        config = load_example("firm")
        first = self.helper.render_effective_config(config, REPO_ROOT)
        second = self.helper.render_effective_config(config, REPO_ROOT)
        self.assertEqual(first, second)
        self.assertIn('"env": "<redacted-env-ref>"', first)
        self.assertNotIn("POSSIBLAW_GDRIVE_REVIEW_FOLDER_ID", first)
        self.assertNotIn("GDRIVE_CLIENT_ID", first)
        self.assertEqual(list(json.loads(first)), sorted(json.loads(first)))

    def test_optional_disabled_connector_and_destination_need_no_environment_reference(self):
        config = load_example("hybrid")
        config["capabilities"]["connectors"].append(
            {"id": "connector-docusign", "enabled": False}
        )
        config["trustedDestinations"].append(
            {"id": "future-review-root", "provider": "gdrive", "enabled": False}
        )
        self.helper.validate_config(config, REPO_ROOT)

    def test_enabled_trusted_destination_requires_environment_references(self):
        config = load_example("hybrid")
        config["trustedDestinations"].append(
            {"id": "broken-review-root", "provider": "gdrive", "enabled": True}
        )
        with self.assertRaisesRegex(self.helper.ConfigError, "must match exactly one allowed shape"):
            self.helper.validate_config(config, REPO_ROOT)

    def test_connector_credentials_destinations_tools_and_principals_form_one_graph(self):
        config = load_example("firm")
        del config["capabilities"]["connectors"][1]["secretRefs"]["clientSecret"]
        with self.assertRaisesRegex(self.helper.ConfigError, "complete gate credential alternative"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("in-house")
        config["capabilities"]["connectors"][0]["enabled"] = False
        config["capabilities"]["connectors"][0].pop("secretRefs")
        with self.assertRaisesRegex(self.helper.ConfigError, "no matching enabled connector"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("in-house")
        config["capabilities"]["allowedTools"].append("send_email")
        with self.assertRaisesRegex(self.helper.ConfigError, "no compatible enabled production connector"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("firm")
        for team in config["teams"]:
            if "correspondence-clerk" in team["agents"]:
                team["agents"].remove("correspondence-clerk")
        with self.assertRaisesRegex(self.helper.ConfigError, "no enabled immutable-grant principal"):
            self.helper.validate_config(config, REPO_ROOT)

    def test_json_schema_const_and_enum_do_not_accept_boolean_integer_confusion(self):
        config = load_example("firm")
        config["trustedDestinations"][0]["enabled"] = 1
        with self.assertRaisesRegex(self.helper.ConfigError, "allowed shape|must equal"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("firm")
        config["trustedDestinations"][0]["enabled"] = 0
        with self.assertRaisesRegex(self.helper.ConfigError, "allowed shape|must equal"):
            self.helper.validate_config(config, REPO_ROOT)

    def test_schema_rejects_unknown_keys(self):
        config = load_example("firm")
        config["deployment"]["surprise"] = True
        with self.assertRaisesRegex(self.helper.ConfigError, "unknown key"):
            self.helper.validate_config(config, REPO_ROOT)

    def test_schema_rejects_inline_secret_values(self):
        config = load_example("firm")
        config["capabilities"]["connectors"][0]["accessToken"] = "secret-value"
        with self.assertRaisesRegex(self.helper.ConfigError, "unknown key|inline secret"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("firm")
        config["capabilities"]["connectors"][0]["secretRefs"] = {
            "accessToken": {"env": "sk-live-not-an-env-reference"}
        }
        with self.assertRaisesRegex(self.helper.ConfigError, "pattern|secret-shaped"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("firm")
        config["identity"]["displayName"] = "sk-proj-abcdefghijklmnopqrstuv"
        with self.assertRaisesRegex(self.helper.ConfigError, "secret-shaped inline value"):
            self.helper.validate_config(config, REPO_ROOT)

        for suspicious in (
            "AKIAIOSFODNN7EXAMPLE",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl",
            "ya29.a0AfH6SMBexampletokenvalue",
        ):
            with self.subTest(suspicious=suspicious):
                config = load_example("hybrid")
                config["identity"]["displayName"] = suspicious
                with self.assertRaisesRegex(self.helper.ConfigError, "secret-shaped inline value"):
                    self.helper.validate_config(config, REPO_ROOT)

    def test_metered_budget_must_be_positive_while_subscription_is_capacity_bounded(self):
        config = load_example("firm")
        config["budgets"]["companyMonthlyCents"] = 0
        with self.assertRaisesRegex(self.helper.ConfigError, "positive companyMonthlyCents"):
            self.helper.validate_config(config, REPO_ROOT)

        subscription = load_example("hybrid")
        validated = self.helper.validate_config(subscription, REPO_ROOT)
        self.assertEqual(validated["budgets"]["companyMonthlyCents"], 0)
        self.assertGreater(validated["capacity"]["maxTurns"], 0)

    def test_invalid_catalog_references_fail_closed(self):
        mutations = {
            "agent": lambda c: c["teams"][0]["agents"].append("not-an-agent"),
            "skill": lambda c: c["teams"][0]["skills"].append("not-a-skill"),
            "connector": lambda c: c["capabilities"]["connectors"].append(
                {"id": "connector-not-real", "enabled": False}
            ),
            "variant": lambda c: c["models"].update({"variant": "not-a-variant"}),
            "lane": lambda c: c["models"]["lanes"].update(
                {"not-a-lane": {"variant": "codex"}}
            ),
            "tool": lambda c: c["capabilities"]["allowedTools"].append("not_a_tool"),
            "workflow": lambda c: c["workflowPacks"].append(
                {"id": "not-a-workflow", "enabled": False}
            ),
            "routine": lambda c: c["routines"].append(
                {
                    "id": "not-a-routine",
                    "enabled": False,
                    "schedule": {
                        "cron": "0 0 * * *",
                        "timezone": "UTC",
                    },
                    "concurrencyPolicy": "coalesce_if_active",
                }
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                config = load_example("firm")
                mutate(config)
                with self.assertRaisesRegex(self.helper.ConfigError, "unknown .* reference"):
                    self.helper.validate_config(config, REPO_ROOT)

    def test_repo_relative_policy_reference_cannot_escape_or_point_to_missing_file(self):
        for policy_ref in ("../outside.yaml", "companies/legal-operations/missing.yaml"):
            with self.subTest(policy_ref=policy_ref):
                config = load_example("firm")
                config["gate"]["policyRef"] = policy_ref
                with self.assertRaisesRegex(self.helper.ConfigError, "policy reference"):
                    self.helper.validate_config(config, REPO_ROOT)

    def test_config_gate_contract_must_match_the_referenced_runtime_policy(self):
        mutations = (
            lambda c: c["gate"]["boundaries"].update({"THIRD_PARTY_EGRESS": "allow"}),
            lambda c: c["gate"]["citationGate"].update({"boundaries": ["COURT_FILING"]}),
            lambda c: c["gate"]["citationGate"].update({"requireAuthorityProvenance": True}),
            lambda c: c["gate"]["firmFacade"].update({"allowWorkProductText": True}),
        )
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                config = load_example("hybrid")
                mutate(config)
                with self.assertRaisesRegex(self.helper.ConfigError, "does not match referenced gate policy"):
                    self.helper.validate_config(config, REPO_ROOT)

        config = load_example("hybrid")
        config["gate"]["policyRef"] = "companies/legal-operations/variants.yaml"
        with self.assertRaisesRegex(self.helper.ConfigError, "gate policy"):
            self.helper.validate_config(config, REPO_ROOT)

    def test_duplicate_ids_and_references_are_rejected(self):
        config = load_example("firm")
        config["teams"].append(copy.deepcopy(config["teams"][0]))
        with self.assertRaisesRegex(self.helper.ConfigError, "duplicate team id"):
            self.helper.validate_config(config, REPO_ROOT)

        config = load_example("firm")
        config["capabilities"]["allowedTools"].append(
            config["capabilities"]["allowedTools"][0]
        )
        with self.assertRaisesRegex(self.helper.ConfigError, "unique"):
            self.helper.validate_config(config, REPO_ROOT)

    def test_cli_validate_and_effective_commands(self):
        example = EXAMPLES_DIR / "in-house.json"
        validated = subprocess.run(
            [sys.executable, str(HELPER_PATH), "validate", str(example)],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(validated.returncode, 0, validated.stderr)
        self.assertIn("valid possiblaw/config/v1", validated.stdout)

        effective = subprocess.run(
            [sys.executable, str(HELPER_PATH), "effective", str(example)],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(effective.returncode, 0, effective.stderr)
        self.assertIn("<redacted-env-ref>", effective.stdout)
        self.assertNotIn("POSSIBLAW_ONEDRIVE_REVIEW_DRIVE_ID", effective.stdout)

    def test_cli_rejects_duplicate_json_keys_and_oversized_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            duplicate = pathlib.Path(tmp) / "duplicate.json"
            duplicate.write_text(
                '{"schema":"possiblaw/config/v1","schema":"possiblaw/config/v1"}',
                encoding="utf-8",
            )
            process = subprocess.run(
                [sys.executable, str(HELPER_PATH), "validate", str(duplicate)],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(process.returncode, 2)
            self.assertIn("duplicate JSON object key", process.stderr)

    def test_schedule_requires_a_five_field_cron_and_real_iana_timezone(self):
        for cron, timezone in (("not-cron!", "UTC"), ("0 3 * * *", "not/a/real-zone")):
            with self.subTest(cron=cron, timezone=timezone):
                config = load_example("hybrid")
                config["routines"][0]["schedule"] = {"cron": cron, "timezone": timezone}
                with self.assertRaisesRegex(self.helper.ConfigError, "cron|timezone"):
                    self.helper.validate_config(config, REPO_ROOT)

    def test_schema_keyword_drift_fails_closed(self):
        schema = {"type": "string", "futureKeyword": True}
        with self.assertRaisesRegex(self.helper.ConfigError, "unsupported keyword"):
            self.helper._assert_supported_schema(schema)

    def test_schema_document_is_draft_2020_12_and_recursively_strict(self):
        schema_path = REPO_ROOT / "config" / "schema" / "possiblaw-config-v1.schema.json"
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertEqual(schema["$id"], "https://possiblaw.org/schema/config/v1")

        def assert_object_nodes_strict(node, path="$"):
            if isinstance(node, dict):
                if node.get("type") == "object":
                    self.assertIn(
                        "additionalProperties",
                        node,
                        f"object schema at {path} must state additionalProperties",
                    )
                for key, value in node.items():
                    assert_object_nodes_strict(value, f"{path}.{key}")
            elif isinstance(node, list):
                for index, value in enumerate(node):
                    assert_object_nodes_strict(value, f"{path}[{index}]")

        assert_object_nodes_strict(schema)


if __name__ == "__main__":
    unittest.main()
