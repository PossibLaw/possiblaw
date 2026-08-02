# PossibLaw and the Model Rules — for firm evaluation committees

When a firm evaluates AI tooling, the question is not "does it have an audit
log" but **"how does this help us satisfy our professional-responsibility
obligations when AI touches client work?"** This document maps PossibLaw's
trust features to the ABA Model Rules of Professional Conduct, duty by duty,
with the honest limits stated in the same breath.

Three framing notes before the table:

1. **The Model Rules are models.** Your jurisdiction's adopted rules and
   ethics opinions control, and they vary. This document is engineering
   documentation, not legal advice, and PossibLaw is open-source tooling,
   not a legal-services provider or a compliance certification.
2. **ABA Formal Opinion 512 (2024)** is the load-bearing guidance for
   generative AI: competence in the tools used, confidentiality when client
   data reaches a model, supervision of AI as nonlawyer assistance, candor
   about AI-derived content, and reasonable fees. PossibLaw's architecture
   is organized around exactly those duties.
3. **Every enforcement claim below has a documented boundary.** The
   authoritative sharp-edges list is
   [known-limitations.md](known-limitations.md); nothing in this document
   overrides it.

## The mapping

| Duty | Rule | What PossibLaw does | Honest limits |
|---|---|---|---|
| **Competence** (incl. technology competence, Cmt. 8) | 1.1 | Deterministic engines where determinism counts: filing deadlines computed by code ([`deadline-engine/`](../deadline-engine/), FRCP Rule 6), never by an LLM — an engine failure is a BLOCKER, never a guessed date. Agents and skills carry eval cases (see [`evals/COVERAGE.md`](../companies/legal-operations/evals/COVERAGE.md)), and limits are published, not marketed around. | Deadline engine is US-federal only; state courts return UNCONFIRMED. Eval coverage is partial and growing. Competence in *using* the tool remains the lawyer's duty — the tool cannot supply it. |
| **Diligence** | 1.3 | Matter intake sweep (auto-provisioned routine) keeps new matters from sitting unclaimed; the weekly renewal scan surfaces expiring obligations; deadline receipts make every computed date visible in the Matter Trust Report. | The deadline receipt is audit-only in v1 — it records the date; it does not yet block a late filing. |
| **Confidentiality** | 1.6 (+ Op. 512) | Privacy tiers per matter: `confidential`/`privileged` matters route sensitive steps through a **local** model lane; the `privacy-encoder` substitutes client identifiers with opaque placeholders *before* any cloud call, with the key held on local disk. The gate anonymizes or blocks confidential payloads at egress (deterministic masker, fail-closed when it cannot vouch). Registered matters carry a **raise-only** confidentiality floor an agent cannot downgrade. Execution-trace content capture is **default OFF**. | Reasonable steps, not guarantees — the confidentiality-vs-privilege distinction and full posture live in [privilege-and-confidentiality.md](privilege-and-confidentiality.md). Agents' own primary-lane model calls are routed (variant choice), not proxied. Research queries to CourtListener are sanitized best-effort but unreceipted. |
| **Conflicts & screening** | 1.7, 1.9, 1.10, 1.18 | Ethical walls (`--add-wall`) put a screened client in a genuinely separate control-plane company: cross-wall reads by agents get a hard 403 from paperclip itself, and unscreened lawyers don't see the walled company at all — a screened matter is not disclosed as existing. The deterministic conflicts party-screen checks intake parties against the firm's party index and wall registry: a HIT blocks pending an operator decision; a NO_HIT **upgrades — never replaces —** the mandatory human confirmation; prospective clients (1.18) register in the index even when declined. The C3 matter-access roster requires the approving human to hold entitlement to every matter involved before gated content reaches them. | Within one company, agent read scope is company-wide — walls create boundaries *between* companies, not per-matter boundaries inside one. The party screen is exact normalized matching, not fuzzy; it cannot see matters never indexed. C3 enforces at the outlet (approval resume), not the source. |
| **Candor to the tribunal** | 3.3 (and Rule 11 discipline) | The citation gate **blocks court/third-party egress carrying legal citations until a registered, payload-bound verification exists** for that exact document: quote fidelity checked character-by-character, verification attributed to a named agent in the receipt chain. Retrieved authorities register with the gate, so a cited authority that was **never retrieved** is flagged on the egress receipt (anti-hallucination). | The deterministic extractor covers curated citation classes, not full Bluebook — an unrecognized format passes unverified (direction of failure is open; the LLM review checklist remains the substantive check). Good-law/currency checking (KeyCite/Shepard's) is never performed. Verification proves the check ran and passed, not that the authority is good law. |
| **Supervision of nonlawyer assistance** (Op. 512 treats AI this way) | 5.1, 5.3 | Human gates at the boundaries that matter: court filings, signatures, payments, and irreversible external ops default to human approval; approvals are payload-hash-bound (approving X never authorizes Y). Every gate decision lands in a hash-chained, externally anchorable receipt chain with a per-matter [Matter Trust Report](receipt-verification.md) — the supervision record itself. The trace spine records how each decision was reached (model, lane, cost, timing) with role-gated visibility. | Supervision of *outputs* remains human work — the system routes and records review; it does not perform it. Same-UID local processes can bypass local transport controls until worker isolation lands (documented release blocker). |
| **Safekeeping property** | 1.15 | Money movement is a hard human-gated boundary (`MONEY_MOVEMENT`); the trust-accounting reconciler runs a three-way IOLTA reconciliation checklist; billing prep separates trust and operating figures. | The reconciliation is a structured checklist executed by an agent and reviewed by a human — not an accounting system of record. |
| **Communications about services** | 7.1 | Marketing skills carry hard boundaries: no "specialist/expert/certified" or guaranteed-outcome language (flagged for review, never silently kept), no invented clients, metrics, or testimonials, never-send rules on all drafts, and jurisdiction-specific advertising labels surfaced as placeholders for counsel confirmation. | Boundary rules instruct the drafting agents; final advertising-rule compliance review is the operator's. |
| **Unauthorized practice** | 5.5 | The regulated-work note ships at the top of the README: to the extent an operator is practicing law with PossibLaw, the operator needs to involve a lawyer. The system routes judgment calls to humans by design. | PossibLaw cannot determine what constitutes practicing law in your jurisdiction. |
| **Fees** | 1.5 (+ Op. 512 on AI-assisted billing) | Prebill review flags privilege leakage and block-billing in narratives; per-agent and per-company budget caps with hard stops live in the control plane; the trace spine records actual model cost per unit of work — the raw material for honest AI-assisted-work billing. | Fee reasonableness and disclosure decisions are the lawyer's; the system supplies the cost record, not the billing judgment. |

## What to verify yourself

An evaluation committee should not take this table on faith. Everything
above is reproducible from a clone:

```bash
./bin/possiblaw --teams flagship        # the focused firm, credential-free demo
./bin/smoke-trace                        # end-to-end receipt/trace binding, verified
pnpm -C gate-proxy test                  # the gates, incl. citation + C3 enforcement
python3 bin/_possiblaw_conflicts_screen.py --self-test   # conflicts screen semantics
```

The receipt chain verifies offline with `openssl` against the published spec
([receipt-verification.md](receipt-verification.md)) — no trust in this
project required. The sharp edges are in
[known-limitations.md](known-limitations.md); if a claim here and a limit
there ever appear to conflict, the limitations document wins.
