#!/usr/bin/env python3
"""Safely create or read the persisted Better Auth signing secret."""
from __future__ import annotations

import argparse
import base64
import os
import stat
import sys
import tempfile


class UnsafeSecretError(RuntimeError):
    pass


def _no_follow() -> int:
    return getattr(os, "O_NOFOLLOW", 0)


def _validate_fd(fd: int, path: str) -> None:
    info = os.fstat(fd)
    if not stat.S_ISREG(info.st_mode):
        raise UnsafeSecretError(f"authentication secret is not a regular file: {path}")
    if info.st_uid != os.geteuid():
        raise UnsafeSecretError(f"authentication secret is not owned by uid {os.geteuid()}: {path}")
    if info.st_nlink != 1:
        raise UnsafeSecretError(f"authentication secret has unexpected hard links: {path}")
    if stat.S_IMODE(info.st_mode) != 0o600:
        raise UnsafeSecretError(f"authentication secret must have mode 0600: {path}")


def read_or_create(path: str) -> tuple[str, bool]:
    flags = os.O_RDONLY | _no_follow()
    try:
        fd = os.open(path, flags)
        created = False
    except FileNotFoundError:
        value = base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
        create_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | _no_follow()
        try:
            fd = os.open(path, create_flags, 0o600)
        except FileExistsError:
            # Another launcher won the exclusive-create race. Reopen with
            # no-follow and validate that exact file descriptor.
            fd = os.open(path, flags)
            created = False
        else:
            created = True
            try:
                os.fchmod(fd, 0o600)
                os.write(fd, (value + "\n").encode("ascii"))
                os.fsync(fd)
            finally:
                os.close(fd)
            return value, created
    except OSError as exc:
        raise UnsafeSecretError(f"authentication secret could not be opened safely: {path}") from exc

    try:
        _validate_fd(fd, path)
        raw = os.read(fd, 4097)
    finally:
        os.close(fd)
    if len(raw) > 4096:
        raise UnsafeSecretError(f"authentication secret is unexpectedly large: {path}")
    try:
        value = raw.decode("ascii").strip()
    except UnicodeDecodeError as exc:
        raise UnsafeSecretError(f"authentication secret is not ASCII: {path}") from exc
    if len(value) < 32:
        raise UnsafeSecretError(f"authentication secret is too short: {path}")
    return value, created


def _self_test() -> int:
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "better-auth.secret")
        first, created = read_or_create(path)
        assert created and len(first) >= 32
        second, created = read_or_create(path)
        assert not created and second == first
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o600

        os.chmod(path, 0o644)
        try:
            read_or_create(path)
            raise AssertionError("unsafe secret mode must be rejected")
        except UnsafeSecretError:
            pass

        target = os.path.join(td, "target")
        with open(target, "w", encoding="ascii") as fh:
            fh.write("x" * 40)
        os.chmod(target, 0o600)
        link = os.path.join(td, "link")
        os.symlink(target, link)
        try:
            read_or_create(link)
            raise AssertionError("symlinked secret must be rejected")
        except UnsafeSecretError:
            pass
    print("OK: _possiblaw_auth_secret self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--read-or-create")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.self_test:
            return _self_test()
        if not args.read_or_create:
            parser.error("--read-or-create is required")
        value, _created = read_or_create(args.read_or_create)
        sys.stdout.write(value)
        return 0
    except UnsafeSecretError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
