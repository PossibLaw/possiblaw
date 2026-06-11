---
name: equity-financing-playbook
description: Draft private-financing document skeletons when an equity-financing matter arrives, producing SAFEs, convertible notes, term sheets, or round consents in markdown with placeholders for unconfirmed terms and counsel flags for securities-law determinations.
metadata:
  sources:
    - path: companies/legal-operations/skills/equity-financing-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Equity Financing Playbook

Use this skill to draft a private-financing document skeleton. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary instructions, leave economic terms as bracket placeholders rather than invented figures, and flag every securities-law determination for the operator or responsible securities counsel.

## When To Invoke

- The issue requests a SAFE, convertible note, term sheet, or board or stockholder consent for a private financing round.
- The issue requests revisions to an existing PossibLaw-drafted financing skeleton; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for public-company disclosure work, trading-window matters, or general corporate governance documents; those belong to other specialists.

## Drafting Steps

1. Gather facts from the issue: company name, investor names, instrument requested, purchase amount or round size, valuation cap or price, discount, board composition and approval status, existing convertible instruments mentioned, closing timeline, and governing law.
2. Choose the instrument form. Default to a post-money SAFE. Draft a convertible note when the issue specifies one or describes maturity or interest terms; a term sheet when the issue requests a round summary for negotiation; board or stockholder consents when the issue requests round-approval documents. Draft multiple documents only when the issue asks for a set.
3. Draft the sections for the chosen instrument:
   - SAFE: purchase amount, valuation cap and discount treatment, conversion mechanics with defined-term placeholders, termination, company representations skeleton, investor representations skeleton with an `[OPERATOR / SECURITIES COUNSEL]` flag on investor-status items, and miscellaneous provisions.
   - Convertible note: principal, interest placeholder, maturity, conversion triggers (qualified financing, maturity, change of control), prepayment terms, representations skeletons, and events of default.
   - Term sheet: security type, amount and valuation placeholders, liquidation preference (default 1x non-participating, marked `[CONFIRM]`), board composition, pro rata and information rights, protective provisions list, exclusivity and confidentiality notes, and a non-binding legend.
   - Board or stockholder consents: recitals describing the round, resolutions authorizing the issuance and reserving shares, authorization of officers to execute documents, an omnibus resolution, and signature blocks for each director or stockholder.
4. Flag securities-law determinations. Mark exemption availability, accredited-investor status, and any filing obligation as `[OPERATOR / SECURITIES COUNSEL]` items; never assert that an exemption applies or that no filing is required.
5. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
6. Produce the output in the format below.

## Output Format

- A single well-structured markdown document per instrument: title block, body sections in the order above, and signature blocks with name, title, and date placeholders.
- A short `Assumptions and open items` section before the document body listing every placeholder, default, and counsel flag.
- A closing `Counsel review required` list naming each securities-law determination flagged.
- Preserve operator-specified names, amounts, caps, dates, and special terms exactly as given.

## Boundaries

- Do not opine on exemption availability, investor accreditation, or any filing obligation; flag those determinations for the operator or responsible securities counsel.
- Do not invent valuation caps, discounts, interest rates, or other economic terms; use placeholders.
- Do not provide investment, valuation, tax, or accounting advice; flag those topics as operator follow-ups when they surface.
- Do not file the documents with any regulator or transmit them to an investor or any external party or system; the draft is a work product pending operator approval.
