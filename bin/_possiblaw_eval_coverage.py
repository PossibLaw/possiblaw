#!/usr/bin/env python3
"""Regenerate companies/legal-operations/evals/COVERAGE.md from source-of-truth
directory listings (agents/*, skills/*) and eval case frontmatter
(evals/cases/*.md `target:` field).

Stdlib-only Python 3. Matches the house style of bin/_possiblaw_variants.py:
argparse, --self-test, no third-party deps (no PyYAML — frontmatter `target:`
parsing is a narrow hand-rolled scanner, not a general YAML parser).

Modes:
  (default)    print the generated markdown to stdout
  --write      write the generated markdown to COVERAGE.md
  --check      exit 1 if COVERAGE.md on disk differs from freshly generated
               content (ignoring the generation-timestamp line only; this is
               the CI-friendly drift check)
  --self-test  run built-in unit checks against synthetic tempdir fixtures,
               exit 0/1

How to regenerate: python3 bin/_possiblaw_eval_coverage.py --write

Warnings (malformed case frontmatter, etc.) are embedded in the generated
markdown under a "Warnings" section rather than printed to stderr, so
`--write` and `--check` both surface them to anyone reading COVERAGE.md.
"""

from __future__ import annotations

import argparse
import datetime
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / "companies/legal-operations/agents"
SKILLS_DIR = REPO_ROOT / "companies/legal-operations/skills"
CASES_DIR = REPO_ROOT / "companies/legal-operations/evals/cases"
COVERAGE_PATH = REPO_ROOT / "companies/legal-operations/evals/COVERAGE.md"

REGEN_CMD = "python3 bin/_possiblaw_eval_coverage.py --write"

_TARGET_LINE_RE = re.compile(r"^target:\s*(.*)$")
_LIST_ITEM_RE = re.compile(r"^(\s+)-\s*(.+?)\s*$")
_TIMESTAMP_LINE_RE = re.compile(r"^_Generated .+ by `[^`]*`\._$", re.MULTILINE)


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def list_targets(dir_path: Path) -> list[str]:
    """Sorted subdirectory names (slugs) under dir_path. Missing dir -> []."""
    if not dir_path.is_dir():
        return []
    return sorted(
        p.name for p in dir_path.iterdir() if p.is_dir() and not p.name.startswith(".")
    )


