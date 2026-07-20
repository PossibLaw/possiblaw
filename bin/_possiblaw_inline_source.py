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
import re
import sys
import tempfile
from pathlib import Path

# Firm-memory skill overlay markers.
FIRM_MEMORY_START = "<!-- FIRM-MEMORY-BODY -->"
FIRM_MEMORY_END = "<!-- /FIRM-MEMORY-BODY -->"

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

# --- Team subset import (--include-teams) -----------------------------------
# A "team" is a practice/business lead plus its specialists. Valid team names
# are lead slugs minus the "-lead" suffix, for leads reporting to a chief.
# These agents ship in EVERY subset (executive routers, the builder, and the
# meta-review trio routed across teams):
CHIEF_SLUGS = ("chief-of-staff", "chief-counsel")
ALWAYS_INCLUDE_SLUGS = CHIEF_SLUGS + (
    "firm-facade-recorder", "capability-builder", "risk-spotter",
    "debate-judge", "reconciler",
)
LEAD_SUFFIX = "-lead"

_FRONTMATTER_RE = re.compile(r"\A---\n(.*?)\n---", re.S)


def _parse_agent_frontmatter(text: str) -> dict | None:
    """Extract slug / reportsTo / skills from an AGENTS.md frontmatter."""
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return None
    fm = m.group(1)
    slug = re.search(r"^slug:\s*(\S+)\s*$", fm, re.M)
    if not slug:
        return None
    reports = re.search(r"^reportsTo:\s*(\S+)\s*$", fm, re.M)
    skills: list[str] = []
    in_skills = False
    for line in fm.splitlines():
        if re.match(r"^skills:\s*$", line):
            in_skills = True
            continue
        if in_skills:
            item = re.match(r"^  - (\S+)\s*$", line)
            if item:
                skills.append(item.group(1))
            else:
                in_skills = False
    return {
        "slug": slug.group(1),
        "reportsTo": reports.group(1) if reports else None,
        "skills": skills,
    }


def _collect_agents(files: dict[str, object]) -> dict[str, dict]:
    """Parse every bundled agents/<slug>/AGENTS.md frontmatter."""
    agents: dict[str, dict] = {}
    for rel, content in files.items():
        parts = rel.split("/")
        if len(parts) == 3 and parts[0] == "agents" and parts[2] == "AGENTS.md":
            if not isinstance(content, str):
                continue
            meta = _parse_agent_frontmatter(content)
            if meta:
                agents[parts[1]] = meta
    return agents


def _valid_teams(agents: dict[str, dict]) -> dict[str, str]:
    """Map team name -> lead slug for leads reporting to a chief."""
    teams: dict[str, str] = {}
    for slug, meta in agents.items():
        if slug.endswith(LEAD_SUFFIX) and meta.get("reportsTo") in CHIEF_SLUGS:
            teams[slug[: -len(LEAD_SUFFIX)]] = slug
    return teams


def list_teams_from_root(package_root: Path) -> list[str]:
    files = {rel: _encode_file(abs_path) for rel, abs_path in _iter_files(Path(package_root))}
    return sorted(_valid_teams(_collect_agents(files)))


def _compute_subset(files: dict[str, object], include_teams: list[str]) -> tuple[set, set]:
    """Return (included agent slugs, included skill slugs) for the teams."""
    agents = _collect_agents(files)
    teams = _valid_teams(agents)
    unknown = sorted(set(include_teams) - set(teams))
    if unknown:
        raise ValueError(
            f"unknown team(s): {', '.join(unknown)}; valid teams: {', '.join(sorted(teams))}"
        )

    included = {s for s in ALWAYS_INCLUDE_SLUGS if s in agents}
    included.update(teams[t] for t in include_teams)
    # Transitive closure over reportsTo so every specialist follows its lead.
    # Chiefs do NOT expand the set — their direct reports are exactly the
    # leads (selected explicitly above) and the always-include roles.
    expandable = included - set(CHIEF_SLUGS)
    changed = True
    while changed:
        changed = False
        for slug, meta in agents.items():
            if slug not in included and meta.get("reportsTo") in expandable:
                included.add(slug)
                expandable.add(slug)
                changed = True

    referenced_by_included: set = set()
    referenced_by_anyone: set = set()
    for slug, meta in agents.items():
        referenced_by_anyone.update(meta["skills"])
        if slug in included:
            referenced_by_included.update(meta["skills"])
    skills_on_disk = {rel.split("/")[1] for rel in files if rel.startswith("skills/")}
    base_skills = skills_on_disk - referenced_by_anyone  # attached to nobody: always ship
    included_skills = (referenced_by_included & skills_on_disk) | base_skills
    return included, included_skills


