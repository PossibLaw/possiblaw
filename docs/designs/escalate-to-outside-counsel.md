# Design: Escalate to Outside Counsel

Status: `DRAFT` — design only, nothing here is implemented.

This document specifies a first-class "escalate to outside counsel" concept for
the in-house operating model. It is a **design**, not an implementation. No code
is shipped with this doc. Where a fact could not be confirmed against the
current codebase it is marked `UNCONFIRMED`.

## Why this exists

The co-equal framing (see `README.md` "Where this sits in the market" and
`docs/operator-walkthrough.md` "Team subset import") says an in-house legal team
can run PossibLaw as its own AI-native practice, doing first-pass work with its
own agents and **escalating to outside counsel only for the judgment it doesn't
own**. That posture is described in prose today but there is no mechanism behind
it. This design is that mechanism.

## Problem

Today "escalate" means **escalate to the human operator** — the person who sits
atop the delegation chain. The escalation paths that exist:

| Source | Current "escalate" target | Evidence |
|---|---|---|
| `chief-of-staff` | the operator (no lead / unrecognized domain / disabled team) | `companies/legal-operations/agents/chief-of-staff/AGENTS.md` routing table |
| `chief-counsel` | the operator or named responsible professional (no specialist / blocked matter) | `companies/legal-operations/agents/chief-counsel/AGENTS.md` routing + escalation comment block |

Both chiefs carry the explicit boundary: *"Keep work inside this company unless
the operator explicitly authorizes escalation outside it."* There is **no
concept of the in-house team escalating OUT to an outside law firm** — handing a
matter, or one sub-question of a matter, to external counsel for the judgment
the in-house team does not own. That is the new capability.

Note the one adjacent piece that already exists is the **inverse** direction:
the `outside-counsel-engagement-drafter` agent and `outside-counsel-playbook`
skill draft an engagement letter + billing guidelines *once a firm has already
been chosen* and explicitly *never send anything to a firm*
(`companies/legal-operations/skills/outside-counsel-playbook/SKILL.md`,
`companies/legal-operations/agents/outside-counsel-engagement-drafter/AGENTS.md`).
That is paperwork for a decided engagement; it is not the act of deciding to
escalate or of assembling what outside counsel needs to take the question.

## Concept

When `chief-counsel` (or a practice lead) determines a matter or a **specific
sub-question** needs outside expertise the in-house team doesn't own, the system
assembles a scoped **referral package** and routes it to a human for approval
before anything is shared. The operator then goes to outside counsel
**better-informed**, carrying a tight package instead of a cold ask.

A referral package contains exactly:

| Part | Content | Default disclosure |
|---|---|---|
| Matter summary | Generalized statement of the matter and posture | Included (non-privileged framing) |
| Work-to-date | Pointers to the in-house work products produced so far | Metadata only by default |
| The specific question | The precise sub-question outside counsel is being asked to own | Included |
| Privileged detail | Underlying privileged/confidential text needed to answer | **Default-closed**; included only on explicit human opt-in |

The design **reuses the firm-facade trust primitives, inverted**. In the
firm-facade, the company running PossibLaw is the firm and an *outside assistant*
is the client reaching in. In escalation, the company running PossibLaw is the
**in-house team** and *outside counsel* is the escalation target it reaches out
to. The same invariants carry over:

| Firm-facade invariant (source) | How it inverts for escalation |
|---|---|
| Fixed allowlist IS the security boundary (`mcp-servers/firm-facade/src/catalog.ts`) | A fixed, narrow set of escalation actions — no raw send, no auto-transmit |
| Human-only approval; `request_approval` always returns `pending_approval`, no approve tool/handler (`mcp-servers/firm-facade/src/handlers.ts` rule (c)) | No referral leaves until a human approves; no code path auto-approves |
| Work-product text default-closed; disclosed only when `include_text:true` AND `policy.allowWorkProductText===true`; absent policy → closed (handlers.ts rule (d)) | Privileged detail default-closed; included only on explicit human opt-in; absent policy → closed |
| Every action writes exactly one receipt; no privileged text in receipts, ids + outcome flags only; `payloadSha256` over canonical ids (handlers.ts rules (a),(b)) | Every escalation handoff writes exactly one receipt; payload represented by hash only |

