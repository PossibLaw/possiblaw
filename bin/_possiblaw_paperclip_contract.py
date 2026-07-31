#!/usr/bin/env python3
"""Pin-integrity check for the pinned Paperclip submodule.

Paperclip is an upstream pinned submodule and must not be modified here. This
check asserts one thing: the Paperclip checkout matches the gitlink recorded in
HEAD. A drifted checkout means every other check in the repository ran against
source the commit does not describe.

WHAT THIS NO LONGER DOES, AND WHY. Until the 2026-07-29 pin bump this file also
regex-matched Paperclip's *source* to assert three cross-client isolation
properties: membership-filtered company listings, issue reads authorized
against the loaded issue's companyId, and the issuePrefix derivation. Those
assertions were retired because they had both failure modes, and both were
observed:

  * FALSE ALARM. Upstream refactored
      const issue = await svc.getById(id);
      assertCompanyAccess(req, issue.companyId);
    into
      const issue = await getAccessibleResource(req, res, svc.getById(id), ...);
      if (!(await assertIssueReadAllowed(req, res, issue))) return;
    The property was preserved and strengthened — the new path routes through a
    policy decision point (access.decide with action "issue:read"). The regex
    failed anyway, because it asserted syntax rather than behavior.

  * FALSE CONFIDENCE. The same regex would have passed unchanged if
    assertCompanyAccess were weakened internally, or if a new route shipped
    with no check at all. Nothing that greps a call site can see what a running
    server returns to an unentitled caller.

Those three properties are now asserted behaviorally, against a real Paperclip
booted on loopback, by:

    bin/conformance-paperclip

which also ships a --negative-control mode that proves the assertions
discriminate instead of passing vacuously. Run it before moving the pin:

    bin/conformance-paperclip --allow-pin-drift
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path


class ContractError(RuntimeError):
    pass


def git_output(*args: str, cwd: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(cwd), *args],
            text=True,
            stderr=subprocess.STDOUT,
        ).strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = exc.output.strip() if isinstance(exc, subprocess.CalledProcessError) else str(exc)
        raise ContractError(f"could not verify Paperclip submodule pin: {detail}") from exc


def parse_gitlink(line: str) -> str:
    match = re.fullmatch(r"160000 commit ([0-9a-f]{40})\s+paperclip", line)
    if not match:
        raise ContractError("HEAD does not contain a pinned Paperclip gitlink")
    return match.group(1)


def check_pin(repo_root: Path) -> None:
    expected = parse_gitlink(git_output("ls-tree", "HEAD", "paperclip", cwd=repo_root))
    actual = git_output("rev-parse", "HEAD", cwd=repo_root / "paperclip")
    if actual != expected:
        raise ContractError(
            f"Paperclip checkout {actual} does not match the repository gitlink {expected}"
        )


def check_repo(repo_root: Path) -> None:
    check_pin(repo_root)


def self_test() -> int:
    assert parse_gitlink("160000 commit " + "a" * 40 + "\tpaperclip") == "a" * 40

    for bad in (
        "160000 commit deadbeef\tpaperclip",          # short sha
        "100644 blob " + "a" * 40 + "\tpaperclip",    # not a gitlink
        "160000 commit " + "a" * 40 + "\tharvey-lab",  # wrong submodule
        "",
    ):
        try:
            parse_gitlink(bad)
        except ContractError:
            pass
        else:
            raise AssertionError(f"malformed gitlink must be rejected: {bad!r}")

    print("OK: Paperclip pin-integrity self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return self_test()
    repo_root = (args.repo_root or Path(__file__).resolve().parent.parent).resolve()
    try:
        check_repo(repo_root)
    except ContractError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print("OK: pinned Paperclip checkout matches the recorded gitlink")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
