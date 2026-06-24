#!/usr/bin/env python3
"""Print pending skill-edit proposals from a JSON array on stdin.

Reads a JSON array of SkillEditProposal objects and prints one human-readable
line per proposal. Fields used: id, skillSlug, generalizedEdit, sourceMatter.

Pure stdlib, side-effect-free. Gracefully handles empty input, non-list JSON,
and malformed JSON (prints nothing, exits 0).
"""
import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        return 0
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return 0
    if not isinstance(data, list):
        return 0
    for proposal in data:
        if not isinstance(proposal, dict):
            continue
        sep_id = proposal.get("id", "")
        skill_slug = proposal.get("skillSlug", "")
        edit = proposal.get("generalizedEdit", "")
        matter = proposal.get("sourceMatter", "")
        print(f"[{sep_id}] skill={skill_slug!r}  edit={edit!r}  matter={matter!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
