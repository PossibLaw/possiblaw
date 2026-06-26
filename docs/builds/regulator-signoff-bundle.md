# Build — Regulator Sign-off / Compliance Bundle (productize the guardrails strength)

*Standalone build spec. Independent of the CourtListener-MCP build; can be
scheduled and shipped separately. Status: **SHIPPED** — `gate-proxy` sign-off
bundle + `GET /receipts/bundle` route, full suite green (commit 52071d2).*

## Why

Market thesis (LegalTechTalk / Andrew Bird, June 2026): the **guardrails layer**
— "what a regulator or insurer needs to see once AI did the heavy lifting:
sign-off, audit trail, hallucination control" — is "still unowned." Truth
Systems raised ~$4M for a closed-source subset of this.

PossibLaw already produces the raw material: boundary classification, the
deterministic anonymizer, human approvals, citation verification, tier-floor
decisions, and a SHA-256 hash-chained receipt ledger
(`gate-proxy/src/receipts.ts`). **What's missing is the export** — a single
artifact an insurer / SRA / GC can actually read. This build turns an internal
invariant into a sellable deliverable. It is open-source; Truth Systems is not.

## Scope

A bundle assembler that reads existing receipt structures (no new trust
surface) and emits a per-matter "Matter Trust Report."

**Location:** new `gate-proxy/src/quality/signoff.ts` + a server route in
`gate-proxy/src/server.ts`. Optional follow-on: a `compliance-report-drafter`
agent in the package.

### Endpoint

`GET /receipts/bundle?issueId=POS-123` → assembles every receipt for a matter.

Implementation reads the existing `ReceiptChain` (filter `body.issueId === ...`),
calls `verify()` for chain status, and renders the bundle. No new persistence.

### Bundle contents (hashes only — never payloads)

Per matter:

- Ordered receipt list: `boundary`, `decision`, `outcome`, `payloadSha256`,
  `approvalId`, `agentId`, `ts`.
- Chain integrity: head + `verify()` result (`{ ok, length, head }`).
- Anonymization events: receipts with `outcome: "anonymized_performed"`.
- Citation-verification registrations: receipts with `kind: "quality"`
  (proves court/third-party filings were citation-checked).
- Tier-floor decisions: `meta.routedLocal` flags (proves confidential matters
  stayed local where required — ties to `docs/privilege-and-confidentiality.md`).
- Operator/lawyer attestation block: who approved, when, against which payload
  hashes — the "lawyer-in-the-loop" posture the SRA sandbox wants, which the
  package currently leaves to the operator (`COMPANY.md`).

**Invariant:** the bundle must reproduce the receipt invariant — payloads are
represented by `payloadSha256` only; no plaintext and no `meta` payload
fragments ever appear in output.

### Output formats

- (a) JSON (machine-readable).
- (b) Rendered Markdown / PDF "Matter Trust Report" (human/regulator-readable).

### Compliance mapping (stretch — captures KomplyAi / Awesome-Compliance ground)

A `compliance-report-drafter` agent that maps bundle events onto a **GDPR Art.
30 record**, **EU AI Act** documentation fields, and a **DPIA** skeleton. Cheap
because the substrate exists; it is templating over the bundle, not new capture.

## Evals (TDD — happy / edge / failure, per repo contract)

- **Happy:** a matter with an email-send (human-approved) + a court-filing
  (citation-verified) → bundle lists both, `verify().ok === true`, zero
  payloads present.
- **Edge:** a matter with a `blocked` egress → bundle shows the block + reason
  (this is the *good* story for a regulator — the gate refused).
- **Failure/security:** a tampered `receipts.jsonl` → bundle generation
  surfaces `ReceiptChainCorruptError` and refuses to emit a "clean" report
  (fail-closed); assert no plaintext / `meta` fragment ever appears in output.

Write the failing tests first (`gate-proxy/src/quality/signoff.test.ts`,
following the existing `citation-registry.test.ts` patterns), then implement.

## Out of scope (follow-ons)

- The `compliance-report-drafter` agent + GDPR/AI-Act/DPIA templates (separate,
  after JSON+Markdown bundle ships).
- Cross-matter / firm-level rollup reports.
- Insurer-specific report formats.

## Effort & risk

~1 sprint for the JSON + Markdown bundle. All reads off existing structures
(`ReceiptChain.append`/`verify`, `ReceiptBody`, `CitationRegistry`). No new
external dependency, no new credential, no new trust boundary. Lowest-risk,
highest-leverage move — ship before the CourtListener MCP.

## Dependencies

None on the CourtListener-MCP build. Self-contained within `gate-proxy/`.

## References

- Reuse targets: `gate-proxy/src/receipts.ts` (`ReceiptChain`, `ReceiptBody`,
  `ReceiptOutcome`, `verify`, `ReceiptChainCorruptError`),
  `gate-proxy/src/quality/citation-registry.ts`,
  `gate-proxy/src/gates/tier-floor.ts`.
- Existing routes to follow: `/receipts/verify`, `/receipts/anchor`,
  `/quality/citation` in `gate-proxy/src/server.ts`.
- Posture doc the attestation block cites:
  `docs/privilege-and-confidentiality.md`.
- Comparable (closed-source): Truth Systems.
