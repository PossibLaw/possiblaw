#!/usr/bin/env python3
"""Behavior tests for fail-closed workspace staging."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STAGER = ROOT / "scripts" / "stage_workspace.py"


class StageWorkspaceTest(unittest.TestCase):
    def run_stage(self, source: Path, allowlist: Path, output: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(STAGER), "--source", str(source), "--allowlist", str(allowlist), "--output", str(output)],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_copies_only_allowlisted_regular_files_and_emits_hash_only_summary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            source.mkdir()
            (source / "docs").mkdir()
            (source / "docs" / "matter.md").write_text("sanitized\n", encoding="utf-8")
            (source / "ignored.txt").write_text("not staged\n", encoding="utf-8")
            allowlist = root / "allowlist"
            allowlist.write_text("docs/matter.md\n", encoding="utf-8")
            output = root / "staged"

            result = self.run_stage(source, allowlist, output)

            self.assertEqual(result.returncode, 0, result.stderr)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["file_count"], 1)
            self.assertEqual(set(summary), {"file_count", "total_bytes", "manifest_sha256"})
            self.assertRegex(summary["manifest_sha256"], r"^[0-9a-f]{64}$")
            self.assertEqual((output / "docs" / "matter.md").read_text(encoding="utf-8"), "sanitized\n")
            self.assertFalse((output / "ignored.txt").exists())
            self.assertTrue((output / ".possiblaw-workspace-manifest.sha256").is_file())

    def test_rejects_secret_paths_symlinks_and_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            source.mkdir()
            (source / ".env").write_text("SECRET=value\n", encoding="utf-8")
            (source / "safe.txt").write_text("safe\n", encoding="utf-8")
            os.symlink(source / "safe.txt", source / "link.txt")

            cases = ((".env\n", "secret"), ("link.txt\n", "symbolic link"))
            for index, (entry, expected) in enumerate(cases):
                allowlist = root / f"allowlist-{index}"
                allowlist.write_text(entry, encoding="utf-8")
                result = self.run_stage(source, allowlist, root / f"output-{index}")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected, result.stderr.lower())

            output = root / "exists"
            output.mkdir()
            allowlist = root / "allowlist-existing"
            allowlist.write_text("safe.txt\n", encoding="utf-8")
            result = self.run_stage(source, allowlist, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("already exists", result.stderr.lower())

    def test_rejects_parent_traversal_and_sensitive_files_nested_in_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            source.mkdir()
            (source / "bundle").mkdir()
            (source / "bundle" / "draft.md").write_text("draft\n", encoding="utf-8")
            (source / "bundle" / "client.pem").write_text("not-a-real-key\n", encoding="utf-8")

            for index, entry in enumerate(("../outside\n", "bundle\n")):
                allowlist = root / f"allowlist-{index}"
                allowlist.write_text(entry, encoding="utf-8")
                result = self.run_stage(source, allowlist, root / f"output-{index}")
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((root / f"output-{index}").exists())

    def test_rejects_hard_linked_files_and_overlapping_allowlist_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            source.mkdir()
            (source / "bundle").mkdir()
            original = source / "bundle" / "draft.md"
            original.write_text("draft\n", encoding="utf-8")
            os.link(original, source / "hardlink.md")

            hardlink_allowlist = root / "hardlink.allowlist"
            hardlink_allowlist.write_text("hardlink.md\n", encoding="utf-8")
            result = self.run_stage(source, hardlink_allowlist, root / "hardlink-output")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("hard-linked", result.stderr)

            original.unlink()
            (source / "bundle" / "draft.md").write_text("draft\n", encoding="utf-8")
            overlap_allowlist = root / "overlap.allowlist"
            overlap_allowlist.write_text("bundle\nbundle/draft.md\n", encoding="utf-8")
            result = self.run_stage(source, overlap_allowlist, root / "overlap-output")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("overlap", result.stderr)


if __name__ == "__main__":
    unittest.main()
