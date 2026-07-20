#!/usr/bin/env python3
"""Make a production inline import inert until runtime gates are attested."""

from __future__ import annotations

import argparse
import json
import re
import sys


def _suspend_task_frontmatter(markdown: str) -> str:
    if not markdown.startswith("---\n"):
        return markdown
    end = markdown.find("\n---", 4)
    if end < 0:
        raise ValueError("TASK.md has an unterminated frontmatter block")
    frontmatter = markdown[:end]
    rest = markdown[end:]
    frontmatter = re.sub(
        r"(?m)^(recurring\s*:\s*)true\s*$",
        r"\1false",
        frontmatter,
    )
    return frontmatter + rest


def _remove_top_level_routines(yaml_text: str) -> str:
    lines = yaml_text.splitlines(keepends=True)
    output: list[str] = []
    skipping = False
    for line in lines:
        if not skipping and re.match(r"^routines\s*:\s*(?:#.*)?(?:\r?\n)?$", line):
            skipping = True
            continue
        if skipping and line.strip() and not line[:1].isspace() and not line.lstrip().startswith("#"):
            skipping = False
        if not skipping:
            output.append(line)
    return "".join(output)


def suspend_recurring(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        document = json.load(fh)
    source = document.get("source") if isinstance(document, dict) else None
    files = source.get("files") if isinstance(source, dict) else None
    if not isinstance(files, dict):
        raise ValueError("inline import must contain source.files")

    changed = 0
    for file_path, content in list(files.items()):
        if not isinstance(content, str):
            continue
        if file_path.endswith("/TASK.md") or file_path == "TASK.md":
            updated = _suspend_task_frontmatter(content)
        elif file_path == ".paperclip.yaml" or file_path.endswith("/.paperclip.yaml"):
            updated = _remove_top_level_routines(content)
        else:
            continue
        if updated != content:
            files[file_path] = updated
            changed += 1

    with open(path, "w", encoding="utf-8") as fh:
        json.dump(document, fh)
    return changed


def _self_test() -> int:
    task = "---\nname: Scan\nrecurring: true\n---\nBody\n"
    assert "recurring: false" in _suspend_task_frontmatter(task)
    assert _suspend_task_frontmatter("Body recurring: true") == "Body recurring: true"
    sidecar = "schema: paperclip/v1\ntasks:\n  x: {}\nroutines:\n  x:\n    triggers: []\nsidebar:\n  agents: []\n"
    stripped = _remove_top_level_routines(sidecar)
    assert "routines:" not in stripped and "sidebar:" in stripped and "tasks:" in stripped
    print("OK: _possiblaw_import_safety self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suspend-recurring", metavar="INLINE_JSON")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    if not args.suspend_recurring:
        parser.error("--suspend-recurring is required")
    try:
        suspend_recurring(args.suspend_recurring)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
