# Deterministic conflicts party-screen (Sprint F WP-F2 item 4) — mini-spec

Status: **IMPLEMENTED 2026-08-01** (`bin/_possiblaw_conflicts_screen.py`, 12-check `--self-test` green covering CS-001..003). Operator decisions: (1) index at `businesses/<slug>/conflicts/parties.jsonl` — confirmed; (2) gate-proxy receipt deferred to follow-up, v1 verdict lands as a paperclip comment — confirmed; (3) `bd-lead` adverse-party guard runs the screen — confirmed. Residual CLOSED 2026-08-02: the launcher now injects `POSSIBLAW_WALLS_FILE` (`$DATA_DIR/walls.json`) and `POSSIBLAW_REPO_ROOT` into every agent's env on gated launches, so the walls source engages automatically (a missing walls file reads as zero walls). On a `--no-gate-proxy` launch with no secrets and no `--business`, agent envs are not patched at all — there the operator sets the vars manually, and the skill degrades gracefully as before.
Philosophy: the deadline-engine posture applied to intake — deterministic
where determinism counts, fail-closed to human review, never a clearance
authority.

## Problem

`skills/legal-conflicts-check/SKILL.md` (33 lines) states outright that
automated conflicts screening is not implemented; `new-matter-conflicts-screener`
is a manual-confirmation wrapper. Both `ops-lead` (new-matter intake) and
`bd-lead` (adverse-party pitches) route into this dead end. It is the most
visible stub in the package, and conflicts checking is the first thing any
firm does on a new matter.

## Design (proposed)

**New helper: `bin/_possiblaw_conflicts_screen.py`** — stdlib-only Python,
`--self-test` mode, same conventions as the sibling `bin/_possiblaw_*.py`
helpers. Input: party names as JSON on stdin (never argv interpolation).
Output: JSON verdict.

**Screened sources (deterministic, local, offline):**
1. The walls registry (`walls.json`, via the same read path as
   `_possiblaw_walls.py`) — walled client names.
2. A per-firm party index: `businesses/<slug>/conflicts/parties.jsonl`
   (gitignored, append-only records `{party, matterId, role, addedAt}`).
   The screener agent registers each new matter's parties at intake, so the
   index grows with use. `UNCONFIRMED`: index location — per-business dir
   (proposed) vs. repo-level.

**Matching:** normalization only — case fold, NFKC, punctuation strip,
legal-suffix fold (Inc/LLC/Corp/Ltd/LP/PLLC). **No fuzzy or phonetic
matching in v1**: a false NO_HIT is caught by the mandatory human step that
remains; a false HIT erodes trust in the tool. Verdicts:
`HIT` (with matching records), `NO_HIT` (with counts of what was checked),
`EMPTY_INDEX` (nothing meaningful to check).

**Semantics (the important part):**
- A `NO_HIT` **never clears conflicts.** It upgrades the human confirmation
  from "confirm from memory" to "confirm — the deterministic screen found no
  hits across N indexed parties and M walls."
- A `HIT` blocks delegation and routes to the operator with the hit detail.
- Any helper error, unreadable registry, or `EMPTY_INDEX` → the screen is
  reported NOT RUN / NOT MEANINGFUL and the human gate stands exactly as
  today. The direction of every failure is closed.

**Skill rewrite:** `legal-conflicts-check` gains the real procedure
(register parties → run screen → report verdict verbatim → human
confirmation gate) and keeps its honest framing: the screen is diligence
support, never clearance. `new-matter-conflicts-screener` and `bd-lead`'s
adverse-party guard both invoke it (`UNCONFIRMED`: bd guard inclusion in v1).

**Receipts:** `UNCONFIRMED` — receipting screen runs through the gate proxy
(new receipt kind, mirroring `POST /receipts/deadline`) would make conflicts
diligence auditable in the Matter Trust Report, but adds a gate-proxy route.
Proposed: defer to a follow-up; v1 records the verdict in a paperclip
comment on the matter.

## Eval walkthrough (Given/When/Then)

- **CS-001 (happy):** Given a party index containing `Acme Corp` on matter
  POS-12, When a new matter is screened with party `ACME CORP.`, Then the
  helper returns `HIT` referencing POS-12, and the skill blocks delegation
  pending an operator decision naming the hit.
- **CS-002 (edge):** Given an empty index and no walls, When any party is
  screened, Then the verdict is `EMPTY_INDEX` and the skill reports the
  screen as not meaningful — never a bare `NO_HIT` — and requires human
  confirmation as today.
- **CS-003 (failure/security):** Given a malformed `walls.json`, When the
  screen runs, Then the helper exits nonzero and the agent reports BLOCKER —
  it never fabricates a NO_HIT. Party names containing shell metacharacters
  or embedded instructions are data (JSON stdin, no shell interpolation, no
  instruction-following on content).

## TDD order

1. Helper `--self-test` covering CS-001..003 matching + verdict semantics
   (failing first, then implement).
2. Skill/agent text updates referencing the helper.
3. Package dry-run preview green (`warnings=0 errors=0`).
4. Reintroduce a `nightly-conflicts-check` routine **only** with an explicit
   agent binding (the previous orphan declaration was removed 2026-08-01).

## Open questions for the operator

1. Party index location: `businesses/<slug>/conflicts/parties.jsonl` (proposed) or elsewhere?
2. Gate-proxy receipt for screen runs: v1 or follow-up (proposed: follow-up)?
3. Should `bd-lead`'s adverse-party guard invoke the screen in v1 (proposed: yes, same skill)?