## Mechanism sketch

Design-level only. Concrete record/endpoint names are proposals, not committed
API.

### 1. Referral record

A new **escalation/referral record** captures the decision and its scope. Most
likely it is realized as a paperclip work product on the matter issue (so it
inherits visible task state, the existing review flow, and the human gate),
rather than a brand-new artifact type. `UNCONFIRMED`: work product vs. a
dedicated record type — proposal is work product.

Proposed fields:

| Field | Purpose |
|---|---|
| `matterId` | The issue this referral belongs to |
| `subQuestion` | The single question being escalated (one referral may scope a subset of the matter) |
| `summary` | Generalized, non-privileged matter framing |
| `workToDate` | References (ids) to in-house work products, not their bodies |
| `includePrivileged` | Boolean, default `false`; flips only on explicit human opt-in |
| `targetFirm` | Optional; may be a placeholder until counsel is selected |
| `status` | `proposed` → `approved` → `released` (human-gated transitions) |

### 2. New gate-proxy receipt kind

`gate-proxy/src/receipts.ts` defines `ReceiptBody.kind` as the union
`"egress" | "anchor" | "quality" | "firm_facade" | "deadline"`. This design adds
one kind, proposed **`outside_counsel_referral`**, so every escalation handoff
lands in the same SHA-256 hash-chained, append-only receipt log and surfaces in
the Matter Trust Report alongside egress, facade, and deadline receipts.

- The receipt records ids + outcome flags only — `matterId`, referral id, a
  `privilegedDisclosed:true|false` flag, and the `outcome`
  (`pending` / `performed` / `blocked` / `error`). Following the firm-facade
  pattern, **no privileged text and no question text enters the receipt**; the
  payload is represented by `payloadSha256` over canonical ids.
- Delivery likely mirrors the facade's writer path
  (`FacadeReceiptWriter` → `POST /receipts/facade`). Proposed parallel endpoint:
  `POST /receipts/referral`. `UNCONFIRMED`: endpoint name and whether to reuse
  the facade writer abstraction or add a sibling.
- `UNCONFIRMED`: whether releasing a referral to outside counsel is also a new
  `BoundaryType` for the egress classifier or reuses the existing
  `THIRD_PARTY_EGRESS` boundary. Proposal: classify the *release* as
  `THIRD_PARTY_EGRESS` (it is third-party egress) and use the new receipt kind
  for the audit category.

### 3. Chief-counsel routing to escalate outward

`chief-counsel/AGENTS.md` gains a routing row for "matter or sub-question needs
expertise the in-house team does not own → assemble a referral package, gate it
for human approval, do not release." This is the first sanctioned exception to
the current "keep work inside this company" boundary, and it stays bounded: the
chief proposes; a human approves; nothing auto-sends.

`UNCONFIRMED`: whether a dedicated specialist (e.g.
`outside-counsel-referral-packager`) assembles the package, or `chief-counsel`
does it directly. Proposal: a specialist that mirrors the
`outside-counsel-engagement-drafter` shape, packaging-only and never
transmitting, reporting to `chief-counsel` (or `legal-ops-lead`).

### 4. How the existing engagement drafter/playbook fit

The two directions compose cleanly and stay distinct:

1. **Escalation (new):** decide to go outside, assemble the scoped referral
   package, human-gate the release. Outcome: the operator approaches outside
   counsel better-informed.
2. **Engagement (exists):** once a firm is selected, the
   `outside-counsel-engagement-drafter` drafts the engagement letter + billing
   guidelines via `outside-counsel-playbook` — a work product pending operator
   approval, never sent to the firm.

The referral package answers *"what does outside counsel need to take this
question?"*; the engagement package answers *"on what terms do we retain the
firm we chose?"* This design touches only (1) and leaves (2) unchanged.

