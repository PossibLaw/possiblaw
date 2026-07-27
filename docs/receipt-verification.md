# Receipt Chain Verification

How to verify a PossibLaw receipt chain **without running our software**.

This document is the normative specification. It is written so a third party —
a client, an auditor, opposing counsel, a court-appointed expert — can
implement a verifier in any language and reach the same verdict we do. A chain
you can only check with the producer's tooling is still the producer's word;
this document exists to remove that dependency.

A reference implementation ships at `gate-proxy/tools/verify-receipts.mjs`. It
is deliberately standalone — plain ES modules, Node's bundled `crypto`, no
packages to install, no imports from the rest of the codebase.

```
node verify-receipts.mjs receipts.jsonl [--company <id>] [--json]
```

Exit `0` verified, `1` invalid, `2` usage or I/O error.

The reference implementation and the producer are checked against each other by
`gate-proxy/src/verify-tool.test.ts`. If they ever disagree with this document,
this document is authoritative and one of them has a bug.

---

## 1. File format

A receipt chain is a **JSONL** file: one JSON object per line, UTF-8, appended
in order and never rewritten. Blank lines are ignored. Each line is one receipt
entry:

```json
{"seq":1,"ts":"...","prevHash":"...","hash":"...","body":{...}}
```

| Field | Type | Meaning |
|---|---|---|
| `seq` | integer ≥ 1 | Position in the chain. Starts at 1, increments by exactly 1. |
| `ts` | string | ISO-8601 UTC timestamp written by the producer. |
| `prevHash` | string | `hash` of the preceding entry, or `GENESIS` for `seq` 1. |
| `hash` | string | 64-char lowercase hex, computed per §3. |
| `body` | object | The receipt contents. |

Key order **within a line** is not significant — verification re-serializes
canonically (§2). Order **of lines** is significant.

`body` never contains payload text. It carries identifiers, enumerations and
hashes only: `payloadSha256` stands in for whatever was sent. That is what lets
a chain be handed to an outside party without disclosing the underlying matter.

This is enforced at write time, not merely intended. `body.meta` is bounded to
4096 bytes total, 512 characters per string value, and 8 levels of nesting; an
append that violates any of those is rejected and no entry is written. A
verifier does not need to check these bounds — they are a producer-side
guarantee about what a chain can contain, stated here so a recipient knows what
they are and are not being handed.

---

## 2. Canonical JSON

Before hashing, a value is serialized to a canonical form:

1. **Objects** — keys sorted ascending, then `"key":value` pairs joined by `,`
   and wrapped in `{}`. Sorting is over UTF-16 code units (the default
   lexicographic sort in ECMAScript, equivalent to sorting the raw UTF-16 code
   unit sequence). Keys are escaped as JSON strings.
2. **Arrays** — element order **preserved**, elements canonicalized, joined by
   `,` and wrapped in `[]`.
3. **Everything else** — standard JSON serialization: strings escaped per
   RFC 8259, numbers per ECMA-262 `Number::toString`, plus `true`, `false`,
   `null`.

No whitespace anywhere.

Entries on disk have already passed through a JSON round trip when written, so
`undefined` never appears in a stored `body` and an implementation does not
need to handle it.

**Cross-language note.** Two details bite implementers outside JavaScript:

- **Number formatting.** Use the shortest representation that round-trips
  (ECMA-262 `Number::toString`). In practice receipt bodies carry integers and
  strings, so this rarely matters — but do not emit `1.0` for `1`, and do not
  reformat a value that arrived as an integer.
- **Key sort.** Sort by UTF-16 code unit, not by locale, and not by Unicode
  code point. These differ only for characters outside the Basic Multilingual
  Plane; receipt keys are ASCII in practice, so any of the three agree today.
  Sort by code unit to be exact.

---

## 3. Entry hash

For each entry:

```
preimage = prevHash || canonicalJson({ seq, ts, body })
hash     = lowercase_hex( SHA-256( UTF-8( preimage ) ) )
```

`||` is string concatenation. Note that `canonicalJson` sorts the three
top-level keys, so the object is always serialized in the order
`body`, `seq`, `ts`.

`prevHash` for `seq` 1 is the literal ASCII string `GENESIS` (no quotes, not a
hash).

### Worked example

A one-entry chain, exactly as written to disk:

```json
{"seq":1,"ts":"2026-07-27T19:48:42.707Z","prevHash":"GENESIS","hash":"36bc9572dbc0d91a681ceefbd46e88d5e030102cbda9653ec172c4d577885be7","body":{"kind":"egress","tool":"send_email","boundary":"THIRD_PARTY_EGRESS","decision":"human","outcome":"performed","payloadSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","agentId":"agent-1"}}
```

The preimage — note the sorted keys, and that the stored line's key order is
discarded:

```
GENESIS{"body":{"agentId":"agent-1","boundary":"THIRD_PARTY_EGRESS","decision":"human","kind":"egress","outcome":"performed","payloadSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tool":"send_email"},"seq":1,"ts":"2026-07-27T19:48:42.707Z"}
```

SHA-256 of that string is
`36bc9572dbc0d91a681ceefbd46e88d5e030102cbda9653ec172c4d577885be7`, matching
the stored `hash`.

Reproduce it with nothing but a shell — copy the preimage above verbatim,
including the leading `GENESIS` and with no trailing newline:

