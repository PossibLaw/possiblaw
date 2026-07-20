#!/usr/bin/env python3
"""Persist immutable principal bindings from the trusted portability import response."""

from __future__ import annotations

import argparse
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path


MAX_IMPORT_BYTES = 5 * 1024 * 1024


def _read_private_import(path: Path) -> tuple[bytes, object]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ValueError("trusted import response could not be opened safely") from error
    try:
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.geteuid()
            or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600
        ):
            raise ValueError("trusted import response must be an owned, single-link 0600 regular file")
        payload = os.read(descriptor, MAX_IMPORT_BYTES + 1)
        if len(payload) > MAX_IMPORT_BYTES:
            raise ValueError("trusted import response is too large")
    finally:
        os.close(descriptor)
    try:
        return payload, json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("trusted import response is not valid UTF-8 JSON") from error


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-response", required=True, type=Path)
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)

    repo_root = Path(__file__).resolve().parents[3]
    helper = repo_root / "bin" / "_possiblaw_authorization.py"
    catalog = repo_root / "companies" / "legal-operations" / "agents"
    normalized_path: Path | None = None
    try:
        payload, document = _read_private_import(args.import_response)
        if not isinstance(document, dict) or not isinstance(document.get("company"), dict):
            raise ValueError("trusted import response is missing the imported company")
        if document["company"].get("id") != args.company_id:
            raise ValueError("trusted import response company does not match --company-id")

        if args.output.parent.is_symlink():
            raise ValueError("principal-binding output directory must not be a symbolic link")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".trusted-import.", dir=args.output.parent)
        normalized_path = Path(temporary)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            subprocess.run(
                [
                    sys.executable,
                    str(helper),
                    "--import-response",
                    str(normalized_path),
                    "--company-id",
                    args.company_id,
                    "--catalog-root",
                    str(catalog),
                    "--output",
                    str(args.output),
                ],
                check=True,
            )
        finally:
            if normalized_path is not None:
                normalized_path.unlink(missing_ok=True)
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