def extract_frontmatter(text: str) -> str | None:
    """Return the raw text between the first `---` delimiter pair, or None."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return "\n".join(lines[1:i])
    return None


def parse_case_targets(text: str) -> list[str]:
    """Parse the frontmatter `target:` field from one case file's raw text.

    Supports both forms actually or plausibly found in evals/cases/*.md:
      target: some-slug              (scalar — the only form in use today)
      target:
        - slug-a
        - slug-b                     (list form, supported defensively)

    Returns [] when there is no frontmatter or no `target:` key — callers
    treat that as a malformed/incomplete case file and emit a warning
    instead of crashing.
    """
    frontmatter = extract_frontmatter(text)
    if frontmatter is None:
        return []
    lines = frontmatter.splitlines()
    for idx, line in enumerate(lines):
        m = _TARGET_LINE_RE.match(line)
        if not m:
            continue
        inline_value = m.group(1).strip()
        if inline_value:
            return [_strip_quotes(inline_value)]
        # No inline value -> look ahead for an indented "- item" list.
        items: list[str] = []
        for follow in lines[idx + 1 :]:
            item_m = _LIST_ITEM_RE.match(follow)
            if item_m:
                items.append(_strip_quotes(item_m.group(2)))
                continue
            if not follow.strip():
                continue
            break
        return items
    return []


def collect_cases(cases_dir: Path) -> tuple[dict[str, list[str]], list[str]]:
    """Scan evals/cases/*.md.

    Returns:
      coverage: target slug -> sorted list of case file names referencing it
      warnings: one line per case file whose frontmatter has no usable
                `target:` field (named, not silently dropped)
    """
    coverage: dict[str, list[str]] = {}
    warnings: list[str] = []
    if not cases_dir.is_dir():
        return coverage, warnings
    for path in sorted(cases_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        targets = parse_case_targets(text)
        if not targets:
            warnings.append(
                f"{path.name}: no 'target:' field found in frontmatter (excluded from coverage)"
            )
            continue
        for target in targets:
            coverage.setdefault(target, []).append(path.name)
    for target in coverage:
        coverage[target].sort()
    return coverage, warnings


def _render_table(slugs: list[str], kind: str, coverage: dict[str, list[str]]) -> list[str]:
    out = ["| Target | Kind | Case files | Count |", "|---|---|---|---|"]
    for slug in sorted(slugs):
        files = coverage.get(slug, [])
        count = len(files)
        links = ", ".join(f"[{f}](cases/{f})" for f in files) if files else "—"
        out.append(f"| {slug} | {kind} | {links} | {count} |")
    return out


def generate_coverage_markdown(
    agents_dir: Path,
    skills_dir: Path,
    cases_dir: Path,
    regen_cmd: str = REGEN_CMD,
    now: datetime.datetime | None = None,
) -> str:
    """Pure-ish function (only reads from disk): produce the full COVERAGE.md
    text deterministically, aside from the generation-timestamp line."""
    now = now or datetime.datetime.now(datetime.timezone.utc)

    agent_slugs = list_targets(agents_dir)
    skill_slugs = list_targets(skills_dir)
    coverage, warnings = collect_cases(cases_dir)

    known = set(agent_slugs) | set(skill_slugs)
    dangling = sorted(t for t in coverage if t not in known)

    case_files = sorted(p.name for p in cases_dir.glob("*.md")) if cases_dir.is_dir() else []

    covered_agents = [s for s in agent_slugs if s in coverage]
    covered_skills = [s for s in skill_slugs if s in coverage]
    covered = len(covered_agents) + len(covered_skills)
    total = len(agent_slugs) + len(skill_slugs)

    lines: list[str] = []
    lines.append(
        "<!-- GENERATED by bin/_possiblaw_eval_coverage.py — edit the generator, not this file. -->"
    )
    lines.append("# PossibLaw Eval Coverage")
    lines.append("")
    lines.append(f"**{covered} covered of {total} total targets** ({len(case_files)} case files)")
    lines.append("")
    lines.append(f"_Generated {now.strftime('%Y-%m-%d %H:%M UTC')} by `{regen_cmd}`._")
    lines.append("")

    if warnings:
        lines.append("## Warnings")
        lines.append("")
        for w in warnings:
            lines.append(f"- {w}")
        lines.append("")

    lines.append("## Agents")
    lines.append("")
    lines += _render_table(agent_slugs, "agent", coverage)
    lines.append("")

    lines.append("## Skills")
    lines.append("")
    lines += _render_table(skill_slugs, "skill", coverage)
    lines.append("")

    lines.append("## Dangling targets")
    lines.append("")
    if dangling:
        lines.append(
            "Case files reference a `target:` slug with no matching agent or skill "
            "directory:"
        )
        lines.append("")
        lines.append("| Target | Case files |")
        lines.append("|---|---|")
        for slug in dangling:
            files = coverage[slug]
            links = ", ".join(f"[{f}](cases/{f})" for f in files)
            lines.append(f"| {slug} | {links} |")
    else:
        lines.append("None.")
    lines.append("")

    lines.append("## How to regenerate")
    lines.append("")
    lines.append(f"`{regen_cmd}`")
    lines.append("")

    return "\n".join(lines) + "\n"


def _normalize_for_diff(text: str) -> str:
    """Strip the generation-timestamp line so --check compares substance,
    not wall-clock time. A file regenerated a minute later with identical
    coverage must still be considered up to date."""
    return _TIMESTAMP_LINE_RE.sub("_Generated <timestamp> by `<cmd>`._", text)


def _self_test() -> int:
    import tempfile

    fixed_now = datetime.datetime(2026, 1, 1, 0, 0, tzinfo=datetime.timezone.utc)

    def make_tree(tmp_path: Path) -> tuple[Path, Path, Path]:
        agents_dir = tmp_path / "agents"
        skills_dir = tmp_path / "skills"
        cases_dir = tmp_path / "cases"
        (agents_dir / "agent-one").mkdir(parents=True)
        (agents_dir / "agent-two").mkdir(parents=True)
        (skills_dir / "skill-one").mkdir(parents=True)
        cases_dir.mkdir(parents=True)
        return agents_dir, skills_dir, cases_dir

    # --- Happy path: 2 agents, 1 skill, 1 case targeting agent-one -> 1/3 ---
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        agents_dir, skills_dir, cases_dir = make_tree(tmp_path)
        (cases_dir / "case-happy.md").write_text(
            "---\n"
            "slug: case-happy\n"
            "target: agent-one\n"
            "targetType: agent\n"
            "---\n"
            "body text\n",
            encoding="utf-8",
        )

        coverage, warnings = collect_cases(cases_dir)
        assert coverage == {"agent-one": ["case-happy.md"]}, coverage
        assert warnings == [], warnings

        md = generate_coverage_markdown(agents_dir, skills_dir, cases_dir, now=fixed_now)
        assert "**1 covered of 3 total targets** (1 case files)" in md, md
        assert "GENERATED by bin/_possiblaw_eval_coverage.py" in md
        assert "[case-happy.md](cases/case-happy.md)" in md
        assert "| agent-one | agent | [case-happy.md](cases/case-happy.md) | 1 |" in md
        assert "| agent-two | agent | — | 0 |" in md
        assert "| skill-one | skill | — | 0 |" in md
        assert "## Warnings" not in md
        assert "None." in md  # empty Dangling targets section

    # --- Edge: target names a nonexistent slug -> Dangling targets section ---
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        agents_dir, skills_dir, cases_dir = make_tree(tmp_path)
        (cases_dir / "case-dangling.md").write_text(
            "---\n"
            "slug: case-dangling\n"
            "target: ghost-agent\n"
            "targetType: agent\n"
            "---\n",
            encoding="utf-8",
        )

        md = generate_coverage_markdown(agents_dir, skills_dir, cases_dir, now=fixed_now)
        assert "**0 covered of 3 total targets** (1 case files)" in md, md
        assert "## Dangling targets" in md
        assert "| ghost-agent | [case-dangling.md](cases/case-dangling.md) |" in md
        assert "None." not in md.split("## Dangling targets", 1)[1][:60]

        # --write always succeeds (exit 0) even with dangling targets present;
        # --check must still mention dangling targets in its summary.
        coverage_path = tmp_path / "COVERAGE.md"
        coverage_path.write_text(md, encoding="utf-8")
        later = generate_coverage_markdown(
            agents_dir,
            skills_dir,
            cases_dir,
            now=fixed_now + datetime.timedelta(minutes=5),
        )
        # Same substance, different timestamp -> --check must treat as unchanged.
        assert _normalize_for_diff(coverage_path.read_text(encoding="utf-8")) == _normalize_for_diff(
            later
        )
        assert "ghost-agent" in later  # --check's diff base still names the dangling target

    # --- Failure: malformed frontmatter (no target field) -> warning, no crash ---
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        agents_dir, skills_dir, cases_dir = make_tree(tmp_path)
        (cases_dir / "case-bad.md").write_text(
            "---\nslug: case-bad\ninput_brief: hello\n---\nbody\n", encoding="utf-8"
        )

        coverage, warnings = collect_cases(cases_dir)
        assert coverage == {}, coverage
        assert len(warnings) == 1 and "case-bad.md" in warnings[0], warnings

        md = generate_coverage_markdown(agents_dir, skills_dir, cases_dir, now=fixed_now)
        assert "**0 covered of 3 total targets** (1 case files)" in md, md
        assert "## Warnings" in md
        assert "case-bad.md" in md
        assert "no 'target:' field" in md

    # --- No frontmatter at all -> same warning path, no crash ---
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        agents_dir, skills_dir, cases_dir = make_tree(tmp_path)
        (cases_dir / "case-no-fm.md").write_text("just a plain markdown file\n", encoding="utf-8")
        coverage, warnings = collect_cases(cases_dir)
        assert coverage == {}
        assert len(warnings) == 1 and "case-no-fm.md" in warnings[0]

    # --- List-form target: target:\n  - slug-a\n  - slug-b ---
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        agents_dir, skills_dir, cases_dir = make_tree(tmp_path)
        (cases_dir / "case-list.md").write_text(
            "---\nslug: case-list\ntarget:\n  - agent-one\n  - agent-two\n---\n",
            encoding="utf-8",
        )
        coverage, warnings = collect_cases(cases_dir)
        assert coverage == {"agent-one": ["case-list.md"], "agent-two": ["case-list.md"]}, coverage
        assert warnings == []

    # --- Empty / missing directories don't crash ---
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        empty_agents = tmp_path / "no-agents"
        empty_skills = tmp_path / "no-skills"
        empty_cases = tmp_path / "no-cases"
        md = generate_coverage_markdown(empty_agents, empty_skills, empty_cases, now=fixed_now)
        assert "**0 covered of 0 total targets** (0 case files)" in md, md

    print("OK: _possiblaw_eval_coverage self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--write", action="store_true", help="write the generated markdown to COVERAGE.md"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "exit 1 if COVERAGE.md on disk differs from freshly generated content "
            "(ignoring the generation-timestamp line); CI-friendly"
        ),
    )
    parser.add_argument(
        "--self-test", action="store_true", help="run built-in tests against synthetic fixtures and exit"
    )
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    generated = generate_coverage_markdown(AGENTS_DIR, SKILLS_DIR, CASES_DIR)

    if args.write:
        COVERAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
        COVERAGE_PATH.write_text(generated, encoding="utf-8")
        print(f"wrote {COVERAGE_PATH}")
        return 0

    if args.check:
        if not COVERAGE_PATH.is_file():
            print(f"error: {COVERAGE_PATH} does not exist; run --write first", file=sys.stderr)
            return 1
        disk_text = COVERAGE_PATH.read_text(encoding="utf-8")
        coverage, _warnings = collect_cases(CASES_DIR)
        known = set(list_targets(AGENTS_DIR)) | set(list_targets(SKILLS_DIR))
        dangling_count = len([t for t in coverage if t not in known])
        if _normalize_for_diff(disk_text) != _normalize_for_diff(generated):
            print(
                f"error: {COVERAGE_PATH} is stale (dangling targets: {dangling_count}); "
                f"run: {REGEN_CMD}",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {COVERAGE_PATH} up to date (dangling targets: {dangling_count})")
        return 0

    print(generated)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
