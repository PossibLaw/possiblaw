# Matter access — the firm's roster (C3)

`companies/legal-operations/matter-access.json` is the firm's answer to two
separate questions. It is checked in, human-readable, and authored by the firm —
not by an agent.

Ships **deny-all**. Nothing is granted until the firm writes a row.

## The two questions

**Matter entitlement** — *may this person touch this matter's content?*
Governs fetching work product, receiving delivery, and appearing in firm
overview.

**Decision authority** — *may this person make this class of decision?*
Governs who may approve a `MONEY_MOVEMENT`, a `SIGNATURE`, a `COURT_FILING`.
This is the board/owner concept: senior principals hold authority over the
firm's money and bindings.

They are **orthogonal and composed with AND**. A wire on a matter needs an
approver who holds `MONEY_MOVEMENT` authority *and*, where the check applies,
entitlement to the matters involved.

## Decision authority does not imply matter entitlement

An owner may approve a wire on a matter they cannot read.

This is deliberate. If owner ⇒ entitled-to-everything, the roster punches a hole
through the ethical walls `--add-wall` exists to build, and a screened partner
stops being screened. Seniority is not a cure for a conflict.

It works because the human gate never shows content: an approval carries
`payloadSha256`, the tool, and the boundary — no client facts. So an owner can
authorize on a matter they are walled off from without ever seeing it.

## Shape

```json
{
  "version": 1,
  "default": "deny",
  "matterAccess": {
    "jane.doe@firm.com": ["LEG-142", "LEG-207"]
  },
  "decisionAuthority": {
    "MONEY_MOVEMENT": ["owner@firm.com"],
    "COURT_FILING": ["jane.doe@firm.com"]
  }
}
```

**People are named by email**, matched against Paperclip's `user.email`.
**Matters are named by `issues.identifier`** — the `LEG-142` you already see in
the UI. Neither requires knowing a Paperclip internal id, so a partner can read
and audit this file. Both are resolved to ids when the launcher compiles it.

Valid boundaries: `THIRD_PARTY_EGRESS`, `CONFIDENTIAL_TO_CLOUD`, `COURT_FILING`,
`SIGNATURE`, `MONEY_MOVEMENT`, `IRREVERSIBLE_EXTERNAL_OP`.

## Fail closed

The gate refuses to start if any of these hold. Absence is never permission.

| Condition | Why it aborts rather than warns |
|---|---|
| File missing or unreadable | A deleted roster must not look like a working one |
| Not valid JSON | No partial parse; a truncated file is not a policy |
| `version` ≠ 1, `default` ≠ `"deny"` | There is no allow-by-default mode |
| Unknown top-level key | A typo like `mattarAccess` would silently disable the roster |
| Unknown boundary name | Same reason — a misspelled boundary grants nothing and says nothing |
| Email matching **zero** Paperclip users | The firm named someone who does not exist |
| Email matching **more than one** user | Picking one would bind an entitlement to a person the firm did not name |
| Identifier matching zero or multiple issues | Same, for matters |
| Two rows differing only by case | That is ambiguity, not two people |

Unlike tracing — which is evidence *about* a control and therefore fail-soft —
this **is** a control. It fails closed.

## What this is not

This file is the **baseline**. Effective access is the baseline folded together
with receipted override events, where a later revoke wins. Overrides are
time-bounded, require a granting admin different from the subject, and are
receipted rather than configured.

And the honest limit: this is enforcement **at the outlet, not the source**.
Paperclip has no per-matter read primitive, so an agent can still read a
screened matter. What this stops is content reaching an unentitled human, and it
makes the attempt visible. **A real conflicts screen still needs a wall**
(`--add-wall`).

Full design: `docs/superpowers/specs/2026-07-27-c3-matter-access-registry-design.md`.
