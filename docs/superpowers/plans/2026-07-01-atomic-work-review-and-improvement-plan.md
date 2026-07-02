# Atomic-Work Architecture Review & Improvement Plan — 2026-07-01

**Reviewer:** senior-engineer full-repo review against the repo's stated thesis.
**Method:** six parallel read-only review agents (orchestration mechanics, skills/agents catalog, model lanes, output delivery, internal information gates, external skill-source research) + first-hand reads of chief-of-staff, matter-intake, known-limitations, ARCHITECTURE. All findings carry file:line evidence in the underlying reports; unverified claims are marked `UNCONFIRMED`.

**The thesis under review:** atomic work — a delegator (chief-of-staff) decomposes matters, sends atomic pieces to narrow specialists, reconstitutes the results — so that (a) context windows stay small per piece, (b) gates control what is seen and where, (c) each piece can be tuned with different models/skills for better output than one-shot prompting, and (d) output is usable where lawyers work (paperclip UI + OneDrive/Google Drive).

---

## Verdict

| Thesis claim | Status | One-line evidence |
|---|---|---|
| (a) Decompose → atomic work → reconstitute | **HALF-BUILT** | Delegation transport is real platform structure (child issues, `issue_children_completed` re-wake with summaries — `paperclip/server/src/services/issues.ts:3955`); reconstitution is behaviorally unspecified — zero AGENTS.md instructions for the children-completed wake, work products never roll up (`services/work-products.ts:35-42`), reconciler/meta-review skippable. |
| (a′) Small context windows | **TRUE at wake, unmeasured** | Woken agents get a scoped slice (`services/heartbeat.ts:2144-2212`, budget-truncated); but nothing measures per-piece context/tokens, and any agent can read the whole company anyway. |
| (b) Gates of what is seen and where | **TRUE at egress only** | Egress gate + receipts are real; internally the only boundary is the company (`paperclip/server/src/routes/authz.ts:44`) — any agent reads any client's matter; confidentiality is self-reported by the calling agent (`gate-proxy/src/boundary.ts:16-19`); no ingress sanitization; 3 egress channels bypass the gate (research queries, notify-slack/teams, synced-folder delivery). |
| (c) Tweak each piece with different models/skills | **CONFIGURED, not closed-loop** | 178/178 agents laned; but 5 lanes collapse to ~3 configs per variant, `dataTerms` tier-floor is dead config vs. a live README claim (`gate-proxy/src/server.ts:1250` honesty comment), and nothing consumes eval scores (1 result file exists across 11 variants). |
| (c′) Skills are atomic and tool-bound | **STRONG** | Best-audited surface: procedural, fail-closed, verified endpoints, 0 broken skill⇄agent refs. Deficit is measurement: 8/178 agents (4.5%) and 0/174 skills have eval cases. |
| (d) Output in UI + OneDrive/Google Drive | **FAILS the lawyer bar today** | Delivery ships raw `.md` (no md→docx anywhere in the path; binary can't pass the gate — `gate-proxy/src/connectors.ts:117-131`); GDrive lands flat in My Drive root (no `parents` — `connectors.ts:150`); ~1h hand-pasted tokens, no OAuth; never live-tested; paperclip work-product API has no UI component; Trust Report doesn't link the delivered artifact. |
| Thesis measurability (A/B eval) | **BROKEN** | Arm A passes slug as `assigneeAgentId` (UUID required — `orchestration-eval/src/runner.ts:71` vs `packages/shared/src/validators/issue.ts:62`) → every Arm A task SKIPPED; wall-clock hardcoded 0; `timedOut` dropped; no Arm B decomposition shape or per-piece model attribution. |

**Overall:** the skeleton (paperclip transport, gate-proxy egress, catalog structure) is stronger than typical multi-agent stacks, and the repo is honest about most limits. The three deficits that matter are: **reconstitution is unwritten, the gates claim is only half-true, and nothing measures whether any of it works** — plus the delivery path does not yet produce work product a lawyer can use.

---

## Workstream 1 — Prove the thesis first (eval + instrumentation)

Everything else in this plan should be tuned against data; this workstream is small and unblocks that.

| # | Task | Why | Effort | Paths |
|---|---|---|---|---|
| 1.1 | Fix Arm A slug→UUID resolution (resolve via `listAgents()` name-mapping at startup; fail loudly on unresolved) | The thesis A/B currently produces zero Arm A data — every task 400s into SKIPPED | S | `orchestration-eval/src/runner.ts:71`, `src/paperclip-client.ts:42-44`, `src/index.ts` |
| 1.2 | Instrument the thesis variables: real wall-clock (replace hardcoded 0), `timedOut` into `RunRecord`, Arm B decomposition shape (child count/depth/assignees), per-child cost + lane/model attribution | Without these, a Δ(B−A) win cannot be attributed to atomic work vs. more compute/time | S/M | `orchestration-eval/src/runner.ts:94-99`, `src/report.ts:4`, `src/index.ts:73-86` |
| 1.3 | Score `cancelled`/timed-out roots as failed, not judged-on-partials | A cancelled child currently satisfies "all children terminal" and gets scored | S | `orchestration-eval/src/await-completion.ts:4`, `src/index.ts` |
| 1.4 | Regenerate `evals/COVERAGE.md` from directory listings + case `target:` fields, as a script | The planning artifact is wrong today (346 vs 352 targets; misses `deadline-calculator`'s 4 cases) | S | `companies/legal-operations/evals/COVERAGE.md`, new script in `bin/` |
| 1.5 | Eval backfill, court/money/egress agents first: `legal-citation-checker`, `deliverables-courier`, `legal-invoice-auditor`, `trust-accounting-reconciler`, `litigation-hold-drafter` — 3 cases each (happy/edge/failure), modeled on the existing `deadline-*.md` cases and CaseMark's `evals.json` convention | 95% of "tunable pieces" have no measurement; the thesis is unfalsifiable per piece | M (first 5) → L (catalog-wide) | `companies/legal-operations/evals/cases/` |
| 1.6 | Close the eval→lane loop: a consumer that aggregates `eval-harness/results/` + orchestration-eval `costCents` per variant×lane into lane-assignment proposals (mirror `learning-loop/src/proposals` pattern); actually run the harness on >1 of 11 variants | "Tweak each piece" has measurement plumbing but no feedback — measure → human reads markdown → nothing | M | `eval-harness/src/report/`, `orchestration-eval/src/report.ts`, new consumer, `variants.yaml` |

## Workstream 2 — Write the missing back half: reconstitution

| # | Task | Why | Effort | Paths |
|---|---|---|---|---|
| 2.1 | New shared skill `reconstitution-playbook` (like `missing-info-gate`), referenced by all 36 routing agents: on `issue_children_completed` wake — check every child status (a `cancelled` child is a gap, not a completion), synthesize child summaries, **hoist/link the deliverable work product to the parent issue**, leave a completion comment with a fixed schema | The platform fires the trigger; no agent knows what to do with it. This is the single highest-leverage fix for the thesis | M | new `companies/legal-operations/skills/reconstitution-playbook/`, `agents/chief-of-staff|chief-counsel|*-lead/AGENTS.md` |
| 2.2 | Make meta-review a default stage for drafting-lane output: leads route completed drafts through `risk-spotter` before closing the parent — or adopt paperclip's native `executionPolicy` review stages (exists at `routes/issues.ts:140-149`, unused by the package) | Quality control is currently opt-in and skippable; "plausible garbage flows up unchecked" | M | lead AGENTS.md files, `chief-counsel/AGENTS.md:53-54`, `companies/legal-operations/.paperclip.yaml` |
| 2.3 | Make routing tables data, not prose: per-lead routing YAML → render AGENTS.md tables + `docs/agent-catalog.md` from it; CI check that every routed slug has an agent dir | Drift across 34 leads/178 files is currently zero but unguarded; also enables machine-checkable routing | M | `agents/*/AGENTS.md`, `docs/agent-catalog.md`, new script in `bin/` |

## Workstream 3 — Make "gates of what is seen" true (security)

Findings from the attacker-lens review: 0×S0, 3×S1, 3×S2. Priority order per that report: G-2, G-3, G-1, G-4, G-5.

| # | Task | Why | Effort | Paths |
|---|---|---|---|---|
| 3.1 | **Trusted, non-downgradable confidentiality (G-2):** per-matter classification stored server-side, looked up by `issueId` at classify time; request-supplied value is a raise-only floor; `query_external_model` with unspecified confidentiality → fail-closed to anonymize | The load-bearing confidential-to-cloud gate keys off a label the agent types itself — bypassable at source (S1) | M | `gate-proxy/src/boundary.ts:16-19`, `src/server.ts:167`, connector skills |
| 3.2 | **Ingress untrusted-data isolation (G-3):** wrap externally-sourced content (research results, drive/gmail reads, inbound matter bodies, facade-created matters) in an untrusted-data envelope + standing "data, not instructions" rule; human first-touch before auto-triage of externally-created matters | A crafted intake matter steers the chief-of-staff; combined with full-company read this is a real exfiltration chain, with the human gate shown attacker-framed context (S1) | M | ingest/connector skills, `matter-intake-sweep`, `chief-of-staff/AGENTS.md`, `firm-facade/src/handlers.ts:511-537` |
| 3.3 | **Close/document the three gate-bypass egress channels:** (a) `notify-slack`/`notify-teams` direct webhook POST → gate-proxy `notify` tool or documented exception in `gate-policy.yaml`; (b) research queries → receipts at minimum (already documented); (c) `output-storage-config` synced-folder path silently exports every draft incl. privileged, no receipt → warning + tier-gated guidance | One receipted-egress story with three unreceipted side doors | S/M | `skills/notify-slack|notify-teams/SKILL.md`, `skills/output-storage-config/SKILL.md:68-107`, `gate-policy.yaml` |
| 3.4 | **Matter isolation (G-1):** interim layer-side pattern — one paperclip company per ethical-walled client (the existing company boundary then isolates); long-term: per-matter ACL upstream in paperclip (fork-or-upstream decision — layer-not-fork currently forbids) | Any agent can read every client's matter (`authz.ts:44` is the entire agent check); this is the deferred malpractice case | M (layer) / L (upstream) | launcher multi-company support, docs |
| 3.5 | **Learning-loop wall hardening (G-4):** re-run sanitizer at accept/render/overlay time (not just propose); source `entities` from the matter party list, not CLI flags | Entity-less proposals or direct `firm-memory.md` edits bypass the wall and inject into every client's context (S2, →S1 if accept is ever automated) | S | `learning-loop/src/sanitizer.ts`, `src/memory.ts:22-49`, `src/cli.ts:42-44`, `bin/possiblaw:402-409` |
| 3.6 | **Doc honesty, immediately:** (a) README/walkthrough/CHANGELOG claim "runtime model choices obey the gate-proxy dataTerms tier-floor" — code says staged/not wired (`server.ts:1250-1256`); correct the claim or wire it (launcher → proxy env → `evaluateTierFloor`); (b) add the read-scope reality (company-scoped keys, no internal isolation) to `docs/known-limitations.md` | A legal-privilege product documenting an unenforced privacy guarantee is the worst kind of gap | S (docs) / M (wire) | `README.md:135-143`, `docs/operator-walkthrough.md:194-198`, `docs/known-limitations.md`, `gate-proxy/src/index.ts` |

## Workstream 4 — Lawyer-grade delivery (UI + OneDrive/Google Drive)

The operator's explicit bar: work product visible in the UI **and** usable in OneDrive/Google Drive. Today a lawyer gets a raw `.md` text file, flat in My Drive root, under an hour-lived token, via a path never live-tested.

| # | Task | Why | Effort | Paths |
|---|---|---|---|---|
| 4.1 | Binary/docx through the gate: `contentBase64` field + required companion `documentText` (so the citation gate still sees reviewable text); correct MIME on GDrive multipart + OneDrive PUT | Today a `.docx` structurally cannot pass the gate (string-only `content`) | M | `gate-proxy/src/connectors.ts:105-228`, `src/document-text.ts`, `src/server.ts:1141-1161` |
| 4.2 | Courier converts before filing: run the already-shipped `output-local-docx` pandoc step, deliver the `.docx` (depends on 4.1) | Word/Docs open a real document instead of `#`-header plaintext | S | `skills/output-delivery-playbook/SKILL.md:94-120`, `agents/deliverables-courier/AGENTS.md` |
| 4.3 | GDrive folder placement: `parents: [folderId]` in multipart metadata + `folderId` destination in the delivery policy; then per-matter subfolder creation (new gated write) | Flat root dump contradicts the skill's own docs and no firm would accept it | S (parents) / M (per-matter folders) | `gate-proxy/src/connectors.ts:150`, `output-delivery-playbook/SKILL.md:44-63,114-116` |
| 4.4 | Token refresh for the proxy: Google refresh-token flow; Entra device-code or client-credentials | OneDrive delivery realistically works <1h per proxy restart on hand-pasted tokens | M | `gate-proxy/src/connectors.ts:29-38`, `docs/operator-walkthrough.md` |
| 4.5 | Thread the performer's `webUrl`/`id` into the egress receipt meta → Matter Trust Report links the delivered artifact | The Trust Report proves an upload happened but not where the artifact lives | S | `gate-proxy/src/server.ts:159-201`, `src/quality/signoff.ts` |
| 4.6 | Live-test delivery + Tier-2 round-trip with real tokens (operator-gated; already queued); resolve the 2 vendor `UNCONFIRMED`s (Drive revision content path; native Docs `files.export`) | Every cloud-delivery claim is dry-run-only today | S | `docs/operator-test-checklist.md`, `.agent/PLAN.md:28` |
| 4.7 | Reconcile the DOCX round-trip claim: wire docx text extraction into the sweep (parse_doc bridge exists in `orchestration-eval/src/extract.ts`) or correct `docs/known-limitations.md:360-365` | known-limitations claims a capability the code doesn't have — out of character for this repo | S | `learning-loop/src/diff.ts`, `docs/known-limitations.md` |
| 4.8 | UI visibility: near-term, standardize agents on issue documents + courier completion comments (both render today); mid-term, native Google Docs creation on upload (mimeType conversion) for in-Docs editing + cleaner Tier-2 revision diffs; work-product dashboard panel is an upstream paperclip gap (API exists, no UI consumer) — file upstream or accept issue-documents convention | Lawyers must see drafts without API calls | S (convention) / M (native Docs) / upstream (panel) | agent output skills, `gate-proxy/src/connectors.ts`, upstream issue |
| 4.9 | Notion chunking (≤2,000-char blocks) or document the limit | Any real contract draft likely 400s today (`UNCONFIRMED` live) | S | `gate-proxy/src/connectors.ts:195-211` |

## Workstream 5 — Catalog upgrades + external adoption (Case.dev / Lawvable)

License ground rules (verified from LICENSE files 2026-07-01): **CaseMark/skills = Apache-2.0** (repo-wide) → safe to vendor with attribution. **Lawvable/Lawve `awesome-legal-skills`** = per-skill licensing; 62/139 AGPL, ~17 unlicensed, 6 proprietary → vendor only the Apache/MIT subset, default-deny everything else; the curated list text itself is CC-BY-NC-ND (do not derive). **anthropics/claude-for-legal = Apache-2.0** — prefer it as upstream for the skills Lawvable mirrors. SuperDoc DOCX tooling is AGPL: patterns-only, or shell out to its CLI as a separate process — never copy text or bundle.

| # | Task | Why | Effort | Source |
|---|---|---|---|---|
| 5.1 | Vendor CaseMark `authority-verification` (verify→retrieve→expand→audit + EVALS.md + scripts), swap backend to the existing legal-data/CourtListener path + citation-gate registration | Strongest external asset; strengthens the repo's own flagship gate | M | CaseMark/skills (Apache-2.0) |
| 5.2 | Adopt CaseMark `SKILL-SPEC.md` conventions (controlled tags, description rules, progressive-disclosure budgets) + their `audit/` methodology (dupe clusters, size budgets) against PossibLaw's 174 skills | The catalog has no authoring spec of its own; their audit method found 28% oversized skills in their catalog — run the same here | M | CaseMark/skills |
| 5.3 | Vendor the Lawvable Apache/MIT subset: `matter-intake-scoping` (richest intake procedure found anywhere), `matter-plan-builder` + `timeline-generator` (feeds chief-of-staff decomposition), `scope-change-controller`/`status-report-drafter` (legal-ops lead), MIT `litigation-deadline-calendar` (multi-state + arbitration + .ics — use as pattern/test-oracle to extend deadline-engine beyond FRCP-only; independently verify its state rule tables first) | Practitioner-authored depth in exactly the areas the org chart already routes | M | lawve-ai/awesome-legal-skills (per-skill Apache/MIT only) |
| 5.4 | Wire the orphaned `connector-gmail`/`connector-outlook` skills: a correspondence-handling agent (or attach to `deliverables-courier`) + routing row | Finished, gated email egress exists that no agent can reach; email is a core solo-firm workflow | S/M | existing skills |
| 5.5 | Hygiene sweep: split `legal-cease-and-desist` into send/receive skills; delete unreachable `credential_missing:` claims from 5 v1-blocked connectors; de-sprint `legal-conflicts-check` wording; README "Ten"→"Eleven" + `openrouter-cost` row; walkthrough `gpt-5.3-codex`→`gpt-5.5`; `variants.yaml` "11-agent package" header; lane rubric incl. `primary` + re-lane `commercial-lead`→routing, document `reconciler`'s lane | Small accuracy debts that mislead operators | S | per-file list in the underlying reports |
| 5.6 | Add Given/When/Then acceptance blocks to the ~130 checklist/playbook skills (template from each skill's existing output-format section) | Makes eval backfill (1.5) mechanical — the judge grades against the skill's own criteria | M | `companies/legal-operations/skills/*/SKILL.md` |
| 5.7 | License-aware ingestion tooling for any future external-skill import: read `metadata.license`/LICENSE per skill, default-deny, record provenance + attribution | 45% of the most attractive external catalog is AGPL; one careless vendor breaks Apache-2.0 posture | S | new script in `bin/` |

---

## Recommended sequencing

1. **Sprint α — unblockers + honesty (all S, ~1 session):** 1.1, 1.2, 1.3, 1.4, 3.6, 4.3(parents), 4.5, 4.7, 5.5. Then run the orchestration eval live (operator-gated) — data arrives while later sprints run.
2. **Sprint β — lawyer-grade delivery:** 4.1 → 4.2 → 4.4 → 4.6 (live test), 4.8 convention, 4.9.
3. **Sprint γ — reconstitution:** 2.1 → 2.2 → 2.3, plus 1.5 (first 5 agents' evals so the new stage is measured).
4. **Sprint δ — gates:** 3.1 → 3.2 → 3.3 → 3.5; scope 3.4 (matter isolation) as its own design doc — it is the largest architectural decision here (company-per-client vs. upstream ACL vs. fork).
5. **Sprint ε — catalog + adoption:** 5.1–5.4, 5.6, 5.7, then 1.6 (close the eval→lane loop with real data).

## Key UNCONFIRMED items to resolve before building on them

- Notion 2,000-char `rich_text` failure on real drafts (documented vendor limit, not live-tested here).
- Whether paperclip's agents API serializes `slug` (affects 1.1's mapping strategy — may need display-name matching).
- Drive Revision content path + native Google Docs `files.export` (the two standing vendor UNCONFIRMEDs, resolved by 4.6).
- Lawvable deadline-calendar state rule tables (verify against primary sources before trusting any date output).
- Whether any production deployment runs paperclip `local_trusted` outside a single-operator machine (if so, all internal authz collapses — deployment question, not code).

## Out of scope / already decided (do not re-litigate)

- Layer-not-fork posture and the pinned paperclip submodule (FOUNDATION.md; fork-only unblocks have documented workarounds). Workstream 3.4's upstream ACL is flagged as the one pressure point on this decision.
- Phase D per-segment provenance (`docs/designs/per-segment-provenance-phase-d.md`) — already spec'd; this plan does not duplicate it.
- `docs/ARCHITECTURE.md` is stale (documents the CLI removed in 0.4.0) — fold a refresh into Sprint α's honesty pass if desired.
