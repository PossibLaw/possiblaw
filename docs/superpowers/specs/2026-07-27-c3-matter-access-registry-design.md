
# C3 — User→Matter Access Registry — Design

Written 2026-07-27, at `main` @ `b19ced3`, after M1–M4 / A1–A3 / C0–C2 landed
(PRs #24–#31). Supersedes the C3 sketch in
`docs/builds/trace-spine-next-steps.md` where the two disagree; that sketch was
written before the identity model below was verified against the code.

Audience: the engineer or coding agent implementing C3.

---

## 1. The problem

A lawyer must not receive content from a matter they are not entitled to, and
that must be true even when the agent producing the content is mis-prompted or
injected.

The rule that makes this tractable: **the agent must never adjudicate
entitlement.** A model deciding who may see what is the LLM-judge failure mode —
non-deterministic, self-attested, defeatable by prompt injection. It would be
the only control in this architecture living inside the model.

So: a gate-side registry, checked outside the model, receipted on every
decision. The agent does not "refuse"; it simply cannot obtain the artifact, and
the denial is a receipt.

---

## 2. What the codebase actually provides (verified, not assumed)

This section exists because the original C3 sketch assumed a user principal that
does not exist. Every claim below was checked at `b19ced3`.

### 2.1 There is no human principal in PossibLaw code today

| Component | Principal | Evidence |
|---|---|---|
| Gate proxy | **agent** — `AuthenticatedAgent { agentId, companyId }` via Paperclip agent key → `/api/agents/me` | `gate-proxy/src/inbound-auth.ts:4-9` |
| Gate authorization grants | keyed by `agentId` | `gate-proxy/src/authorization.ts:118,259` |
| Egress request meta | `agentId`, `issueId`, `confidentiality`, `contextIssueIds` — **no user field** | `gate-proxy/src/types.ts:13-29` |
| Firm facade | env `PAPERCLIP_COMPANY_ID` + one API key; no per-request identity | `mcp-servers/firm-facade/src/server.ts:160`, `handlers.ts:129-159` |
| Firm overview | **one** process-wide `liveToken`, not per-lawyer at runtime | `firm-overview/src/auth.ts:26-28` |

`grep -rn "lawyerId|userId|principalId|humanId"` across `gate-proxy/src`,
`trace-store/src`, `mcp-servers`, `firm-overview/src`, `config`: **zero hits.**

**C0's `requestedBy` is declared but never populated on the egress path.** It
exists on `PerformAndReceiptInput` (`server.ts:289`), is destructured (`:296`)
and forwarded to the trace sink (`:383`), but none of the four
`performAndReceipt(...)` call sites (`:2117, :2172, :2228, :2341`) sets it. It
is structurally present and always `undefined`. Do not build on it as-is.

### 2.2 Paperclip does have humans, and we can read them without changing it

All read-only against the pinned submodule at `c91a0623`. **No upstream change
is required or permitted.**

| Fact | Evidence |
|---|---|
| `user` table has `id` (opaque text), `name`, `email` — both `notNull` | `paperclip/packages/db/src/schema/auth.ts:3-11` |
| `issues` has `id` (uuid) plus human-facing `identifier` and `issueNumber` | `paperclip/packages/db/src/schema/issues.ts:24,42-43` |
| `approvals` records `decidedByUserId` — the human who approved | `paperclip/packages/db/src/schema/approvals.ts:16` |
| A **board API key belongs to a named human** — `userId` is `notNull`, FK to `authUsers.id` | `paperclip/packages/db/src/schema/board_api_keys.ts:8` |
| Board-key auth sets `req.actor.userId = boardKey.userId` | `paperclip/server/src/middleware/auth.ts:109-124` |
| Approval decision records that userId | `paperclip/server/src/routes/approvals.ts:143` |
| The gate already calls `GET /api/approvals/:id` | `gate-proxy/src/paperclip-client.ts:138-147` |
| cli-auth challenges record `approvedByUser` | `paperclip/server/src/__tests__/cli-auth-routes.test.ts:186` |

**Correction to an earlier reading.** `decidedByUserId = req.actor.userId ?? "board"`
does *not* mean board approvals are anonymous. A board key carries its owner's
`userId`, so board approvals are attributable to a named human. The `"board"` /
`"local-board"` sentinel appears only on the unauthenticated local path
(`middleware/auth.ts:27-28`) — the mode `--auth-mode authenticated` replaces.

**Consequence:** in an authenticated deployment, every approval carries a real,
Paperclip-verified human identity, whether that human signed in or used a board
key. That identity is not self-reported by an agent, so it holds against an
injected one. It is the principal C3 checks.

### 2.3 Existing pattern to follow

`companies/legal-operations/gate-authorization.json` is a firm-authored,
checked-in document the launcher compiles at startup — resolving agent slugs to
Paperclip ids and env vars to destination ids
(`bin/possiblaw:1368-1379`) — into a runtime policy the gate loads fail-closed.
C3's document uses this exact pipeline.

---

## 3. Design

### 3.1 Two authorities, orthogonal, composed with AND

**Matter entitlement** — *may this human touch this matter's content?* Per-lawyer.
Governs fetching work product, receiving delivery, appearing in firm overview,
and approving an egress that draws on matters.

**Decision authority** — *may this human make this class of decision?*
Per-boundary, over the boundaries already enumerated in `gate-policy.yaml`
(`MONEY_MOVEMENT`, `SIGNATURE`, `COURT_FILING`, `THIRD_PARTY_EGRESS`,
`IRREVERSIBLE_EXTERNAL_OP`). This is the firm's board/owner concept: senior
principals hold authority over the firm's money and bindings.

**DECISION: decision authority does NOT imply matter entitlement.** An owner may
approve a `MONEY_MOVEMENT` on any matter and still be unable to read that
matter's content.

This is load-bearing. If owner ⇒ entitled-to-everything, C3 punches a hole
through the ethical walls `--add-wall` exists to build, and a screened partner
is no longer screened. Seniority is not a cure for a conflict.

The trade-off is already resolved by shipped code: **the human gate never shows
content.** `gate-proxy/src/gates/human.ts:85-94` sends `payloadSha256`, the tool,
the boundary, and the literal summary "the payload is represented by its SHA-256
hash only." An owner can therefore authorize a wire on a matter they are walled
off from, seeing a hash and a boundary and no client facts. No new approval
surface is needed.

### 3.2 Where it lives

**Inside `gate-proxy/`, exposed over the gate's existing HTTP surface. No new
package.**

The gate is already the policy authority and receipt-chain owner, and the facade
already talks to it (`receipts:facade` is a live target in
`gate-authorization.json`). One registry means one fold, one chain, one place
where "deny" is decided. A shared package consumed by three components would
mean three folds and three chains to reconcile — and a new package must be
registered in both `bin/verify` PACKAGES and the CI workflow install list, the
omission that cost a full red round across six PRs.

Two new authorization targets in
`FIXED_GATE_AUTHORIZATION_TARGETS` (`authorization.ts:4-14`):
`matters:access:read`, `matters:access:override`.

### 3.3 The firm document

`companies/legal-operations/matter-access.json`, checked in, firm-owned,
human-readable, compiled by the launcher.

```json
{
  "version": 1,
  "default": "deny",
  "matterAccess": {
    "jane.doe@firm.com": ["LEG-142", "LEG-207"]
  },
  "decisionAuthority": {
    "MONEY_MOVEMENT": ["owner@firm.com"],
    "COURT_FILING":   ["jane.doe@firm.com"]
  }
}
```

- **People are named by email.** `user.email` is `notNull`, so this joins
  directly, and the firm authors it without knowing any Paperclip internals.
- **Matters are named by `issues.identifier`** (e.g. `LEG-142`), resolved to the
  issue uuid at load — exactly as agent slugs resolve today.
- The firm never sees a uuid. Partners can read and audit this file.

**Load-time validation, all fail-closed (refuse to start):** `version !== 1`;
`default !== "deny"`; an email matching zero or multiple Paperclip users; an
identifier matching zero or multiple issues in the company; an unknown boundary
name in `decisionAuthority`; bounded sizes on every map.

### 3.4 The fold

Effective access = **document baseline ⊕ receipted override events**, folded in
**chain order, not wall-clock order**. Clocks move backwards, two events can
share a second, and the chain is the authority on sequence — the same reasoning
that made M4's cursor a set of ids rather than a timestamp watermark.

For each `(userId, matterId)` pair, the last event in chain order decides:

| Last event in chain order | Result |
|---|---|
| none | baseline |
| `access_revoke` | **denied — beats the baseline** |
| `access_override` grant, `expiresAt > now` | allowed |
| `access_override` grant, `expiresAt <= now` | falls back to baseline |

**Row 2 is the whole point, and it is where copying `matter-classification.ts`
by analogy produces the wrong system.** That registry is raise-only: a later,
lower registration is *ignored*, because the POST route is reachable by the
agents whose labels it distrusts. An access registry inverts this — a later
revoke must **win**, including over the baseline. If revoke only beat prior
grants, revoking someone the document lists would be a no-op until the file was
edited: a wall that cannot be taken down.

Same inversion applies to expiry: a later grant with a *shorter* expiry wins over
an earlier longer one. Later always wins, even when less permissive. This is
deliberately unlike raise-only.

**Document reloads open a new epoch.** Each load appends a receipt carrying the
document's `sha256`. Revokes from before the current epoch do not suppress pairs
the new document grants; revokes after it do. Without epochs, a runtime revoke
silently outlives the firm's own edit — the firm adds Jane back to LEG-142,
reloads, and nothing happens. With them, the document stays genuinely
authoritative while runtime revokes still win inside an epoch.

### 3.5 Overrides

Receipted, not configured. `kind: "authorization"`, `reason: "access_override"`
or `"access_revoke"`, carrying granting admin userId, subject userId, matter id,
and `expiresAt`. Ids and enums only — never a reason string containing matter
facts. Receipt `meta` is bounded (4096 B total, 512 chars/string, 8 deep);
truncate at the write site per `boundedErrorMessage`.

Under the ICME rubric an override is *good* evidence: "the rule fired and a named
human overrode it at 14:52" beats a rule that never fired.

**Write-time rejections — throw, append no receipt:**

- granting admin userId == subject userId (separation of duties)
- `expiresAt` absent, malformed, or in the past (an override without expiry
  becomes the new baseline)
- unknown email or matter identifier
- corrupt chain

### 3.6 Enforcement points

**1. Gate egress at resume.** When the gate polls an approval and sees
`approved`, it reads `decidedByUserId` and checks:

- **decision authority** for the boundary, and
- **matter entitlement** for the filed `issueId` *and every matter in
  `contextIssueIds`* — the C1/C2 machinery reused, which is what catches the
  contamination case.

Unauthorized → refuse to perform, append a denial receipt, comment on the issue
with the reason. `ApprovalRecord` (`paperclip-client.ts:31-35`) gains
`decidedByUserId?: string` — a change to *our* type; the field is already in the
API response.

Checking at resume rather than pre-flight is deliberate: at approval-creation
time the gate does not know who will approve. The cost is that a human sees
"approved" in the dashboard while the action does not proceed, which is why the
denial receipt and issue comment must state why.

**2. Firm overview.** Read `approvedByUser` off the cli-auth challenge —
currently fetched and discarded, `firm-overview/src/auth.ts` destructures only
`{ status }` — and filter the merged board to entitled matters.

**3. Firm facade — DEFERRED.** Extend `guardCompanyScope`
(`handlers.ts:129-159`) to matter scope. Blocked: the facade has no per-request
human identity today (env `companyId` + one API key). Backlog item, Open
Question 1; it does not gate the other two points.

### 3.7 Denial semantics

The invariant is "denial is redaction, not error." It holds at two of three
points, and the exception is stated rather than hidden.

- **Firm overview** — the matter is omitted from the board. Clean redaction.
- **Facade `fetch_work_product`** — record returned, text withheld. This is
  already the shipped default (`firmFacade.allowWorkProductText: false`), so C3
  reuses the existing path.
- **Gate egress at resume** — cannot be a redaction; the wire either moves or it
  does not. Honest denial, receipted, with an issue comment.

**DECISION: no fabricated answers. A screened matter says it is screened.**

An earlier draft proposed making a screened matter indistinguishable from a
nonexistent one, to avoid confirming that the firm represents a client. The
operator rejected this on domain grounds and is right: a lawyer knowing a matter
exists is not the conflict — working on it is — and lawyers often have a
legitimate need to discuss whether they should be screened. A fake not-found is
a lie the system tells its own users.

Therefore: genuine not-found returns not-found. A screened matter returns a
distinct `matter_access_denied`, consistent in shape with the existing
`company_scope_violation` (`handlers.ts:155`). Both are receipted.

### 3.8 Failure posture

**Fail closed. C3 is a control, not evidence about one** — the tracing carve-out
in invariant 2 does not apply.

- Document missing, malformed, or unresolvable → **refuse to start**, matching
  `gate-authorization.json`.
- Corrupt receipt chain → registry denies everything; gate stays bootable;
  `/health` reports `receipts_corrupt`.

The corrupt-chain posture *structurally* mirrors `MatterClassificationRegistry`
(bootable, degraded, operator repairs and restarts) but the safe default is
**inverted**: that registry returns `undefined` (no floors) and leans on the
policy default; this one denies. No readable chain means no readable
entitlements means deny.

**Operational consequence, stated plainly: a corrupt chain halts all matter
access firm-wide until repaired.** This follows from invariant 2 and is accepted,
not overlooked.

### 3.9 `local-board` and the production requirement

Paperclip resolves an actor three ways (`middleware/auth.ts`): a signed-in human
(real `userId`), a board API key (the key owner's real `userId` — keys are
FK'd to a person), or **local implicit** — nobody logged in, because the server
is running without auth and the trust boundary is "you are on the machine."
That third path has no person to name, so Paperclip stamps the placeholder
`userId: "local-board"` (`auth.ts:27-28`).

**`local-board` is not a person.** It is the string meaning "trusted local
machine, no login." Handed it, C3 has nobody to look up.

**RULE: `local-board` is treated as entitled in `local_trusted` mode only. In
production mode the gate refuses to start unless `--auth-mode authenticated` is
on.** Every production action therefore has a real named human behind it, which
is the whole point (§7.1).

---

## 4. Test plan

### 4.1 Ordering interleavings (the sharp edge — test explicitly)

1. baseline grant, no events → allowed
2. baseline grant → revoke → **denied** (revoke beats baseline)
3. baseline grant → revoke → grant → allowed (later chain position wins)
4. no baseline → grant → allowed until expiry
5. no baseline → grant → clock passes `expiresAt` → denied
6. baseline grant → revoke → reload still granting → allowed (new epoch)
7. baseline grant → reload omitting the pair → denied
8. two grants, later with a *shorter* expiry → shorter applies
9. self-granted override → rejected at write, no receipt appended
10. `expiresAt` in the past → rejected at write
11. corrupt chain → all reads deny, override writes throw
12. two events in the same millisecond → chain order decides, not timestamp

### 4.2 Given/When/Then

**Happy.** Given Jane is listed for LEG-142 and holds `COURT_FILING` authority;
When she approves a court-filing egress on LEG-142; Then the gate performs it and
the receipt records the approver.

**Edge.** Given an owner holds `MONEY_MOVEMENT` but no entitlement to LEG-142;
When they approve a wire on LEG-142; Then it performs, no matter content is ever
shown to them, and the receipt records authority-without-entitlement.

**Failure / security.** Given Jane is not entitled to LEG-207; When an agent
submits an egress whose `contextIssueIds` include LEG-207 and Jane approves;
Then the gate refuses at resume, appends a denial receipt, and comments on the
issue with the reason.

### 4.3 Integration

`bin/smoke-trace` before claiming any unit done. Unit tests caught **neither**
integration bug in the M1–M4 work; both needed a real process.

---

## 5. Build order — five small PRs

1. Document schema + loader + launcher compile (email → `user.id`, identifier →
   issue uuid), fail-closed. No enforcement.
2. `AccessRegistry` fold — baseline ⊕ overrides, epochs, revoke-wins — plus the
   override write path with separation of duties. Receipts. No enforcement.
3. Enforcement at gate egress resume (`decidedByUserId` → decision authority +
   matter entitlement over `issueId` ∪ `contextIssueIds`).
4. Enforcement at firm overview (read `approvedByUser` off the cli-auth
   challenge; filter the merged board).
5. **DEFERRED — enforcement at the facade.** Blocked on giving the facade a
   per-request human identity (Open Question 1). Backlog item; do not stall
   PRs 1–4 behind it.

No new package, so nothing to add to `bin/verify` PACKAGES or the CI install
list. Each PR: `nvm`/`fnm use` first, `pnpm -C gate-proxy test`, `bin/smoke-trace`.

---

## 6. Scope honesty — keep this in the docs

**This is enforcement at the outlet, not the source.** Paperclip has no
per-matter read primitive, so the agent can still read the screened matter. C3
stops content reaching an unentitled human and makes the attempt visible.

**A real conflicts screen still needs a wall** (`--add-wall`). Do not let roadmap
language drift into claiming more.

**Non-gated egress is out of scope.** `CONFIDENTIAL_TO_CLOUD: anonymize` and any
`allow` boundary have no human in the loop, so there is no user to check. Those
remain covered by C2's confidentiality floor alone.

---

## 7. Decisions taken

| Decision | Status |
|---|---|
| People named by email; matters named by `issues.identifier` | ACCEPTED (operator) |
| Firm document as baseline + receipted, time-bounded overrides | ACCEPTED (operator) |
| Decision authority does NOT imply matter entitlement | ACCEPTED (operator) |
| Enforce at approval resume, not pre-flight | ACCEPTED (operator) |
| No fabricated answers — screened says screened, not-found says not-found | ACCEPTED (operator) |
| Registry inside `gate-proxy`, not a new shared package | PROPOSED |
| Revoke beats baseline; later-wins including shorter expiry | PROPOSED |
| Document reload opens a new epoch | PROPOSED |
| Corrupt chain denies all access firm-wide | PROPOSED — follows from invariant 2 |
| Per-user identity is the goal everywhere, not only for conflicts | ACCEPTED (operator) |
| `local-board` allowed in `local_trusted` only; production requires authenticated mode | ACCEPTED (operator) |
| No email recipient allowlist — firm and user decide recipients | ACCEPTED (operator) — closed |
| No change to the pinned `paperclip/` submodule | INVARIANT |

### 7.1 The framing principle — "who said that, who did that"

Operator framing, and the reason per-user identity is worth building independent
of conflicts: **every record should name a person, not a process.** "Someone
approved this" is not evidence; "Jane Doe approved this at 14:52" is. It makes
the record personal, which is what makes it accountable — and it is the same
property that makes a receipt useful to opposing counsel.

Apply this as a design test on any new record, receipt, or log line: if it says
*someone*, it is not finished.

## 8. Open questions

1. **The facade has no human identity** (`server.ts:160` — env companyId, one
   API key). Per-user identity is the accepted direction (§7.1), so this is a
   **backlog item, not a blocker**: PRs 1–4 proceed without it. PR 5 (facade
   enforcement) is deferred until the facade has a per-request session.
   Splitting it out is deliberate — do not stall the other four on it.
2. **Retention is under-specified and needs its own unit — see R1 below.**
3. **M4's poller is still unscheduled** — built and inert. Unchanged by this spec.

## 9. R1 — Retention and litigation hold (adjacent unit, not part of C3)

Recorded here because the operator specified it while reviewing C3. It is **not**
in C3's scope and should be sequenced after it, reusing the same receipted-
override machinery.

**What exists today:** a single global `retentionDays: 90` in `gate-policy.yaml`.
The purge removes content only — record, hash, and any bound receipt survive, so
attestation over the matter stays verifiable for its life. That part is right and
should not change.

**What is wrong:** 90 days was an engineer's default, never a firm decision, and
a single global number cannot express what firms actually need.

**Requirements (operator, 2026-07-27):**

1. **Law-firm default is 5 years**, not 90 days.
2. **Legal departments set it by their own policy** — anywhere from 90 days to
   several years. It must be configurable per deployment.
3. **Litigation hold**: when a matter is on hold, content is retained for as long
   as the litigation runs. Per-matter, indefinite, and it overrides the clock.

**The sharp edge.** A hold that can be silently lifted is worse than no hold at
all — it converts a retention feature into a spoliation exposure. Placement
*and* lifting must both be receipted, naming the human and the time, with the
same separation-of-duties rule as the access override in §3.5. "The hold was
lifted by a named partner on this date" is defensible; "the content is gone and
we cannot say why" is not.

**Interaction with C3:** a purge must not be able to delete content that a hold
protects, and a hold must survive a restart — so it folds over the receipt chain
exactly as access does. Build it after C3 so the fold is already proven.
