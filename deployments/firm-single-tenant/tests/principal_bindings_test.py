#!/usr/bin/env python3
"""Regression tests for trusted portability-import principal bindings."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PERSISTER = ROOT / "scripts" / "persist_import_bindings.py"


class PrincipalBindingsTest(unittest.TestCase):
    def run_persister(self, response: Path, company_id: str, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "python3",
                str(PERSISTER),
                "--import-response",
                str(response),
                "--company-id",
                company_id,
                "--output",
                str(output),
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_persists_immutable_ids_from_owned_0600_import_response(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            response = root / "import.json"
            response.write_text(json.dumps({
                "company": {"id": "company-1", "name": "Firm", "action": "created"},
                "agents": [
                    {
                        "slug": "deliverables-courier",
                        "id": "immutable-agent-1",
                        "action": "created",
                        "name": "Courier",
                        "reason": None,
                    }
                ],
                "projects": [],
                "envInputs": [],
                "warnings": [],
            }), encoding="utf-8")
            os.chmod(response, 0o600)
            output = root / "bindings.json"

            result = self.run_persister(response, "company-1", output)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")), {
                "version": 1,
                "companyId": "company-1",
                "agents": {"deliverables-courier": "immutable-agent-1"},
            })
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)

    def test_rejects_world_readable_or_cross_company_import_response(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            response = root / "import.json"
            response.write_text(json.dumps({
                "company": {"id": "company-1"},
                "agents": [{"slug": "deliverables-courier", "id": "immutable-agent-1"}],
            }), encoding="utf-8")
            output = root / "bindings.json"

            os.chmod(response, 0o644)
            result = self.run_persister(response, "company-1", output)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

            os.chmod(response, 0o600)
            result = self.run_persister(response, "company-2", output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("does not match", result.stderr)
            self.assertFalse(output.exists())

    def test_provisioner_requires_private_bindings_in_runtime_compile(self) -> None:
        provisioner = (ROOT / "scripts" / "provision-environments.sh").read_text(encoding="utf-8")
        self.assertIn('--bindings "$bindings_file"', provisioner)
        compile_position = provisioner.index('python3 "$repo_root/bin/_possiblaw_authorization.py"')
        key_mint_position = provisioner.index('mint_agent_key "$PAPERCLIP_GATE_AGENT_ID"')
        self.assertLess(compile_position, key_mint_position)
        self.assertNotIn('.slug ==', provisioner)
        self.assertNotIn('.urlKey', provisioner)
        self.assertIn('worker A, and worker B must use three distinct immutable agent identities', provisioner)
        self.assertIn('verify_worker_agent_config "$WORKER_A_AGENT_ID"', provisioner)
        self.assertIn('.config.privateKeySecretRef.type == "secret_ref"', provisioner)
        self.assertIn('--force-recreate --no-deps worker-a worker-b', provisioner)
        self.assertIn('old sentinel inode', provisioner)


if __name__ == "__main__":
    unittest.main()
