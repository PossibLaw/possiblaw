#!/usr/bin/env python3
"""Bundle a package directory into a CompanyPortabilitySource.inline payload.

Inputs:
  --package-root <path>  directory to walk (e.g. companies/legal-operations)

Output: JSON on stdout matching paperclip's CompanyPortabilitySource (the
`inline` variant), shaped for POST /api/companies/import:

  {
    "source": {
      "type": "inline",
      "rootPath": "<package-root>",
      "files": {
        "<relpath>": "<utf-8 contents>"            // text file
        "<relpath>": { "encoding": "base64", "data": "..." }  // binary file
      }
    }
  }

Self-test: `python3 bin/_possiblaw_inline_source.py --self-test`.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import tempfile
from pathlib import Path

# Directories whose contents must NOT enter the inline bundle.
SKIP_DIR_NAMES = {".git", "__pycache__", "node_modules", ".DS_Store"}
# File names to skip outright.
SKIP_FILE_NAMES = {".DS_Store"}


def _iter_files(root: Path):
    """Yield (rel_posix_path, abs_path) for every file under root, sorted, skipping junk."""
    root = root.resolve()
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skipped directories in place so os.walk doesn't descend.
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIR_NAMES)
        for name in sorted(filenames):
            if name in SKIP_FILE_NAMES:
                continue
            abs_path = Path(dirpath) / name
            rel = abs_path.relative_to(root).as_posix()
            yield rel, abs_path


def _encode_file(abs_path: Path):
    """Read a file as UTF-8 text, falling back to base64 for binary content."""
    raw = abs_path.read_bytes()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return {
            "encoding": "base64",
            "data": base64.b64encode(raw).decode("ascii"),
        }


# From extra roots (demo overlays) only importer-discoverable content may
# enter the bundle; READMEs and helper files stay out of the import body.
EXTRA_ROOT_BASENAMES = {"PROJECT.md", "TASK.md"}


def build_inline_source(package_root: Path, extra_roots: list[Path] | None = None) -> dict:
    if not package_root.exists():
        raise ValueError(f"package root does not exist: {package_root}")
    if not package_root.is_dir():
        raise ValueError(f"package root is not a directory: {package_root}")

    files: dict[str, object] = {}
    for rel, abs_path in _iter_files(package_root):
        files[rel] = _encode_file(abs_path)

    for extra in extra_roots or []:
        extra = Path(extra)
        if not extra.is_dir():
            raise ValueError(f"extra root is not a directory: {extra}")
        for rel, abs_path in _iter_files(extra):
            if Path(rel).name not in EXTRA_ROOT_BASENAMES:
                continue
            if rel in files:
                raise ValueError(
                    f"extra root {extra} collides with the package on '{rel}'"
                )
            files[rel] = _encode_file(abs_path)

    return {
        "source": {
            "type": "inline",
            "rootPath": str(package_root.resolve()),
            "files": files,
        }
    }


def _self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / "pkg"
        (root / "agents" / "x").mkdir(parents=True)
        (root / ".git").mkdir()
        (root / "node_modules" / "junk").mkdir(parents=True)

        (root / "AGENTS.md").write_text("---\nslug: x\n---\nhello\n", encoding="utf-8")
        (root / "agents" / "x" / "AGENTS.md").write_text("# x\n", encoding="utf-8")
        (root / ".git" / "HEAD").write_text("ref: refs/heads/main\n", encoding="utf-8")
        (root / "node_modules" / "junk" / "f.js").write_text("module.exports={}", encoding="utf-8")
        (root / ".DS_Store").write_bytes(b"\x00\x00")
        (root / "binary.bin").write_bytes(b"\xff\xfe\x00\x01\x02")

        out = build_inline_source(root)
        files = out["source"]["files"]

        # Text files included as plain strings.
        assert files["AGENTS.md"].startswith("---\nslug: x"), files["AGENTS.md"]
        assert files["agents/x/AGENTS.md"] == "# x\n"

        # Binary file base64-encoded.
        binary = files["binary.bin"]
        assert isinstance(binary, dict), binary
        assert binary["encoding"] == "base64"
        assert base64.b64decode(binary["data"]) == b"\xff\xfe\x00\x01\x02"

        # Skipped dirs and files absent.
        assert not any(k.startswith(".git/") for k in files), files.keys()
        assert not any(k.startswith("node_modules/") for k in files), files.keys()
        assert ".DS_Store" not in files

        # Shape matches paperclip's CompanyPortabilitySource.inline.
        assert out["source"]["type"] == "inline"
        assert "rootPath" in out["source"]
        assert isinstance(out["source"]["files"], dict)

        # Extra roots (demo overlays) merge into the same file map.
        extra = Path(td) / "demo"
        (extra / "projects" / "demo-p" / "tasks" / "demo-t").mkdir(parents=True)
        (extra / "projects" / "demo-p" / "PROJECT.md").write_text("# p\n", encoding="utf-8")
        (extra / "projects" / "demo-p" / "tasks" / "demo-t" / "TASK.md").write_text("# t\n", encoding="utf-8")
        (extra / "README.md").write_text("demo readme\n", encoding="utf-8")
        out2 = build_inline_source(root, extra_roots=[extra])
        files2 = out2["source"]["files"]
        assert files2["projects/demo-p/PROJECT.md"] == "# p\n"
        assert files2["projects/demo-p/tasks/demo-t/TASK.md"] == "# t\n"
        # Non-discoverable demo files (README) are excluded from the merge.
        assert "README.md" not in files2 or files2.get("README.md") != "demo readme\n"
        # Package files still present.
        assert files2["AGENTS.md"].startswith("---\nslug: x")

        # Path collisions between package and extra root are an error.
        (root / "projects" / "demo-p").mkdir(parents=True)
        (root / "projects" / "demo-p" / "PROJECT.md").write_text("pkg version\n", encoding="utf-8")
        try:
            build_inline_source(root, extra_roots=[extra])
        except ValueError:
            pass
        else:
            raise AssertionError("path collision must raise ValueError")

    print("OK: _possiblaw_inline_source self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--package-root", help="path to the package directory to bundle")
    parser.add_argument(
        "--extra-root",
        action="append",
        default=[],
        help="extra directory whose PROJECT.md/TASK.md files merge into the bundle (repeatable; demo overlays)",
    )
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not args.package_root:
        parser.error("--package-root is required")

    try:
        payload = build_inline_source(
            Path(args.package_root),
            extra_roots=[Path(p) for p in args.extra_root],
        )
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