## Eval walkthrough (Given / When / Then)

### Happy path — full-matter referral, human-approved

- **Given** an in-house team is running PossibLaw (`--teams inhouse`) and
  `chief-counsel` flags a matter as needing outside expertise.
- **When** the referral package is assembled (summary + work-to-date pointers +
  the specific question) and proposed for approval, and a human approves the
  release in the dashboard.
- **Then** the package is released to the operator for outside counsel, a single
  `outside_counsel_referral` receipt (`outcome:"performed"`) is appended to the
  hash-chained log, and the referral appears in the matter's Matter Trust
  Report.

### Edge case — single sub-question, privileged text stays closed

- **Given** a matter where only one sub-question (e.g. a novel jurisdictional
  point) needs outside counsel, and the rest stays in-house.
- **When** the referral scopes only that sub-question, with `includePrivileged`
  left at its default `false`.
- **Then** the package carries the generalized summary and the one question but
  **no privileged body text**; the receipt records `privilegedDisclosed:false`;
  the rest of the matter continues in-house untouched. Privileged detail is
  included only if a human explicitly opts in (`includePrivileged:true`), which
  is itself recorded.

### Failure / security case — no approval, no leak, no auto-send

- **Given** a referral package has been proposed but not yet approved.
- **When** any actor (agent, MCP client, or a retry) attempts to release it.
- **Then** the release **fails closed** — no human approval means nothing
  leaves, exactly as `request_approval` can never self-approve. Specifically:
  - Absent or `false` approval → blocked; a `blocked` receipt is written.
  - Privileged content is **never** included unless `includePrivileged:true` was
    explicitly set by a human; absent policy/flag is treated as closed.
  - Every handoff — proposed, approved, released, blocked — is receipted; there
    is no unaudited path.
  - Nothing auto-sends to an outside firm; release produces a package for the
    operator to carry, not an outbound transmission.

## What is NOT in scope (v1)

- **No automated sending** to an outside firm — no email, portal upload, or API
  push. v1 produces a package; the human carries it.
- **No e-billing / matter-management integration** (no LEDES, no outside-counsel
  billing systems).
- **No counsel selection or recommendation** — choosing the firm stays an
  operator decision (consistent with `outside-counsel-playbook` boundaries).
- **No conflicts check or privilege adjudication** automation — flagged as
  operator follow-ups, not resolved by an agent.
- **No two-way intake** of outside counsel's response back into the matter.
- **No new egress credentials** — the gate proxy remains the only credential
  holder; this design adds an audit category, not a transmission channel.

## Open questions (`UNCONFIRMED`)

| Question | Proposal |
|---|---|
| Referral realized as paperclip work product or new artifact type? | Work product on the matter issue |
| Receipt kind name | `outside_counsel_referral` |
| Receipt delivery endpoint | `POST /receipts/referral`, mirroring `POST /receipts/facade` |
| Egress boundary for release | Reuse `THIRD_PARTY_EGRESS`; new kind for audit category |
| Who packages the referral | New packaging-only specialist reporting to `chief-counsel` |

## Source references

- `mcp-servers/firm-facade/src/catalog.ts` — fixed allowlist as security boundary
- `mcp-servers/firm-facade/src/handlers.ts` — human-only approval, default-closed text, one-receipt-per-action, no privileged text in receipts
- `gate-proxy/src/receipts.ts` — `ReceiptBody.kind` union; hash-chained append-only log
- `companies/legal-operations/agents/chief-counsel/AGENTS.md` — current escalation = to operator
- `companies/legal-operations/agents/chief-of-staff/AGENTS.md` — current escalation = to operator
- `companies/legal-operations/skills/outside-counsel-playbook/SKILL.md` — engagement drafting (inverse direction; never sends)
- `companies/legal-operations/agents/outside-counsel-engagement-drafter/AGENTS.md` — engagement drafter (inverse direction; never sends)
