#!/usr/bin/env python3
"""Static security contract for the single-tenant Compose reference."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = ROOT / "compose.yaml"


def _service_secrets(service: dict[str, object]) -> set[str]:
    result: set[str] = set()
    for item in service.get("secrets", []):
        if isinstance(item, str):
            result.add(item)
        elif isinstance(item, dict) and isinstance(item.get("source"), str):
            result.add(item["source"])
    return result


def _service_volumes(service: dict[str, object]) -> set[str]:
    result: set[str] = set()
    for item in service.get("volumes", []):
        if isinstance(item, str):
            result.add(item.split(":", 1)[0])
        elif isinstance(item, dict) and isinstance(item.get("source"), str):
            result.add(item["source"])
    return result


class TopologyContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.compose_text = COMPOSE_PATH.read_text(encoding="utf-8")
        cls.document = yaml.safe_load(cls.compose_text)
        cls.services = cls.document["services"]

    def test_required_services_and_network_separation(self) -> None:
        required = {
            "db",
            "paperclip",
            "gate",
            "gate-loopback-relay",
            "gate-ingress-a",
            "gate-ingress-b",
            "ssh-ingress-a",
            "ssh-ingress-b",
            "ai-gateway-a",
            "ai-gateway-b",
            "worker-a",
            "worker-b",
            "foreign-company-sentinel",
        }
        self.assertTrue(required.issubset(self.services))
        self.assertEqual(set(self.services["paperclip"]["networks"]), {"control_internal"})
        self.assertEqual(set(self.services["db"]["networks"]), {"control_internal"})
        self.assertEqual(
            set(self.services["gate"]["networks"]),
            {"control_internal", "gate_provider_egress"},
        )
        self.assertEqual(set(self.services["worker-a"]["networks"]), {"worker_a_internal"})
        self.assertEqual(set(self.services["worker-b"]["networks"]), {"worker_b_internal"})
        self.assertNotEqual(
            self.services["worker-a"]["networks"],
            self.services["worker-b"]["networks"],
        )

        networks = self.document["networks"]
        for name in ("control_internal", "worker_a_internal", "worker_b_internal", "foreign_company_internal"):
            self.assertIs(networks[name].get("internal"), True)
        for name in ("gate_provider_egress", "worker_a_provider_egress", "worker_b_provider_egress"):
            self.assertIsNot(networks[name].get("internal"), True)
        self.assertEqual(
            set(self.services["ai-gateway-a"]["networks"]),
            {"worker_a_internal", "worker_a_provider_egress"},
        )
        self.assertEqual(
            set(self.services["ai-gateway-b"]["networks"]),
            {"worker_b_internal", "worker_b_provider_egress"},
        )

    def test_workers_are_non_root_read_only_and_secret_minimal(self) -> None:
        for suffix in ("a", "b"):
            name = f"worker-{suffix}"
            worker = self.services[name]
            self.assertEqual(worker.get("user"), "10001:10001")
            self.assertIs(worker.get("read_only"), True)
            self.assertEqual(worker.get("cap_drop"), ["ALL"])
            self.assertIn("no-new-privileges:true", worker.get("security_opt", []))
            self.assertNotEqual(worker.get("pid"), "host")
            self.assertNotEqual(worker.get("network_mode"), "host")
            self.assertNotIn("privileged", worker)
            self.assertIn("/tmp", worker.get("tmpfs", []))
            self.assertIn("/run", worker.get("tmpfs", []))

            environment = worker.get("environment", {})
            self.assertNotIn("PAPERCLIP_API_KEY", environment)
            self.assertNotIn("BETTER_AUTH_SECRET", environment)
            self.assertNotIn("DATABASE_URL", environment)
            self.assertNotIn("OPENAI_API_KEY", environment)
            self.assertNotIn("ANTHROPIC_API_KEY", environment)
            self.assertEqual(
                environment.get("POSSIBLAW_GATE_API_KEY_FILE"),
                f"/run/secrets/worker_{suffix}_gate_key",
            )
            self.assertEqual(
                environment.get("POSSIBLAW_AI_GATEWAY_API_KEY_FILE"),
                f"/run/secrets/worker_{suffix}_ai_gateway_key",
            )

            secrets = _service_secrets(worker)
            self.assertEqual(
                secrets,
                {
                    f"worker_{suffix}_ssh_authorized_key",
                    f"worker_{suffix}_gate_key",
                    f"worker_{suffix}_ai_gateway_key",
                },
            )
            self.assertNotIn("better_auth_secret", secrets)
            self.assertNotIn("postgres_password", secrets)
            self.assertNotIn("gate_control_agent_key", secrets)
            self.assertNotIn("/var/run/docker.sock", self.compose_text)

        self.assertTrue(_service_volumes(self.services["worker-a"]).isdisjoint(
            _service_volumes(self.services["worker-b"])
        ))

    def test_relays_do_not_collapse_network_boundaries(self) -> None:
        expected = {
            "gate-ingress-a": {"control_internal", "worker_a_internal"},
            "gate-ingress-b": {"control_internal", "worker_b_internal"},
            "ssh-ingress-a": {"control_internal", "worker_a_internal"},
            "ssh-ingress-b": {"control_internal", "worker_b_internal"},
        }
        for name, networks in expected.items():
            service = self.services[name]
            self.assertEqual(set(service["networks"]), networks)
            self.assertIs(service.get("read_only"), True)
            self.assertEqual(service.get("cap_drop"), ["ALL"])
            self.assertIn("no-new-privileges:true", service.get("security_opt", []))
            self.assertEqual(_service_secrets(service), set())
        self.assertEqual(
            self.services["gate-ingress-a"]["command"],
            [
                "TCP-LISTEN:3802,bind=172.31.0.10,reuseaddr,fork",
                "TCP:172.30.0.30:3802",
            ],
        )
        self.assertEqual(
            self.services["gate-ingress-b"]["command"],
            [
                "TCP-LISTEN:3802,bind=172.32.0.10,reuseaddr,fork",
                "TCP:172.30.0.30:3802",
            ],
        )
        self.assertEqual(
            self.services["ssh-ingress-a"]["command"],
            [
                "TCP-LISTEN:2222,bind=172.30.0.51,reuseaddr,fork",
                "TCP:172.31.0.20:2222",
            ],
        )
        self.assertEqual(
            self.services["ssh-ingress-b"]["command"],
            [
                "TCP-LISTEN:2222,bind=172.30.0.52,reuseaddr,fork",
                "TCP:172.32.0.20:2222",
            ],
        )
        self.assertEqual(
            self.services["gate-loopback-relay"].get("network_mode"),
            "service:gate",
        )
        self.assertNotIn("ports", self.services["gate"])
        self.assertEqual(
            self.services["gate-loopback-relay"]["command"],
            [
                "TCP-LISTEN:3802,bind=172.30.0.30,reuseaddr,fork",
                "TCP:127.0.0.1:3801",
            ],
        )

    def test_worker_identity_material_is_distinct(self) -> None:
        for kind in ("ssh_authorized_key", "gate_key", "ai_gateway_key"):
            self.assertNotEqual(
                self.document["secrets"][f"worker_a_{kind}"]["file"],
                self.document["secrets"][f"worker_b_{kind}"]["file"],
            )

    def test_no_floating_latest_or_unrestricted_public_listener(self) -> None:
        deployment_sources = [COMPOSE_PATH]
        deployment_sources.extend(ROOT.glob("*.Dockerfile"))
        for path in deployment_sources:
            text = path.read_text(encoding="utf-8")
            self.assertNotRegex(text, re.compile(r"(?:[:@])latest(?:\s|$)"), str(path))
        ports = self.services["paperclip"].get("ports", [])
        self.assertTrue(ports)
        self.assertTrue(all(str(item).startswith("127.0.0.1:") for item in ports))

    def test_isolation_probe_covers_required_boundaries_without_secret_output(self) -> None:
        probe = (ROOT / "scripts" / "isolation_probe.py").read_text(encoding="utf-8")
        required_results = {
            "root_filesystem_read_only",
            "workspace_writable",
            "host_secret_paths_unreadable",
            "sensitive_environment_absent",
            "process_namespace_excludes_control",
            "no_new_privileges",
            "capabilities_empty",
            "docker_socket_unavailable",
            "gate_reachable",
            "gate_credential_separate_from_bridge",
            "direct_vendor_network_blocked",
            "control_network_unreachable",
            "ssh_ingress_reverse_path_blocked",
            "peer_worker_unreachable",
            "foreign_company_unreachable",
            "ai_gateway_reachable",
        }
        self.assertTrue(required_results.issubset(set(re.findall(r'"([a-z_]+)"\s*:', probe))))
        self.assertNotIn("print(secret", probe)
        self.assertNotIn("print(gate_key", probe)
        worker_entrypoint = (ROOT / "scripts" / "worker-entrypoint.sh").read_text(encoding="utf-8")
        self.assertIn("sshd -t -f \"$runtime_config\"", worker_entrypoint)
        self.assertIn("-f \"$runtime_config\"", worker_entrypoint)
        for variable in (
            "POSSIBLAW_GATE_URL",
            "POSSIBLAW_GATE_API_KEY_FILE",
            "POSSIBLAW_AI_GATEWAY_URL",
            "POSSIBLAW_AI_GATEWAY_API_KEY_FILE",
            "POSSIBLAW_PEER_WORKER_HOST",
            "POSSIBLAW_PEER_WORKER_IP",
            "POSSIBLAW_FOREIGN_COMPANY_HOST",
            "POSSIBLAW_FOREIGN_COMPANY_IP",
            "POSSIBLAW_SSH_INGRESS_HOST",
        ):
            self.assertIn(f"{variable}=", worker_entrypoint)
        self.assertNotIn('SetEnv=POSSIBLAW_GATE_API_KEY=', worker_entrypoint)
        self.assertNotIn('SetEnv=POSSIBLAW_AI_GATEWAY_API_KEY=', worker_entrypoint)
        self.assertNotIn("PAPERCLIP_API_KEY=", worker_entrypoint)
        gate_helper = (ROOT / "scripts" / "gate-request.sh").read_text(encoding="utf-8")
        self.assertIn("--fail-with-body", gate_helper)
        self.assertIn('wc -l < "$key_file"', gate_helper)
        self.assertIn('wc -c < "$key_file"', gate_helper)
        self.assertIn("POST body file exceeds the worker request limit", gate_helper)
        self.assertIn('POSSIBLAW_GATE_API_KEY_FILE', gate_helper)

    def test_provision_remounts_replaced_worker_keys_before_ssh_setup(self) -> None:
        provision = (ROOT / "scripts" / "provision-environments.sh").read_text(encoding="utf-8")
        recreate = provision.index("--force-recreate --no-deps worker-a worker-b")
        host_key_read = provision.index("host_public_key()")
        environment_setup = provision.index("ensure_environment()")
        self.assertLess(recreate, host_key_read)
        self.assertLess(recreate, environment_setup)
        self.assertIn("Compose file-backed secrets may retain the old sentinel inode", provision)


if __name__ == "__main__":
    unittest.main()