def _filter_sidecar(text: str, included_agents: set) -> str:
    """Drop excluded agents from the sidecar's `agents:` mapping and
    `sidebar.agents` list. Pure text transform — the sidecar is generated
    from a uniform template (2-space slug keys, 4-space sidebar items), and
    this helper is stdlib-only by contract."""
    out: list[str] = []
    section = None          # current top-level key
    dropping_block = False  # inside an excluded agents.<slug> block
    in_sidebar_agents = False
    for line in text.splitlines(keepends=True):
        top = re.match(r"^([A-Za-z_][A-Za-z0-9_-]*):", line)
        if top:
            section = top.group(1)
            dropping_block = False
            in_sidebar_agents = False
            out.append(line)
            continue
        if section == "agents":
            block = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", line)
            if block:
                dropping_block = block.group(1) not in included_agents
            if dropping_block:
                continue
        elif section == "sidebar":
            if re.match(r"^  agents:\s*$", line):
                in_sidebar_agents = True
                out.append(line)
                continue
            if in_sidebar_agents:
                item = re.match(r"^    - (\S+)\s*$", line)
                if item:
                    if item.group(1) not in included_agents:
                        continue
                else:
                    in_sidebar_agents = False
        out.append(line)
    return "".join(out)


def apply_firm_memory(files: dict, memory_text: str) -> dict:
    """Replace the firm-memory skill body between the markers with memory_text.

    Preserves the head (everything up to and including FIRM_MEMORY_START),
    replaces the body between the markers, and keeps the tail (from
    FIRM_MEMORY_END onward). Returns a new dict (shallow copy of files) —
    the caller's dict is never mutated. Returns files unchanged if the key
    or markers are absent.
    """
    files = dict(files)
    key = "skills/firm-memory/SKILL.md"
    src = files.get(key)
    if src is None:
        return files
    start = src.find(FIRM_MEMORY_START)
    end = src.find(FIRM_MEMORY_END)
    if start == -1 or end == -1 or end < start:
        return files
    head = src[: start + len(FIRM_MEMORY_START)]
    tail = src[end:]
    files[key] = head + "\n" + memory_text.rstrip("\n") + "\n" + tail
    return files


