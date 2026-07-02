#!/usr/bin/env python3
"""License-gated, default-deny vendoring tool for external SKILL.md sources.

PossibLaw is Apache-2.0. Some external skill catalogs mix licenses freely —
part of the catalog this tool was built against is AGPL-3.0 and roughly a
sixth of its skills carry no license at all. Vendoring one of those
carelessly breaks PossibLaw's licensing posture. This tool is the gate:
license detection happens BEFORE any filesystem write, and refusal is
always all-or-nothing (never a partial copy).

Usage:
  python3 bin/_possiblaw_vendor_skill.py <src-skill-dir> <dest-skill-slug> \\
      [--catalog-license <SPDX>] --attribution "<text>" [--dry-run]

Positional args:
  src-skill-dir     path to the external skill's source directory (must
                     contain a SKILL.md)
  dest-skill-slug   destination slug; the skill lands at
                     companies/legal-operations/skills/<dest-skill-slug>/

License detection, in priority order (first hit wins):
  1. SKILL.md frontmatter `metadata.license` (nested under `metadata:`)
  2. SKILL.md frontmatter top-level `license:`
  3. a LICENSE* / COPYING* file in the skill dir (SPDX-License-Identifier
     line first, then a conservative full-text heuristic for the same
     license families as the allowlist below, plus AGPL/CC-BY-NC for a
     clearer refusal message; unrecognized LICENSE-file text refuses as
     "unrecognized-license-text" rather than silently falling through to
     --catalog-license, because the file's mere presence is skill-specific
     licensing information)
  4. --catalog-license (the repo-wide LICENSE the CALLER has verified for
     the whole source catalog; used only when the skill itself carries no
     license signal at all)

No signal found anywhere -> REFUSE, exit 2 ("unlicensed = all rights
reserved").

Allowlist (exact SPDX id): Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause,
CC-BY-4.0. Anything else (AGPL-3.0, CC-BY-NC-*, proprietary, unrecognized
strings) -> REFUSE, exit 2, naming the detected license/source.

On allow: --attribution is REQUIRED (who/where this content is from). No
attribution -> REFUSE, exit 2. Otherwise SKILL.md plus any references/,
scripts/, evals/ subdirs are copied verbatim into
companies/legal-operations/skills/<dest-skill-slug>/, and the destination
copy of SKILL.md gets a house `metadata.sources` entry injected/merged
(any sources already declared upstream are preserved verbatim; this tool
only appends its own entry):

  metadata:
    sources:
      - path: <src-skill-dir>/SKILL.md
        kind: github
        usage: vendored
        license: <detected SPDX>
        attribution: <--attribution value>

The destination directory must not already exist (refuse, exit 3, never
overwrite). The source is never modified.

--dry-run prints the decision and the would-copy list; nothing is written
(the exit code still reflects what a real run would do).

Exit codes: 0 vendored (or a clean --dry-run decision); 1 usage/format
error (bad src dir, missing SKILL.md, malformed frontmatter, invalid
dest slug); 2 refused on licensing grounds (unlicensed, disallowed
license, or missing --attribution); 3 destination already exists.

Self-test: `python3 bin/_possiblaw_vendor_skill.py --self-test`.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEST_SKILLS_ROOT = REPO_ROOT / "companies" / "legal-operations" / "skills"

ALLOWED_LICENSES = {"Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause", "CC-BY-4.0"}
VENDOR_SUBDIRS = ("references", "scripts", "evals")
_LICENSE_BASENAME_PREFIXES = ("LICENSE", "COPYING")
_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


# --- frontmatter block splitting (hand-rolled, narrow scanner — no PyYAML;
# matches the house style of bin/_possiblaw_eval_coverage.py) -------------


def _split_frontmatter(text: str) -> tuple[list[str], str] | None:
    """Split `text` into (frontmatter body lines, tail-from-closing-delim-on).

    Tail includes the closing '---' line itself plus the body, so
    reconstruction is: '---\\n' + ''.join(new_frontmatter_lines) + tail.
    Returns None if there is no well-formed '---' ... '---' header.
    """
    lines = text.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\n") != "---":
        return None
    for i in range(1, len(lines)):
        if lines[i].rstrip("\n") == "---":
            return lines[1:i], "".join(lines[i:])
    return None


def _split_blocks(lines: list[str], indent: int) -> list[tuple[str | None, list[str]]]:
    """Split a flat run of lines into (key, block_lines) pairs.

    A new block starts at each line matching exactly `indent` spaces then
    `key:`; block_lines holds that line plus every following line until the
    next such key line. Any lines before the first matching key line form a
    leading (key=None) preamble block, so nothing is ever silently dropped.
    """
    key_re = re.compile(rf"^{' ' * indent}([A-Za-z_][\w-]*):")
    blocks: list[tuple[str | None, list[str]]] = []
    current_key: str | None = None
    current_lines: list[str] = []
    for line in lines:
        m = key_re.match(line)
        if m:
            if current_lines:
                blocks.append((current_key, current_lines))
            current_key = m.group(1)
            current_lines = [line]
        else:
            current_lines.append(line)
    if current_lines:
        blocks.append((current_key, current_lines))
    return blocks


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def _scalar_value(key_line: str, key: str) -> str | None:
    m = re.match(rf"^\s*{re.escape(key)}:\s*(.*?)\s*$", key_line.rstrip("\n"))
    if not m:
        return None
    value = m.group(1).strip()
    return _strip_quotes(value) if value else None


def _frontmatter_top_scalar(fm_lines: list[str], key: str) -> str | None:
    for k, block in _split_blocks(fm_lines, 0):
        if k == key:
            val = _scalar_value(block[0], key)
            if val:
                return val
    return None


def _frontmatter_nested_scalar(fm_lines: list[str], parent_key: str, key: str) -> str | None:
    for k, block in _split_blocks(fm_lines, 0):
        if k == parent_key:
            for kk, subblock in _split_blocks(block[1:], 2):
                if kk == key:
                    val = _scalar_value(subblock[0], key)
                    if val:
                        return val
    return None


_UNSAFE_SCALAR_RE = re.compile(r'[:#\'"\[\]{}]|^[\s\-?&*!|>%@`]')


def _yaml_scalar(value: str) -> str:
    """Render a plain-scalar-or-quoted value safely for hand-written YAML."""
    if value == "" or value.strip() != value or _UNSAFE_SCALAR_RE.search(value):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def _render_source_entry(path: str, license_id: str, attribution: str) -> list[str]:
    return [
        f"    - path: {_yaml_scalar(path)}\n",
        "      kind: github\n",
        "      usage: vendored\n",
        f"      license: {_yaml_scalar(license_id)}\n",
        f"      attribution: {_yaml_scalar(attribution)}\n",
    ]


def _inject_into_metadata_block(block_lines: list[str], entry_lines: list[str]) -> list[str]:
    header, rest = block_lines[0], block_lines[1:]
    out = [header]
    sub_blocks = _split_blocks(rest, 2)
    found_sources = False
    for key, sub_lines in sub_blocks:
        if key == "sources":
            found_sources = True
            sub_lines = sub_lines + entry_lines
        out.extend(sub_lines)
    if not found_sources:
        out.append("  sources:\n")
        out.extend(entry_lines)
    return out


def inject_sources_block(text: str, *, path: str, license_id: str, attribution: str) -> str:
    """Return `text` (a SKILL.md's full content) with a house metadata.sources
    entry (kind: github, usage: vendored) appended. Any existing
    frontmatter keys — including a pre-existing metadata.sources list — are
    preserved verbatim; this only ever adds, never rewrites, an entry. The
    body (everything after the closing '---') is untouched.
    """
    split = _split_frontmatter(text)
    if split is None:
        raise ValueError("SKILL.md has no '---' YAML frontmatter delimiters")
    fm_lines, tail = split
    entry_lines = _render_source_entry(path, license_id, attribution)

    top_blocks = _split_blocks(fm_lines, 0)
    rebuilt: list[str] = []
    found_metadata = False
    for key, block_lines in top_blocks:
        if key == "metadata":
            found_metadata = True
            block_lines = _inject_into_metadata_block(block_lines, entry_lines)
        rebuilt.extend(block_lines)
    if not found_metadata:
        rebuilt.append("metadata:\n")
        rebuilt.append("  sources:\n")
        rebuilt.extend(entry_lines)

    return "---\n" + "".join(rebuilt) + tail


# --- license detection -----------------------------------------------------

_SPDX_LINE_RE = re.compile(r"^\s*SPDX-License-Identifier:\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE)

# Conservative full-text markers: ALL substrings in a tuple must be present
# (case-insensitive) for a match. Order matters — more specific patterns
# (e.g. BSD-3's endorse/promote clause) are checked before the more generic
# patterns they'd otherwise also match (BSD-2). A miss here just falls
# through to "unrecognized-license-text" (fail closed), never a default
# allow, so an incomplete marker table can only cause extra refusals, not
# incorrect allows.
_LICENSE_TEXT_MARKERS: list[tuple[str, tuple[str, ...]]] = [
    ("AGPL-3.0", ("gnu affero general public license", "version 3")),
    ("CC-BY-NC-4.0", ("creativecommons.org/licenses/by-nc",)),
    ("Apache-2.0", ("apache license", "version 2.0")),
    (
        "BSD-3-Clause",
        (
            "redistribution and use in source and binary forms",
            "may be used to endorse or promote products derived from this software",
        ),
    ),
    ("BSD-2-Clause", ("redistribution and use in source and binary forms",)),
    ("CC-BY-4.0", ("creativecommons.org/licenses/by/4.0",)),
    (
        "MIT",
        (
            "permission is hereby granted, free of charge",
            'the software is provided "as is"',
        ),
    ),
]


def _detect_spdx_from_license_text(text: str) -> str | None:
    m = _SPDX_LINE_RE.search(text)
    if m:
        return m.group(1).strip()
    # Collapse whitespace runs (real LICENSE files are line-wrapped, so a
    # marker phrase can legitimately span a line break) before substring
    # matching against the marker table.
    lowered = re.sub(r"\s+", " ", text.lower())
    for spdx, markers in _LICENSE_TEXT_MARKERS:
        if all(marker in lowered for marker in markers):
            return spdx
    return None


def _find_license_file(skill_dir: Path) -> Path | None:
    if not skill_dir.is_dir():
        return None
    candidates = sorted(
        p for p in skill_dir.iterdir()
        if p.is_file() and p.name.upper().startswith(_LICENSE_BASENAME_PREFIXES)
    )
    return candidates[0] if candidates else None


def decide_license(
    skill_dir: Path, fm_lines: list[str], catalog_license: str | None
) -> tuple[str | None, str]:
    """Return (detected_license_or_None, human-readable source description).

    detected_license may be a value outside ALLOWED_LICENSES (e.g.
    'AGPL-3.0' or 'unrecognized-license-text') — the allowlist check is the
    caller's job. None means no signal was found anywhere.
    """
    val = _frontmatter_nested_scalar(fm_lines, "metadata", "license")
    if val:
        return val, "SKILL.md frontmatter metadata.license"
    val = _frontmatter_top_scalar(fm_lines, "license")
    if val:
        return val, "SKILL.md frontmatter license"
    license_file = _find_license_file(skill_dir)
    if license_file is not None:
        text = license_file.read_text(encoding="utf-8", errors="replace")
        spdx = _detect_spdx_from_license_text(text)
        if spdx:
            return spdx, f"LICENSE file ({license_file.name})"
        return "unrecognized-license-text", (
            f"LICENSE file ({license_file.name}, SPDX identifier not recognized)"
        )
    if catalog_license:
        return catalog_license, "--catalog-license"
    return None, "none"


# --- copy planning -----------------------------------------------------


def plan_copy(src_dir: Path) -> list[str]:
    """Relative paths (posix, SKILL.md first) that vendoring will copy."""
    rels = ["SKILL.md"]
    for sub in VENDOR_SUBDIRS:
        sub_dir = src_dir / sub
        if sub_dir.is_dir():
            for path in sorted(p for p in sub_dir.rglob("*") if p.is_file()):
                rels.append(path.relative_to(src_dir).as_posix())
    return rels


def _do_copy(
    src_dir: Path, dest_dir: Path, rel_paths: list[str], *, license_id: str, attribution: str, source_path: str
) -> None:
    dest_dir.mkdir(parents=True, exist_ok=False)
    for rel in rel_paths:
        src_path = src_dir / rel
        dst_path = dest_dir / rel
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        if rel == "SKILL.md":
            text = src_path.read_text(encoding="utf-8")
            new_text = inject_sources_block(
                text, path=source_path, license_id=license_id, attribution=attribution
            )
            dst_path.write_text(new_text, encoding="utf-8")
        else:
            shutil.copy2(src_path, dst_path)


# --- core decision + action ------------------------------------------------


def vendor_skill(
    src_dir: Path,
    dest_skills_root: Path,
    dest_slug: str,
    *,
    catalog_license: str | None = None,
    attribution: str | None = None,
    dry_run: bool = False,
) -> dict:
    """Decide whether to vendor src_dir's SKILL.md into
    dest_skills_root/dest_slug/, and do it unless dry_run. Returns a result
    dict (exit_code / license / license_source / message / would_copy /
    dest_dir / wrote) so both the CLI and --self-test can inspect the
    outcome without going through argv or stdout parsing.
    """
    if not src_dir.is_dir():
        return _result(1, None, "none", f"src-skill-dir not found or not a directory: {src_dir}")
    skill_md = src_dir / "SKILL.md"
    if not skill_md.is_file():
        return _result(1, None, "none", f"no SKILL.md in src-skill-dir: {src_dir}")
    if not _SLUG_RE.match(dest_slug or ""):
        return _result(
            1, None, "none",
            f"invalid dest-skill-slug '{dest_slug}': must be lowercase kebab-case "
            "(e.g. 'my-new-skill')",
        )

    text = skill_md.read_text(encoding="utf-8")
    split = _split_frontmatter(text)
    if split is None:
        return _result(1, None, "none", f"SKILL.md has no '---' frontmatter: {skill_md}")
    fm_lines, _tail = split

    license_id, license_source = decide_license(src_dir, fm_lines, catalog_license)

    if license_id is None:
        return _result(
            2, None, license_source,
            "unlicensed = all rights reserved (no metadata.license/license in "
            "SKILL.md frontmatter, no LICENSE file, no --catalog-license); refusing to vendor",
        )
    if license_id not in ALLOWED_LICENSES:
        allowed = ", ".join(sorted(ALLOWED_LICENSES))
        return _result(
            2, license_id, license_source,
            f"license '{license_id}' (from {license_source}) is not on the vendoring "
            f"allowlist ({allowed}); refusing to vendor",
        )
    if not attribution:
        return _result(
            2, license_id, license_source,
            f"license '{license_id}' is allowed but --attribution is required to vendor; refusing",
        )

    would_copy = plan_copy(src_dir)
    dest_dir = dest_skills_root / dest_slug
    if dest_dir.exists():
        return _result(
            3, license_id, license_source,
            f"destination already exists, refusing to overwrite: {dest_dir}",
            would_copy=would_copy, dest_dir=dest_dir,
        )

    source_path = (src_dir / "SKILL.md").as_posix()
    if dry_run:
        return _result(
            0, license_id, license_source,
            f"[dry-run] license '{license_id}' (from {license_source}) allowed; "
            f"would copy {len(would_copy)} file(s) to {dest_dir}",
            would_copy=would_copy, dest_dir=dest_dir,
        )

    _do_copy(
        src_dir, dest_dir, would_copy,
        license_id=license_id, attribution=attribution, source_path=source_path,
    )
    return _result(
        0, license_id, license_source,
        f"license '{license_id}' (from {license_source}) allowed; "
        f"copied {len(would_copy)} file(s) to {dest_dir}",
        would_copy=would_copy, dest_dir=dest_dir, wrote=True,
    )


def _result(
    exit_code: int,
    license_id: str | None,
    license_source: str,
    message: str,
    *,
    would_copy: list[str] | None = None,
    dest_dir: Path | None = None,
    wrote: bool = False,
) -> dict:
    return {
        "exit_code": exit_code,
        "license": license_id,
        "license_source": license_source,
        "message": message,
        "would_copy": would_copy or [],
        "dest_dir": str(dest_dir) if dest_dir is not None else None,
        "wrote": wrote,
    }


# --- self-test ---------------------------------------------------------


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _self_test() -> int:
    import tempfile

    # --- (happy) MIT skill, license via top-level frontmatter `license:`,
    # vendored with a house metadata.sources block injected ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "happy-skill"
        _write(
            src / "SKILL.md",
            "---\n"
            "name: happy-skill\n"
            "description: A happy little skill.\n"
            "license: MIT\n"
            "---\n"
            "# Happy Skill\nBody text.\n",
        )
        _write(src / "references" / "notes.md", "reference notes\n")
        dest_root = td / "dest"
        before = (src / "SKILL.md").read_text(encoding="utf-8")

        result = vendor_skill(
            src, dest_root, "happy-skill-vendored", attribution="Example Catalog"
        )
        assert result["exit_code"] == 0, result
        assert result["license"] == "MIT", result
        assert result["license_source"] == "SKILL.md frontmatter license", result
        assert result["wrote"] is True
        dest_skill_md = dest_root / "happy-skill-vendored" / "SKILL.md"
        assert dest_skill_md.is_file()
        dest_text = dest_skill_md.read_text(encoding="utf-8")
        assert "metadata:" in dest_text
        assert "sources:" in dest_text
        assert "kind: github" in dest_text
        assert "usage: vendored" in dest_text
        assert "license: MIT" in dest_text
        assert "attribution: Example Catalog" in dest_text
        assert "# Happy Skill" in dest_text  # body preserved verbatim
        assert (dest_root / "happy-skill-vendored" / "references" / "notes.md").read_text(
            encoding="utf-8"
        ) == "reference notes\n"
        # Source untouched.
        assert (src / "SKILL.md").read_text(encoding="utf-8") == before
        print("OK: happy path (MIT via frontmatter, sources block injected)")

    # --- (edge) frontmatter metadata.license overrides a different
    # --catalog-license ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "override-skill"
        _write(
            src / "SKILL.md",
            "---\n"
            "name: override-skill\n"
            "description: Overrides the catalog license.\n"
            "metadata:\n"
            "  license: Apache-2.0\n"
            "---\n"
            "# Override Skill\n",
        )
        dest_root = td / "dest"
        result = vendor_skill(
            src, dest_root, "override-skill-vendored",
            catalog_license="MIT", attribution="Example Catalog",
        )
        assert result["exit_code"] == 0, result
        assert result["license"] == "Apache-2.0", result
        assert result["license_source"] == "SKILL.md frontmatter metadata.license", result
        dest_text = (dest_root / "override-skill-vendored" / "SKILL.md").read_text(encoding="utf-8")
        assert "license: Apache-2.0" in dest_text
        assert "license: MIT" not in dest_text
        print("OK: edge path (frontmatter metadata.license overrides --catalog-license)")

    # --- (failure) AGPL -> exit 2, nothing written ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "agpl-skill"
        _write(
            src / "SKILL.md",
            "---\nname: agpl-skill\ndescription: Copyleft skill.\nlicense: AGPL-3.0\n---\nbody\n",
        )
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "agpl-vendored", attribution="Example Catalog")
        assert result["exit_code"] == 2, result
        assert result["license"] == "AGPL-3.0"
        assert "not on the vendoring allowlist" in result["message"]
        assert not dest_root.exists() or not any(dest_root.iterdir())
        assert result["wrote"] is False
        print("OK: failure path (AGPL refused, exit 2, nothing written)")

    # --- (failure) unlicensed -> exit 2, "unlicensed = all rights reserved" ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "unlicensed-skill"
        _write(
            src / "SKILL.md",
            "---\nname: unlicensed-skill\ndescription: No license anywhere.\n---\nbody\n",
        )
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "unlicensed-vendored", attribution="Example Catalog")
        assert result["exit_code"] == 2, result
        assert result["license"] is None
        assert "unlicensed = all rights reserved" in result["message"], result["message"]
        assert not dest_root.exists() or not any(dest_root.iterdir())
        print("OK: failure path (unlicensed refused, exit 2, nothing written)")

    # --- attribution missing on an otherwise-allowed license -> exit 2, nothing written ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "no-attribution-skill"
        _write(
            src / "SKILL.md", "---\nname: no-attribution-skill\ndescription: d\nlicense: MIT\n---\nbody\n"
        )
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "no-attribution-vendored")
        assert result["exit_code"] == 2, result
        assert "attribution" in result["message"].lower()
        assert not dest_root.exists() or not any(dest_root.iterdir())
        print("OK: missing --attribution refused even though license is allowed")

    # --- destination already exists -> exit 3, refuse to overwrite ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "dup-skill"
        _write(src / "SKILL.md", "---\nname: dup-skill\ndescription: d\nlicense: MIT\n---\nbody\n")
        dest_root = td / "dest"
        _write(dest_root / "dup-vendored" / "SKILL.md", "already here\n")
        result = vendor_skill(src, dest_root, "dup-vendored", attribution="Cat")
        assert result["exit_code"] == 3, result
        assert "already exists" in result["message"]
        assert (dest_root / "dup-vendored" / "SKILL.md").read_text(encoding="utf-8") == "already here\n"
        print("OK: existing destination refused, exit 3, not overwritten")

    # --- --dry-run: mirrors the real decision, writes nothing ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "dry-skill"
        _write(src / "SKILL.md", "---\nname: dry-skill\ndescription: d\nlicense: MIT\n---\nbody\n")
        dest_root = td / "dest"
        result = vendor_skill(
            src, dest_root, "dry-vendored", attribution="Cat", dry_run=True
        )
        assert result["exit_code"] == 0, result
        assert result["wrote"] is False
        assert "would copy" in result["message"]
        assert result["would_copy"] == ["SKILL.md"]
        assert not dest_root.exists()
        # A refused dry-run also mirrors the real exit code/message, still writes nothing.
        result_bad = vendor_skill(src, dest_root, "dry-vendored-2", dry_run=True)  # no attribution
        assert result_bad["exit_code"] == 2, result_bad
        assert not dest_root.exists()
        print("OK: --dry-run mirrors decisions without writing")

    # --- LICENSE file detection: SPDX-License-Identifier line ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "license-file-skill"
        _write(src / "SKILL.md", "---\nname: license-file-skill\ndescription: d\n---\nbody\n")
        _write(src / "LICENSE", "SPDX-License-Identifier: BSD-3-Clause\nCopyright (c) someone\n")
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "license-file-vendored", attribution="Cat")
        assert result["exit_code"] == 0, result
        assert result["license"] == "BSD-3-Clause"
        assert "LICENSE file" in result["license_source"]
        print("OK: LICENSE file SPDX-License-Identifier line detected")

    # --- LICENSE file detection: full-text heuristic (no SPDX line),
    # BSD-3 must not be misclassified as BSD-2 ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "bsd3-text-skill"
        _write(src / "SKILL.md", "---\nname: bsd3-text-skill\ndescription: d\n---\nbody\n")
        _write(
            src / "LICENSE.txt",
            "Redistribution and use in source and binary forms, with or without\n"
            "modification, are permitted...\n"
            "Neither the name of the copyright holder nor the names of its\n"
            "contributors may be used to endorse or promote products derived from\n"
            "this software without specific prior written permission.\n",
        )
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "bsd3-vendored", attribution="Cat")
        assert result["exit_code"] == 0, result
        assert result["license"] == "BSD-3-Clause", result
        print("OK: BSD-3-Clause full-text heuristic (not misclassified as BSD-2)")

    # --- LICENSE file present but unrecognized text -> refuse, do NOT fall
    # through to --catalog-license (the file's presence is skill-specific
    # signal, so it takes priority over the catalog default) ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "mystery-license-skill"
        _write(src / "SKILL.md", "---\nname: mystery-license-skill\ndescription: d\n---\nbody\n")
        _write(src / "LICENSE", "All rights reserved by Mystery Corp. Do not redistribute.\n")
        dest_root = td / "dest"
        result = vendor_skill(
            src, dest_root, "mystery-vendored", catalog_license="Apache-2.0", attribution="Cat"
        )
        assert result["exit_code"] == 2, result
        assert result["license"] == "unrecognized-license-text", result
        assert not dest_root.exists() or not any(dest_root.iterdir())
        print("OK: unrecognized LICENSE-file text refused, does not fall through to --catalog-license")

    # --- --catalog-license fallback only fires when NO skill-specific
    # signal exists at all (no frontmatter field, no LICENSE file) ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "catalog-fallback-skill"
        _write(src / "SKILL.md", "---\nname: catalog-fallback-skill\ndescription: d\n---\nbody\n")
        dest_root = td / "dest"
        result = vendor_skill(
            src, dest_root, "catalog-fallback-vendored",
            catalog_license="CC-BY-4.0", attribution="Cat",
        )
        assert result["exit_code"] == 0, result
        assert result["license"] == "CC-BY-4.0"
        assert result["license_source"] == "--catalog-license"
        print("OK: --catalog-license fallback fires only with no other signal")

    # --- merge behavior: pre-existing metadata.sources entries are
    # preserved verbatim; the new vendoring entry is appended ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "already-sourced-skill"
        _write(
            src / "SKILL.md",
            "---\n"
            "name: already-sourced-skill\n"
            "description: d\n"
            "license: MIT\n"
            "metadata:\n"
            "  sources:\n"
            "    - path: some/upstream/REFERENCE.md\n"
            "      kind: local-file\n"
            "      usage: referenced\n"
            "      license: Apache-2.0\n"
            "      attribution: Upstream Project\n"
            "---\n"
            "body\n",
        )
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "already-sourced-vendored", attribution="Example Catalog")
        assert result["exit_code"] == 0, result
        dest_text = (dest_root / "already-sourced-vendored" / "SKILL.md").read_text(encoding="utf-8")
        assert "some/upstream/REFERENCE.md" in dest_text  # preserved
        assert "kind: local-file" in dest_text  # preserved entry untouched
        assert "kind: github" in dest_text  # new entry appended
        assert dest_text.count("- path:") == 2
        print("OK: pre-existing metadata.sources entries preserved; new entry appended")

    # --- copy selectivity: only SKILL.md + references/scripts/evals travel;
    # a stray LICENSE/README at the skill root does not ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        src = td / "src" / "selective-skill"
        _write(src / "SKILL.md", "---\nname: selective-skill\ndescription: d\nlicense: MIT\n---\nbody\n")
        _write(src / "README.md", "not vendored\n")
        _write(src / "scripts" / "run.py", "print('hi')\n")
        _write(src / "evals" / "cases" / "case-1.md", "case\n")
        dest_root = td / "dest"
        result = vendor_skill(src, dest_root, "selective-vendored", attribution="Cat")
        assert result["exit_code"] == 0, result
        dest_dir = dest_root / "selective-vendored"
        assert (dest_dir / "scripts" / "run.py").is_file()
        assert (dest_dir / "evals" / "cases" / "case-1.md").is_file()
        assert not (dest_dir / "README.md").exists()
        assert set(result["would_copy"]) == {
            "SKILL.md", "scripts/run.py", "evals/cases/case-1.md",
        }
        print("OK: only SKILL.md + references/scripts/evals subdirs are copied")

    # --- usage errors: missing SKILL.md, invalid slug -> exit 1 ---
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        empty_src = td / "src" / "empty-dir"
        empty_src.mkdir(parents=True)
        dest_root = td / "dest"
        result = vendor_skill(empty_src, dest_root, "whatever", attribution="Cat")
        assert result["exit_code"] == 1, result

        src = td / "src" / "bad-slug-skill"
        _write(src / "SKILL.md", "---\nname: bad-slug-skill\ndescription: d\nlicense: MIT\n---\nbody\n")
        result = vendor_skill(src, dest_root, "Not_A_Valid_Slug", attribution="Cat")
        assert result["exit_code"] == 1, result
        print("OK: usage errors (missing SKILL.md, invalid slug) -> exit 1")

    print("OK: _possiblaw_vendor_skill self-test passed")
    return 0


# --- CLI ---------------------------------------------------------------


def _print_result(result: dict, *, dry_run: bool) -> None:
    if result["exit_code"] == 0:
        print(result["message"])
        for rel in result["would_copy"]:
            print(f"  {rel}")
    else:
        print(f"error: {result['message']}", file=sys.stderr)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("src_skill_dir", nargs="?", help="path to the external skill's source directory")
    parser.add_argument(
        "dest_skill_slug", nargs="?",
        help="destination slug under companies/legal-operations/skills/",
    )
    parser.add_argument(
        "--catalog-license",
        help="fallback SPDX id: the repo-wide LICENSE the caller has verified for the "
        "whole source catalog (used only when the skill itself has no license signal)",
    )
    parser.add_argument(
        "--attribution",
        help="attribution string for the vendored skill; required when the license is allowed",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="print the decision and would-copy list; write nothing",
    )
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not args.src_skill_dir or not args.dest_skill_slug:
        parser.error("src-skill-dir and dest-skill-slug are required (unless --self-test)")

    result = vendor_skill(
        Path(args.src_skill_dir),
        DEST_SKILLS_ROOT,
        args.dest_skill_slug,
        catalog_license=args.catalog_license,
        attribution=args.attribution,
        dry_run=args.dry_run,
    )
    _print_result(result, dry_run=args.dry_run)
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
