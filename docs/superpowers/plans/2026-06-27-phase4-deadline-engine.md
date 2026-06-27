# Phase 4 — Deterministic Deadline Engine — Implementation Plan

**North Star reference:** PLAN.md NORTH STAR Phase 4 — "Deterministic deadline engine (BigLaw): atomic, code-not-LLM agent (FRCP Rule 6 / CPR date math); feeds the court-filing gate. Eval: known FRCP fixtures → exact dates; weekend/holiday roll fixtures; unsupported jurisdiction → UNCONFIRMED, not a guess."

**Branch:** `feat/phase4-deadline-engine` (base `main` @ `8e6dfd3`).

## Thesis
Legal filing deadlines must be computed by **deterministic code**, never by LLM inference (an LLM that "reasons" about date math will eventually be wrong, and a missed filing deadline is malpractice). Phase 4 ships a code engine that computes deadlines per **FRCP Rule 6(a)/(d)**, an atomic `deadline-calculator` agent + skill that calls it (no LLM date math), comprehensive fixtures/evals, and an honest refusal (`UNCONFIRMED`) for jurisdictions the engine does not support. It feeds the Phase-3 court-filing gate: a computed, receipted deadline becomes part of the matter the human filing-gate reviewer sees.

## Design decisions (defaults — operator may override; flagged where genuinely open)
- **D1 — Standalone TS package `deadline-engine/`** (mirrors `gate-proxy/` / `eval-harness/` / `learning-loop/`: `node --import tsx --test`, tsc, js-deps-minimal). The date math is pure functions + a CLI; agents invoke the CLI, they do not compute dates themselves. *(default — matches repo convention)*
- **D2 — v1 jurisdiction scope = US Federal (FRCP Rule 6) only**, done correctly, with the holiday calendar for federal legal holidays (5 U.S.C. § 6103) including observed-date rules. The engine is architected so a jurisdiction is a pluggable holiday-calendar + rule-set; **any jurisdiction other than `US-FED` returns a structured `unsupported` result (→ the agent reports `UNCONFIRMED`), never a guessed date.** CPR (England & Wales) and US state courts are explicit follow-ups. *(default — FRCP is the clear v1; flag for operator if they want CPR in v1)*
- **D3 — "Feeds the court-filing gate" = the computed deadline is recorded on the matter + emitted as a receipt** (through the gate proxy, reusing the receipt spine), so the human filing-gate reviewer sees a deterministic, audited deadline. A hard "deadline gate" that blocks a filing submitted past its own deadline is a documented follow-up (it needs the filing's target date, which lives outside this engine). *(default — keeps Phase 4 scoped to the engine + visibility; flag the harder gate as follow-up)*
- **D4 — No external calendar/holiday API.** The holiday calendar is computed in-code (deterministic, offline, testable). *(default — determinism + no egress)*

## FRCP Rule 6 — the exact rules the engine MUST implement (encode verbatim; do NOT improvise legal rules)
**Rule 6(a)(1) — periods stated in days (forward):**
- (A) EXCLUDE the day of the triggering event.
- (B) COUNT every intermediate day, INCLUDING Saturdays, Sundays, and legal holidays.
- (C) INCLUDE the last day; BUT if the last day is a Saturday, Sunday, or legal holiday, the period continues to the end of the next day that is NOT a Saturday, Sunday, or legal holiday (roll FORWARD).

**Rule 6(a)(5) — "next day" & backward periods:** for a period measured BACKWARD from an event (e.g., "at least N days before the hearing"): exclude the trigger day, count backward N days; if that last day is a Saturday/Sunday/legal holiday, continue to the next day that is not — going BACKWARD (roll to the PRECEDING business day, i.e. the deadline moves EARLIER).

**Rule 6(a)(6) — legal holiday** = the federal legal holidays in 5 U.S.C. § 6103 (below) + any day declared a holiday by the President/Congress. (State holidays per 6(a)(6)(C) apply only to forward "after an event" periods and only for the state where the court sits — OUT OF v1 scope; document.)

**Rule 6(d) — 3 added days (service by mail etc.):** when the trigger is service by mail / leaving with the clerk / other consented electronic means under Rule 5(b)(2)(C)-(F): compute the base period under 6(a) FIRST, then ADD 3 calendar days, then RE-APPLY the 6(a)(1)(C) weekend/holiday roll to the resulting last day. (Order matters: 6(a) roll → +3 calendar days → 6(a) roll again.)

**Federal legal holidays (5 U.S.C. § 6103), computed per year:** New Year's Day (Jan 1); Birthday of MLK Jr. (3rd Mon Jan); Washington's Birthday (3rd Mon Feb); Memorial Day (last Mon May); Juneteenth NID (Jun 19); Independence Day (Jul 4); Labor Day (1st Mon Sep); Columbus Day (2nd Mon Oct); Veterans Day (Nov 11); Thanksgiving (4th Thu Nov); Christmas (Dec 25). **Observed-date rule:** a fixed-date holiday falling on Saturday is observed the preceding Friday; on Sunday, the following Monday. The OBSERVED date is the legal holiday for Rule 6.

## Build units (TDD, subagent-driven)
- **P4-1 — `deadline-engine/` package (THE CORE — correctness-critical).** Pure functions: `federalHolidays(year)` (with observed-date rule), `isBusinessDay(date)`, `computeDeadline({triggerDate, days, direction: 'forward'|'backward', serviceByMail?: boolean, jurisdiction})` returning `{ deadline, jurisdiction, rule: 'FRCP-6', steps: [...human-readable trace], supported: true }` OR `{ supported: false, reason: 'unsupported_jurisdiction' }` for non-`US-FED`. A CLI (`bin/deadline` or `tsx src/cli.ts`) taking JSON in → JSON out. **Exhaustive node:test fixtures** verified against KNOWN-CORRECT answers: basic forward count; last-day-on-weekend roll-forward; last-day-on-holiday roll-forward (incl. an observed holiday, e.g. Jul 4 on a Sunday → observed Mon Jul 5); +3 mail with a subsequent roll; backward count rolling to the preceding business day; a holiday-spanning count; unsupported jurisdiction → `supported:false`. Pure/deterministic — NO `Date.now()`/timezone ambiguity (operate on calendar dates, e.g. UTC `YYYY-MM-DD`, no local-tz drift). tsc clean.
- **P4-2 — agent + skill + package wiring.** `companies/legal-operations/agents/deadline-calculator/AGENTS.md` (extractive lane; reports to `litigation-lead`; its Execution Contract: it MUST call the deadline-engine CLI for any date math and MUST NOT compute dates by reasoning; for unsupported jurisdictions it returns `UNCONFIRMED` + escalates). `companies/legal-operations/skills/legal-deadline-calculation/SKILL.md` (the playbook: gather trigger date + period + direction + service method + jurisdiction; invoke the engine; present the deadline WITH the rule trace + the engine's deterministic provenance; never guess; refuse unsupported). Wire into `.paperclip.yaml` (sidecar block + sidebar + `litigation-lead` routing row). Counts move 177→178 agents / 172→173 skills — update README/CLAUDE.md/walkthrough counts + `docs/agent-catalog.md`.
- **P4-3 — gate feed + evals + docs.** (a) The deadline result is emitted as a receipt (reuse the gate proxy spine — a small `deadline` receipt kind OR a `firm_facade`-style POST; keep it simple + audited) and recorded on the matter so the court-filing human-gate reviewer sees the deterministic deadline. (b) Eval cases under `companies/legal-operations/evals/cases/` (markdown, matching the existing convention) covering the FRCP fixtures + the unsupported-jurisdiction refusal. (c) Docs: operator-walkthrough section, known-limitations (v1 = US-FED only; state holidays out of scope; the hard deadline-gate is a follow-up), CHANGELOG 0.29.0.

## Evals (Given/When/Then)
- **HAPPY:** Given a complaint served 2024-12-20 with a 21-day answer period (forward, no mail); When the engine computes; Then the deadline is the exact FRCP date (count from 12-21, roll if the last day is a weekend/holiday) with a correct step trace.
- **EDGE (holiday roll):** Given a period whose last day is an observed federal holiday; Then it rolls forward to the next business day.
- **EDGE (backward + mail):** Given "at least 14 days before a hearing" (backward) and separately a +3 mail forward period; Then backward rolls to the preceding business day and mail adds 3 then re-rolls.
- **FAILURE/SECURITY (no guess):** Given `jurisdiction: 'US-CA-STATE'` (unsupported); Then the engine returns `supported:false` and the agent reports `UNCONFIRMED` — NEVER a computed date. The agent never does date math itself (the skill forbids it).

## Risks
- **Legal correctness is the whole point** — fixtures must be verified against known-correct FRCP answers, not the engine's own output. Encode the rules verbatim from this plan; do not improvise.
- **Timezone/calendar drift** — operate on pure calendar dates (no local-tz `Date`), or the same input yields different deadlines on different machines. (Note: the repo bans `Date.now()` in some contexts; the engine takes explicit input dates.)
- **Overclaim** — the engine supports US-FED only in v1; the agent/docs must say so and refuse the rest. State holidays (6(a)(6)(C)) are NOT implemented.

## Self-review (plan-time)
Covers the North Star Phase 4 ask: deterministic code engine ✅ (P4-1), atomic agent that calls it not computes ✅ (P4-2), feeds the filing gate ✅ (P4-3 receipt + matter record), evals incl. unsupported→UNCONFIRMED ✅ (P4-3). Defaults (US-FED-only, receipt-feed not hard-gate) are flagged for operator override. The hard deadline-gate and CPR/state support are explicit follow-ups, not silent omissions.