```bash
printf '%s' 'GENESIS{"body":{"agentId":"agent-1","boundary":"THIRD_PARTY_EGRESS","decision":"human","kind":"egress","outcome":"performed","payloadSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tool":"send_email"},"seq":1,"ts":"2026-07-27T19:48:42.707Z"}' \
  | openssl dgst -sha256 -r | cut -d' ' -f1
# 36bc9572dbc0d91a681ceefbd46e88d5e030102cbda9653ec172c4d577885be7
```

If that command reproduces the stored hash on your machine, you have
independently confirmed the hashing rule in §3 without running any of our
code. The rest of verification is applying it line by line.

---

## 4. Chain rules

Walk the file top to bottom, carrying `prevHash = "GENESIS"` and
`expectedSeq = 1`. For each line:

1. It must parse as a JSON object.
2. `seq` must equal `expectedSeq`.
3. `hash` must be 64-char lowercase hex.
4. `prevHash` must equal the running `prevHash`.
5. The recomputed hash (§3) must equal `hash`.
6. *(optional)* If verifying custody, `body.companyId` must equal the expected
   company id.

Then set `prevHash = hash`, increment `expectedSeq`, continue.

An empty file is a valid chain of length 0 with head `GENESIS`.

The **head** is the last entry's `hash`. It commits to the entire chain: any
change anywhere produces a different head.

### What a failure tells you

Everything *before* the failing line still verifies on its own terms — a break
localizes the tampering rather than voiding the whole file.

| Symptom | What happened |
|---|---|
| `hash mismatch` at line *n* | Entry *n* was altered after it was written. |
| `prevHash mismatch` at line *n* | Entry *n−1* was altered and re-hashed, or a line was inserted/removed. |
| `seq out of order` at line *n* | A line was removed or reordered. |
| `unparseable JSON` | Truncated write or corruption. |

---

## 5. Execution-trace bindings

An entry may carry `body.traceId` and `body.traceSha256`. These bind the action
to a record in the firm's execution trace store — which model ran, what context
was drawn on, and (subject to the firm's capture policy) the prompt itself.

**Those traces are deliberately not in this file, and their absence is not a
gap in what you were given.** The receipt chain is hash-only so it can be handed
to an outside party; the traces are content-bearing and stay inside the firm.
`traceSha256` is a commitment: if a trace is later produced — in discovery, to
an auditor, under a protective order — it can be checked against this chain, and
a substituted trace will not match.

The binding survives the firm's retention purge. Purging strips a trace's
content but keeps the record and its hash, so `traceSha256` still resolves for
the life of the matter.

---

## 6. External timestamps

Sections 1–4 prove **internal consistency**: nothing in the file was altered after
the fact. They do **not**, on their own, prove *when* the chain was written —
every `ts` in it is the operator's own assertion. An operator could in
principle regenerate an entire chain and it would verify perfectly.

That gap is closed by anchoring. An entry with `body.kind === "anchor"` and
`body.meta.tsa` records an RFC 3161 timestamp obtained over the chain head from
an authority outside the operator's control:

```json
"meta": { "tsa": {
  "url": "https://tsa.example/tsr",
  "status": 0,
  "tokenSha256": "<hex>",
  "anchorTextSha256": "<hex>"
}}
```

The token and the original request are stored beside the ledger in `anchors/`,
named by token hash: `<tokenSha256>.tsr` and `<tokenSha256>.tsr.tsq`. Verify
one against a trusted TSA certificate with standard tooling:

```bash
openssl ts -verify -in <tokenSha256>.tsr \
  -queryfile <tokenSha256>.tsr.tsq -CAfile <tsa-ca>.pem
```

We do not verify these tokens ourselves and do not ask you to trust that we
did. The token is ordinary RFC 3161 evidence; check it with whatever you
already trust.

**A chain with no anchor entries is internally consistent but not externally
witnessed.** The reference verifier says so explicitly rather than reporting a
bare "OK".

---

## 7. What a verified chain does and does not prove

**Does prove.** These receipts were written in this order; none has been
altered, removed, or reordered since; for each gated action the recorded
boundary, policy decision, and outcome are as stated; the policy in force is
identified by `meta.enforcementDigest`; and — where anchored — the chain
existed no later than the timestamp.

**Does not prove.** That the *contents* of what was sent were correct or
truthful; a receipt commits to `payloadSha256`, so it proves *which* bytes were
sent to anyone who also holds those bytes, not that they were right. That
actions outside the gated boundaries were controlled — see `docs/roadmap.md`
for exactly which tools are gated and which paths are documented as ungated.
That the operator ran a gate at all for some action that produced no receipt;
absence of a receipt is not evidence of absence of an action.

That last point is the honest limit of any receipt system: it proves what was
recorded, and a separate control has to make recording unavoidable.

---

## 8. Recovering `enforcementDigest`

`meta.enforcementDigest` is `SHA-256(canonicalJson({policy, authorization}))`
over the effective gate policy and the compiled agent-authorization table. It
lets a receipt prove **which** rules were in force without disclosing them —
the same commitment property as `payloadSha256`.

To confirm a chain ran under a policy you have been given, canonicalize that
policy the same way and compare digests. A mismatch means the policy you hold
is not the one that was enforced.
