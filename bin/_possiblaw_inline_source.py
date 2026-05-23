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


def build_inline_source(package_root: Path) -> dict:
    if not package_root.exists():
        raise ValueError(f"package root does not exist: {package_root}")
    if not package_root.is_dir():
        raise ValueError(f"package root is not a directory: {package_root}")

    files: dict[str, object] = {}
    for rel, abs_path in _iter_files(package_root):
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

    print("OK: _possiblaw_inline_source self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--package-root", help="path to the package directory to bundle")
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not args.package_root:
        parser.error("--package-root is required")

    try:
        payload = build_inline_source(Path(args.package_root))
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
