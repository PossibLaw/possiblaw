#!/usr/bin/env python3
"""Descriptor-safe reader for launcher-owned private metadata files."""
from __future__ import annotations

import argparse
import os
import re
import stat
import sys
import tempfile


PATTERNS = {
    "gate-key": re.compile(r"^[A-Za-z0-9._-]{1,4096}$"),
    "agent-id": re.compile(r"^[A-Za-z0-9-]{1,128}$"),
    "pid": re.compile(r"^[1-9][0-9]{0,19}$"),
}


class UnsafePrivateFileError(RuntimeError):
    pass


def read_private_file(path: str, kind: str) -> str:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise UnsafePrivateFileError(f"private {kind} file could not be opened safely: {path}") from exc
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise UnsafePrivateFileError(f"private {kind} file is not regular: {path}")
        if info.st_uid != os.geteuid():
            raise UnsafePrivateFileError(f"private {kind} file has the wrong owner: {path}")
        if info.st_nlink != 1:
            raise UnsafePrivateFileError(f"private {kind} file has unexpected hard links: {path}")
        if stat.S_IMODE(info.st_mode) != 0o600:
            raise UnsafePrivateFileError(f"private {kind} file must have mode 0600: {path}")
        raw = os.read(fd, 4097)
    finally:
        os.close(fd)
    if len(raw) > 4096:
        raise UnsafePrivateFileError(f"private {kind} file is too large: {path}")
    try:
        value = raw.decode("ascii").strip()
    except UnicodeDecodeError as exc:
        raise UnsafePrivateFileError(f"private {kind} file is not ASCII: {path}") from exc
    pattern = PATTERNS[kind]
    if not pattern.fullmatch(value):
        raise UnsafePrivateFileError(f"private {kind} file has invalid content: {path}")
    return value


def _self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "gate-key")
        with open(path, "w", encoding="ascii") as fh:
            fh.write("pcp_agent_test-key\n")
        os.chmod(path, 0o600)
        assert read_private_file(path, "gate-key") == "pcp_agent_test-key"

        os.chmod(path, 0o644)
        try:
            read_private_file(path, "gate-key")
            raise AssertionError("unsafe mode must be rejected")
        except UnsafePrivateFileError:
            pass

        target = os.path.join(td, "target")
        with open(target, "w", encoding="ascii") as fh:
            fh.write("agent-1\n")
        os.chmod(target, 0o600)
        link = os.path.join(td, "agent-link")
        os.symlink(target, link)
        try:
            read_private_file(link, "agent-id")
            raise AssertionError("symlink must be rejected")
        except UnsafePrivateFileError:
            pass
    print("OK: _possiblaw_private_file self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--read")
    parser.add_argument("--kind", choices=sorted(PATTERNS))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    if not args.read or not args.kind:
        parser.error("--read and --kind are required")
    try:
        sys.stdout.write(read_private_file(args.read, args.kind))
        return 0
    except UnsafePrivateFileError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