def build_inline_source(
    package_root: Path,
    extra_roots: list[Path] | None = None,
    include_teams: list[str] | None = None,
    business_overlay_root: Path | None = None,
) -> dict:
    if not package_root.exists():
        raise ValueError(f"package root does not exist: {package_root}")
    if not package_root.is_dir():
        raise ValueError(f"package root is not a directory: {package_root}")

    files: dict[str, object] = {}
    for rel, abs_path in _iter_files(package_root):
        files[rel] = _encode_file(abs_path)

    if include_teams is not None:
        included_agents, included_skills = _compute_subset(files, include_teams)
        kept: dict[str, object] = {}
        for rel, content in files.items():
            parts = rel.split("/")
            if parts[0] == "agents" and len(parts) > 1 and parts[1] not in included_agents:
                continue
            if parts[0] == "skills" and len(parts) > 1 and parts[1] not in included_skills:
                continue
            if rel == ".paperclip.yaml" and isinstance(content, str):
                content = _filter_sidecar(content, included_agents)
            kept[rel] = content
        files = kept
        print(
            f"subset: teams={','.join(include_teams)} "
            f"agents={len(included_agents)} skills={len(included_skills)}",
            file=sys.stderr,
        )

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

    if business_overlay_root is not None:
        overlay_dir = Path(business_overlay_root) / "skill-overlays"
        if overlay_dir.is_dir():
            for slug_dir in sorted(p for p in overlay_dir.iterdir() if p.is_dir()):
                overlay_file = slug_dir / "SKILL.md"
                if not overlay_file.is_file():
                    continue
                rel = f"skills/{slug_dir.name}/SKILL.md"
                if rel not in files:
                    raise ValueError(
                        f"skill overlay for unknown package skill '{slug_dir.name}' "
                        f"(no {rel} in package)"
                    )
                files[rel] = _encode_file(overlay_file)
                print(f"overlay: {rel} <- business {Path(business_overlay_root).name}", file=sys.stderr)

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

        # --- skill-overlay override pass ---
        (root / "skills" / "demo-skill").mkdir(parents=True)
        (root / "skills" / "demo-skill" / "SKILL.md").write_text("BASE\n", encoding="utf-8")
        biz = Path(td) / "biz"
        (biz / "skill-overlays" / "demo-skill").mkdir(parents=True)
        (biz / "skill-overlays" / "demo-skill" / "SKILL.md").write_text("OVERLAID\n", encoding="utf-8")
        out = build_inline_source(root, business_overlay_root=biz)
        body = out["source"]["files"]["skills/demo-skill/SKILL.md"]
        assert body == "OVERLAID\n", f"overlay not applied: {body!r}"

        (biz / "skill-overlays" / "ghost").mkdir(parents=True)
        (biz / "skill-overlays" / "ghost" / "SKILL.md").write_text("X\n", encoding="utf-8")
        raised = False
        try:
            build_inline_source(root, business_overlay_root=biz)
        except ValueError:
            raised = True
        assert raised, "unknown overlay slug must raise"
        print("OK: skill-overlay override pass")

    _self_test_teams()

    # firm-memory overlay
    files = {"skills/firm-memory/SKILL.md": "a\n<!-- FIRM-MEMORY-BODY -->\nOLD\n<!-- /FIRM-MEMORY-BODY -->\nz\n"}
    original_files = dict(files)  # pre-call copy for purity check
    out = apply_firm_memory(files, "- (nda) cap indemnity at fees paid\n")
    assert "cap indemnity at fees paid" in out["skills/firm-memory/SKILL.md"]
    assert "OLD" not in out["skills/firm-memory/SKILL.md"]
    assert out["skills/firm-memory/SKILL.md"].startswith("a\n")
    # Purity: original input dict must be unchanged.
    assert files == original_files, "apply_firm_memory mutated the caller's dict"

    # No-op guard: key absent — returns files unchanged (same content).
    files_no_key = {"other/file.md": "content"}
    out_no_key = apply_firm_memory(files_no_key, "x")
    assert out_no_key == files_no_key, "apply_firm_memory should return files unchanged when key is absent"

    # No-op guard: key present but markers absent — content returned unchanged.
    files_no_markers = {"skills/firm-memory/SKILL.md": "no markers here\n"}
    out_no_markers = apply_firm_memory(files_no_markers, "x")
    assert out_no_markers["skills/firm-memory/SKILL.md"] == "no markers here\n", \
        "apply_firm_memory should leave content unchanged when markers are absent"

    # Idempotency: applying the same memory_text twice yields the same result.
    mem = "- (nda) cap indemnity at fees paid\n"
    out1 = apply_firm_memory(files, mem)
    out2 = apply_firm_memory(out1, mem)
    assert out1["skills/firm-memory/SKILL.md"] == out2["skills/firm-memory/SKILL.md"], \
        "apply_firm_memory is not idempotent"

    print("OK: _possiblaw_inline_source self-test passed")
    return 0


