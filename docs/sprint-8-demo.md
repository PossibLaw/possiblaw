# Sprint 8 Demo — Workflow Library

This walkthrough shows all four cross-surface workflows running on the same NDA prompt in offline mode.

## Setup

```bash
cd /path/to/possiblaw
pnpm build
# All commands below use offline mode (no API key needed)
```

---

## 1. workflows list — see all 9 workflows

```bash
node dist/cli/index.js workflows list
```

Expected output includes 9 rows: `deep-review`, `quick-counsel`, `quick-counsel-with-cos`, `quick-expense-categorize`, `quick-intake-reply`, `quick-invoice-review`, `quick-pitch-polish`, `roundtable`, `stress-test`.

---

## 2. quick-counsel — fast single-specialist path

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel \
  "draft NDA for ACME Corp and Beta Corp for software evaluation"
```

**Shape:** router → 1 specialist → tests → guardrails
**Specialists:** chief-counsel → commercial-lead → nda-drafter
**Time:** ~1 LLM call (offline: instant)
**Cost (live):** ~$0.04

The output is a complete NDA draft. The `signed-document` guardrail fires because the draft contains a signature block, which triggers human escalation.

---

## 3. deep-review — 3 parallel drafts + reconciliation

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run deep-review \
  "draft NDA for ACME Corp and Beta Corp for software evaluation"
```

**Shape:** router → 3× parallel (temps 0.2, 0.7, 1.0) → reconcile → tests → guardrails
**Specialists:** nda-drafter × 3, then reconciler
**Time:** ~4 LLM calls (offline: instant)
**Cost (live):** ~$0.21

You will see three `parallel:nda-drafter:branch*` steps followed by a `reconcile:reconciler` step. The reconciler output includes a `## Reconciliation notes` section listing what each branch contributed.

---

## 4. stress-test — adversarial 2-participant debate

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run stress-test \
  "review NDA for ACME Corp for hidden risks and worst-case scenarios"
```

**Shape:** router → debate(nda-drafter + risk-spotter, 3 rounds) → guardrails
**Participants:** nda-drafter defends the draft; risk-spotter attacks it
**Time:** ~7 LLM calls (offline: instant)
**Cost (live):** ~$0.31

You will see `debate:round1:nda-drafter`, `debate:round1:risk-spotter`, `debate:round2:*`, `debate:round3:*`, then `debate:judge:debate-judge`. The judge output includes `## Verdict`, `## Dissent`, and `## Risks`.

---

## 5. roundtable — cross-surface 3-participant debate

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run roundtable \
  "review NDA for ACME Corp from legal, finance, and marketing perspectives"
```

**Shape:** router → debate(nda-drafter + billing-prep + pitch-polisher, 3 rounds) → guardrails
**Participants:**
- `nda-drafter` — legal perspective (enforceability, missing clauses)
- `billing-prep` — finance perspective (billing implications, payment terms)
- `pitch-polisher` — marketing perspective (relationship and brand impact)

**Time:** ~10 LLM calls (offline: instant)
**Cost (live):** ~$0.40

---

## 6. quick-pitch-polish — per-surface variant (marketing)

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-pitch-polish \
  "polish this pitch: Our firm has 30 years of experience in commercial litigation and M&A. We work with Fortune 500 companies and startups alike."
```

**Shape:** router → specialist → tests
**Specialist:** chief-of-staff → marketing-lead → pitch-polisher

---

## 7. quick-expense-categorize — per-surface variant (finance)

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-expense-categorize \
  "categorize: Nobu dinner $245, Uber to courthouse $42, Westlaw research $180"
```

**Shape:** router → specialist (no tests)
**Specialist:** chief-of-staff → finance-lead → expense-categorizer

---

## 8. Comparison table

| Workflow | LLM calls | Est. cost (live) | Use when |
|---|---|---|---|
| quick-counsel | 3 | $0.04 | Speed matters; low-stakes matter |
| deep-review | 6 | $0.21 | High-stakes; want diverse synthesis |
| stress-test | 8 | $0.31 | Counterparty-review focus; adversarial |
| roundtable | 11 | $0.40 | Multi-stakeholder; legal + business lens |
