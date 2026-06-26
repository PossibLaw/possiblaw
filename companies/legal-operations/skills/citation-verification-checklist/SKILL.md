---
name: citation-verification-checklist
description: Verify the citations and quotations in an operator-supplied draft against operator-supplied sources or connector results when a citation-check matter arrives, producing a per-citation verification table with discrepancies and operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/citation-verification-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Citation Verification Checklist

Use this skill to run a structured, citation-by-citation check of an operator-supplied draft. The output is a verification table the operator or responsible attorney can act on row by row. Verification means the citation and quoted or paraphrased material match a source in hand; it never means the authority is good law.

## Verification Steps

1. Inventory the citations. List every citation in the draft in order of appearance, exactly as written, including pinpoints. If the draft is absent, gate with `missing-info-gate` instead of guessing.
2. Match each citation to a source. Prefer an operator-supplied source; otherwise retrieve the authority through `connector-courtlistener`. Record which source was checked for each row. If neither path yields the source, mark the row `UNVERIFIED` with the lookup attempted.
3. Capture the per-citation fields for every row:
   - Citation as written in the draft (verbatim, including pinpoint)
   - Source checked (operator-supplied document or connector result, named)
   - Citation elements compared: case or authority name, citation string, court, year, pinpoint
   - Quote or proposition compared, and the source passage it was checked against
   - Match result and discrepancy detail
4. Compare quotations character by character. Apply the quote-fidelity rules below to every quoted passage.
5. Check paraphrases on their face. Where the draft paraphrases, record whether the cited source supports the proposition as stated, quoting the supporting or contradicting passage.
6. Produce the verification table, discrepancy summary, and operator follow-ups in the format below.

## Verification Table Format

| Citation as written | Source checked | Quote/proposition matches? | Discrepancy |
|---|---|---|---|
| Verbatim citation from the draft, with pinpoint | Operator-supplied document or connector result, named | `Yes` / `No` / `Partial` / `UNVERIFIED` | Exact difference found, side-by-side text where useful, or `—` |

One row per citation, in draft order. Never merge rows; a citation repeated with a different pinpoint gets its own row.

## Quote-Fidelity Rules

- Compare quoted text against the source character by character; spelling, punctuation, capitalization, and emphasis all count.
- Flag every alteration not marked with brackets and every omission not marked with an ellipsis.
- Flag bracketed alterations or ellipses that change the apparent meaning of the source passage.
- Record the source passage verbatim next to the draft text for every mismatch so the operator can decide without re-pulling the source.

## Currency and Treatment Checks

This checklist verifies fidelity, not validity. Frame currency and treatment as operator follow-ups in every report:

- For each verified citation, list a follow-up to run a citator check (KeyCite, Shepard's, or equivalent) before relying on the authority.
- Note any later history, vacatur, or negative-treatment signal visible on the face of a retrieved source as a fact, with the follow-up to confirm via a citator.
- Never report treatment as resolved; the citator check belongs to the operator or responsible attorney.

## Gate Registration

When `GATE_PROXY_URL` is set, the gate proxy blocks a court filing or third-party send of any citation-bearing draft until a passing verification is registered for that exact text. Register only a fully passing table; registration is evidence for the gate, not approval — the human gate still applies.

1. Register only when every row is `Yes`. A table with any `No` / `Partial` / `UNVERIFIED` row is a findings report — deliver it to the operator and do not register.
2. Build the registration body from the table: one row object per table row — `citation` (verbatim, with pinpoint, as written in the draft), `match` (`Yes`), and for any quoted passage `quoted` (the draft's quoted text) plus `sourcePassage` (the source text it was checked against). The proxy re-checks that each quoted string appears verbatim (after Unicode normalization) in BOTH the source passage and the draft, so `quoted` must be text that is actually in the draft.
3. The `document` field must be the EXACT text that will be sent or filed — the same body the connector skill puts in its egress payload (`body` for email, `content` for an upload, `documentText` for a court filing). Write the JSON to a temp file; never inline draft text in shell history:

   ```sh
   curl -sS -X POST -H "Content-Type: application/json" \
     --data @/tmp/citation-registration.json \
     "${GATE_PROXY_URL}/quality/citation"
   ```

   with the temp file holding `{"document":"<exact draft text>","rows":[…],"meta":{"agentId":"$PAPERCLIP_AGENT_ID","issueId":"<issue>"}}`.
4. `200 {registered:true, documentSha256, citationCount}` — record the `documentSha256` in the completion note. The draft must egress with this exact text; any later edit changes the sha and requires re-verification and re-registration.
5. `422 {registered:false, reason, details}` — the proxy's deterministic re-check disagrees with the table. `coverage_gap`: the draft cites something with no row (the `details` list the missing citations). `unverified_rows`: a row is not `Yes`. `quote_mismatch`: a `quoted` string is not verbatim in its `sourcePassage` or in the draft. Treat the response as new findings — fix the table or flag the draft to the operator. Never delete citations from the draft to dodge coverage.
6. `400` — malformed registration body; fix the JSON shape and retry.

## Boundaries

- Never assert that a citation is good law, controlling, current, or still authoritative; no Shepardizing or KeyCite claims.
- Never verify from memory; every `Yes` requires the source text in hand from an operator-supplied document or connector result.
- Do not correct the draft; deliver findings in the table for operator decision.
- Do not transmit the table or the draft to any external party or system; the report is a work product pending operator approval.
