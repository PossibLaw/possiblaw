#!/usr/bin/env python3
"""Create an allowlisted, secret-resistant workspace copy for a remote worker."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
import tempfile
from pathlib import Path, PurePosixPath


SENSITIVE_NAMES = {
    ".aws",
    ".env",
    ".env.local",
    ".git",
    ".gnupg",
    ".npmrc",
    ".ssh",
    "credentials",
    "id_ed25519",
    "id_rsa",
    "secrets",
}
SENSITIVE_SUFFIXES = (".key", ".p12", ".pem")
RESERVED_MANIFEST_NAME = ".possiblaw-workspace-manifest.sha256"
DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024
DEFAULT_MAX_TOTAL_BYTES = 500 * 1024 * 1024


class StagingError(ValueError):
    pass


def _validate_relative(raw: str) -> PurePosixPath:
    if not raw or raw != raw.strip() or "\\" in raw or "\x00" in raw:
        raise StagingError("allowlist contains an invalid path")
    relative = PurePosixPath(raw)
    if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
        raise StagingError("allowlist path must be normalized and remain below the source")
    return relative


def _assert_not_sensitive(relative: PurePosixPath) -> None:
    for part in relative.parts:
        lowered = part.lower()
        if lowered == RESERVED_MANIFEST_NAME:
            raise StagingError(f"reserved staging manifest path is forbidden: {relative.as_posix()}")
        if lowered in SENSITIVE_NAMES or lowered.startswith(".env.") or lowered.endswith(SENSITIVE_SUFFIXES):
            raise StagingError(f"secret-bearing path is forbidden: {relative.as_posix()}")


def _assert_regular_path(source_root: Path, relative: PurePosixPath) -> Path:
    current = source_root
    for part in relative.parts:
        current = current / part
        try:
            mode = current.lstat().st_mode
        except FileNotFoundError as error:
            raise StagingError(f"allowlisted path does not exist: {relative.as_posix()}") from error
        if stat.S_ISLNK(mode):
            raise StagingError(f"symbolic link is forbidden: {relative.as_posix()}")
    return current


def _iter_files(source_root: Path, relative: PurePosixPath) -> list[tuple[PurePosixPath, Path]]:
    _assert_not_sensitive(relative)
    source = _assert_regular_path(source_root, relative)
    mode = source.lstat().st_mode
    if stat.S_ISREG(mode):
        if source.lstat().st_nlink != 1:
            raise StagingError(f"hard-linked file is forbidden: {relative.as_posix()}")
        return [(relative, source)]
    if not stat.S_ISDIR(mode):
        raise StagingError(f"non-regular allowlisted path is forbidden: {relative.as_posix()}")

    result: list[tuple[PurePosixPath, Path]] = []
    for child in sorted(source.rglob("*")):
        child_relative = PurePosixPath(child.relative_to(source_root).as_posix())
        _assert_not_sensitive(child_relative)
        child_mode = child.lstat().st_mode
        if stat.S_ISLNK(child_mode):
            raise StagingError(f"symbolic link is forbidden: {child_relative.as_posix()}")
        if stat.S_ISDIR(child_mode):
            continue
        if not stat.S_ISREG(child_mode) or child.lstat().st_nlink != 1:
            raise StagingError(f"non-regular or hard-linked file is forbidden: {child_relative.as_posix()}")
        result.append((child_relative, child))
    return result


def _read_allowlist(path: Path) -> list[PurePosixPath]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        raise StagingError("allowlist is unreadable or not UTF-8") from error
    entries: list[PurePosixPath] = []
    for line in lines:
        if not line or line.startswith("#"):
            continue
        relative = _validate_relative(line)
        if relative in entries:
            raise StagingError(f"allowlist contains a duplicate path: {relative.as_posix()}")
        entries.append(relative)
    if not entries:
        raise StagingError("allowlist must contain at least one path")
    return entries


def _copy_regular_no_follow(source: Path, destination: Path, max_file_bytes: int) -> tuple[int, str, bool]:
    source_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        source_descriptor = os.open(source, source_flags)
    except OSError as error:
        raise StagingError(f"allowlisted file could not be opened safely: {source.name}") from error
    destination_descriptor = -1
    try:
        source_info = os.fstat(source_descriptor)
        if not stat.S_ISREG(source_info.st_mode) or source_info.st_nlink != 1:
            raise StagingError(f"non-regular or hard-linked file is forbidden: {source.name}")
        if source_info.st_size > max_file_bytes:
            raise StagingError(f"allowlisted file exceeds the per-file limit: {source.name}")
        destination_descriptor = os.open(
            destination,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o600,
        )
        digest = hashlib.sha256()
        copied = 0
        while True:
            chunk = os.read(source_descriptor, 1024 * 1024)
            if not chunk:
                break
            copied += len(chunk)
            if copied > max_file_bytes:
                raise StagingError(f"allowlisted file grew beyond the per-file limit: {source.name}")
            digest.update(chunk)
            view = memoryview(chunk)
            while view:
                written = os.write(destination_descriptor, view)
                view = view[written:]
        os.fsync(destination_descriptor)
        return copied, digest.hexdigest(), bool(source_info.st_mode & stat.S_IXUSR)
    finally:
        os.close(source_descriptor)
        if destination_descriptor >= 0:
            os.close(destination_descriptor)


def stage(source_root: Path, allowlist: Path, output: Path, max_file_bytes: int, max_total_bytes: int) -> dict[str, object]:
    if not source_root.is_dir() or source_root.is_symlink():
        raise StagingError("source must be a real directory")
    if output.exists() or output.is_symlink():
        raise StagingError("output already exists")
    source_root = source_root.resolve(strict=True)
    output_parent = output.parent.resolve(strict=True)
    if output_parent == source_root or source_root in output_parent.parents:
        raise StagingError("output must not be inside the source tree")

    selected: dict[str, Path] = {}
    for entry in _read_allowlist(allowlist):
        for relative, source in _iter_files(source_root, entry):
            key = relative.as_posix()
            if key in selected:
                raise StagingError(f"allowlist entries overlap: {key}")
            selected[key] = source
    if not selected:
        raise StagingError("allowlist selected no regular files")

    staging_dir = Path(tempfile.mkdtemp(prefix=f".{output.name}.", dir=output_parent))
    os.chmod(staging_dir, 0o700)
    total_bytes = 0
    manifest_lines: list[str] = []
    try:
        for relative, source in sorted(selected.items()):
            destination = staging_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
            size, digest, executable = _copy_regular_no_follow(source, destination, max_file_bytes)
            total_bytes += size
            if total_bytes > max_total_bytes:
                raise StagingError("allowlisted workspace exceeds the total size limit")
            os.chmod(destination, 0o750 if executable else 0o640)
            manifest_lines.append(f"{digest}  ./{relative}\n")

        manifest_payload = "".join(manifest_lines).encode("utf-8")
        manifest_path = staging_dir / ".possiblaw-workspace-manifest.sha256"
        manifest_path.write_bytes(manifest_payload)
        os.chmod(manifest_path, 0o640)
        os.replace(staging_dir, output)
        return {
            "file_count": len(selected),
            "total_bytes": total_bytes,
            "manifest_sha256": hashlib.sha256(manifest_payload).hexdigest(),
        }
    except Exception:
        for child in sorted(staging_dir.rglob("*"), reverse=True):
            try:
                child.unlink() if child.is_file() or child.is_symlink() else child.rmdir()
            except OSError:
                pass
        try:
            staging_dir.rmdir()
        except OSError:
            pass
        raise


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--allowlist", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-file-bytes", type=int, default=DEFAULT_MAX_FILE_BYTES)
    parser.add_argument("--max-total-bytes", type=int, default=DEFAULT_MAX_TOTAL_BYTES)
    args = parser.parse_args(argv)
    if args.max_file_bytes < 1 or args.max_total_bytes < args.max_file_bytes:
        print("staging size limits are invalid", file=sys.stderr)
        return 2
    try:
        summary = stage(
            args.source,
            args.allowlist,
            args.output,
            args.max_file_bytes,
            args.max_total_bytes,
        )
    except (OSError, StagingError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(summary, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