def _write_agent(root: Path, slug: str, reports_to: str | None, skills: list[str]) -> None:
    lines = ["---", f"name: {slug}", "kind: agent", f"slug: {slug}", f"title: {slug}"]
    if reports_to:
        lines.append(f"reportsTo: {reports_to}")
    if skills:
        lines.append("skills:")
        lines.extend(f"  - {s}" for s in skills)
    lines += ["---", "", f"You are {slug}.", ""]
    d = root / "agents" / slug
    d.mkdir(parents=True)
    (d / "AGENTS.md").write_text("\n".join(lines), encoding="utf-8")


def _self_test_teams() -> None:
    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / "pkg"
        root.mkdir(parents=True)

        # Org: chiefs + one meta-reviewer + builder (always included) +
        # two teams (alpha, beta) with one specialist each.
        _write_agent(root, "chief-of-staff", None, ["skill-base-attach"])
        _write_agent(root, "chief-counsel", "chief-of-staff", [])
        _write_agent(root, "firm-facade-recorder", "chief-of-staff", [])
        _write_agent(root, "risk-spotter", "chief-counsel", ["skill-meta"])
        _write_agent(root, "capability-builder", "chief-of-staff", [])
        _write_agent(root, "alpha-lead", "chief-counsel", ["skill-alpha-lead"])
        _write_agent(root, "alpha-drafter", "alpha-lead", ["skill-alpha-draft", "skill-shared"])
        _write_agent(root, "beta-lead", "chief-of-staff", [])
        _write_agent(root, "beta-runner", "beta-lead", ["skill-beta-run", "skill-shared"])
        for skill in (
            "skill-base-attach", "skill-meta", "skill-alpha-lead",
            "skill-alpha-draft", "skill-beta-run", "skill-shared",
            "skill-unattached",  # base skill: referenced by nobody
        ):
            d = root / "skills" / skill
            d.mkdir(parents=True)
            (d / "SKILL.md").write_text(f"---\nname: {skill}\n---\nbody\n", encoding="utf-8")
        sidecar = "\n".join([
            "schema: paperclip/v1",
            "company:",
            "  brandColor: \"#F97316\"",
            "agents:",
        ] + [
            f"  {slug}:\n    role: r\n    adapter:\n      type: codex_local"
            for slug in (
                "chief-of-staff", "chief-counsel", "firm-facade-recorder",
                "risk-spotter", "capability-builder",
                "alpha-lead", "alpha-drafter", "beta-lead", "beta-runner",
            )
        ] + [
            "sidebar:",
            "  agents:",
            "    - chief-of-staff",
            "    - chief-counsel",
            "    - firm-facade-recorder",
            "    - risk-spotter",
            "    - capability-builder",
            "    - alpha-lead",
            "    - alpha-drafter",
            "    - beta-lead",
            "    - beta-runner",
            "projects:",
            "  demo:",
            "    leadAgentSlug: chief-of-staff",
            "",
        ])
        (root / ".paperclip.yaml").write_text(sidecar, encoding="utf-8")
        (root / "COMPANY.md").write_text("---\nname: T\nslug: t\n---\nbody\n", encoding="utf-8")

        # list_teams: leads are *-lead reporting to a chief; meta/builder excluded.
        teams = list_teams_from_root(root)
        assert teams == ["alpha", "beta"], teams

        # Closure: alpha only -> chiefs + meta + builder + alpha team; beta gone.
        out = build_inline_source(root, include_teams=["alpha"])
        files = out["source"]["files"]
        agent_dirs = {k.split("/")[1] for k in files if k.startswith("agents/")}
        assert agent_dirs == {
            "chief-of-staff", "chief-counsel", "firm-facade-recorder",
            "risk-spotter", "capability-builder",
            "alpha-lead", "alpha-drafter",
        }, agent_dirs

        # Skill closure: included agents' refs + unattached base skill; beta-only skills gone.
        skill_dirs = {k.split("/")[1] for k in files if k.startswith("skills/")}
        assert skill_dirs == {
            "skill-base-attach", "skill-meta", "skill-alpha-lead",
            "skill-alpha-draft", "skill-shared", "skill-unattached",
        }, skill_dirs

        # Sidecar filter consistency: agents: blocks == bundled agent dirs == sidebar entries.
        side = files[".paperclip.yaml"]
        assert isinstance(side, str)
        import re as _re
        side_agents = set(_re.findall(r"^  ([A-Za-z0-9_-]+):", side.split("sidebar:")[0].split("agents:")[1], _re.M))
        assert side_agents == agent_dirs, (side_agents, agent_dirs)
        sidebar_entries = set(_re.findall(r"^    - (\S+)", side.split("sidebar:")[1].split("projects:")[0], _re.M))
        assert sidebar_entries == agent_dirs, (sidebar_entries, agent_dirs)
        # Non-agent sections survive untouched.
        assert "leadAgentSlug: chief-of-staff" in side
        assert "brandColor" in side
        assert "schema: paperclip/v1" in side

        # COMPANY.md and other root files are never filtered.
        assert "COMPANY.md" in files

        # Both teams = same as full catalog for this synthetic package.
        out_all = build_inline_source(root, include_teams=["alpha", "beta"])
        assert {k for k in out_all["source"]["files"]} == {
            k for k in build_inline_source(root)["source"]["files"]
        }

        # Unknown team -> ValueError naming the valid slugs.
        try:
            build_inline_source(root, include_teams=["alpha", "gamma"])
        except ValueError as e:
            assert "gamma" in str(e) and "alpha" in str(e) and "beta" in str(e), e
        else:
            raise AssertionError("unknown team must raise ValueError")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--package-root", help="path to the package directory to bundle")
    parser.add_argument(
        "--extra-root",
        action="append",
        default=[],
        help="extra directory whose PROJECT.md/TASK.md files merge into the bundle (repeatable; demo overlays)",
    )
    parser.add_argument(
        "--include-teams",
        help="comma-separated team names (lead slugs without the -lead suffix); "
        "bundle only those teams plus chiefs, the capability builder, and the meta-reviewers",
    )
    parser.add_argument(
        "--list-teams",
        action="store_true",
        help="print valid team names for --include-teams (one per line) and exit",
    )
    parser.add_argument(
        "--firm-memory-file",
        help="path to a firm-memory.md file; overlays its content into the "
        "skills/firm-memory/SKILL.md body between the <!-- FIRM-MEMORY-BODY --> markers",
    )
    parser.add_argument(
        "--business-overlay-root",
        default=None,
        help="business dir whose skill-overlays/<slug>/SKILL.md replace package skills at import",
    )
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not args.package_root:
        parser.error("--package-root is required")

    if args.list_teams:
        for team in list_teams_from_root(Path(args.package_root)):
            print(team)
        return 0

    include_teams = None
    if args.include_teams:
        include_teams = [t.strip() for t in args.include_teams.split(",") if t.strip()]
        if not include_teams:
            print("error: --include-teams given but no team names parsed", file=sys.stderr)
            return 2

    try:
        payload = build_inline_source(
            Path(args.package_root),
            extra_roots=[Path(p) for p in args.extra_root],
            include_teams=include_teams,
            business_overlay_root=(Path(args.business_overlay_root) if args.business_overlay_root else None),
        )
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    if args.firm_memory_file:
        fm_path = Path(args.firm_memory_file)
        if not fm_path.is_file():
            print(f"error: --firm-memory-file not found: {fm_path}", file=sys.stderr)
            return 2
        memory_text = fm_path.read_text(encoding="utf-8")
        payload["source"]["files"] = apply_firm_memory(
            payload["source"]["files"], memory_text
        )

    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
