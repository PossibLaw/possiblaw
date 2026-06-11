---
name: influencer-disclosure-checklist
description: Review influencer and endorsement content and agreements when a disclosure matter arrives, producing risk-rated findings on material-connection disclosure presence, placement, clarity, and platform fit.
metadata:
  sources:
    - path: companies/legal-operations/skills/influencer-disclosure-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Influencer Disclosure Checklist

Use this skill to run a structured review of influencer or endorsement content and agreements for material-connection disclosure adequacy. The output is a findings table the operator or responsible counsel can act on row by row; clearance decisions belong to the operator or responsible counsel, never to this review.

## Review Steps

1. Scope intake. Record the content items under review (each with its platform and format), the agreements supplied, the material connection between the endorser and the sponsor (payment, free product or service, affiliate commission, employment, family or personal relationship), and any items the operator excluded. If the content and the material connection are both absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the material-connection inventory. List one row per content item or agreement with the connection as stated in the issue. An unstated connection is a gap to record, never an assumption to make in either direction.
3. Assess each content item against all of the following, noting any element that cannot be assessed from the supplied materials:
   - Presence: a material-connection disclosure exists at all
   - Placement: visible without expanding truncated captions, scrolling, or clicking through, and within the content itself rather than only a bio or linked page
   - Clarity: unambiguous sponsorship language; flag vague tags, ambiguous abbreviations, and thanks-only phrasing
   - Platform fit: suited to the format — spoken or on-screen for video and livestream, on-image for stories and other short-lived formats, above-the-fold text for posts
   - Consistency: the endorsement is consistent with the stated connection and the endorser's stated experience
4. Assess each agreement for disclosure obligations: a requirement that the endorser make adequate material-connection disclosures, any specific language or placement requirements, sponsor rights to address noncompliant posts, and the absence of any term discouraging disclosure. Record missing obligations as findings.
5. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: no disclosure of a stated material connection, a disclosure hidden from ordinary view, or agreement language discouraging disclosure.
   - `Medium`: a disclosure that is present but unclear, poorly placed, or ill-suited to the format, or an agreement lacking specific disclosure requirements.
   - `Low`: stylistic, minor clarity, or completeness issues.
6. Flag regime and platform-policy dependence. Where adequacy turns on an endorsement regime or a platform's disclosure tooling and policies, state the dependency, mark it `Operator flag`, and route the determination to the operator or responsible counsel. Do not resolve it in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Item | Material connection | Risk | Issue | Suggested action |
|---|---|---|---|---|
| Content item or agreement reference with platform and format | The connection as stated, or `[NOT STATED]` | High / Medium / Low | One- or two-sentence issue statement with rationale | Disclosure language, a placement change, an agreement term, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested action. Append operator flags as their own rows with `Operator flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of operator flags.
- Items lacking any disclosure and agreements missing disclosure obligations.
- Items or elements not assessable from the supplied materials and why.
- A short ordered list of next actions for the operator, starting with `High` findings, and a closing statement that the clearance decision belongs to the operator or responsible counsel.

## Boundaries

- Do not clear content for posting or certify an agreement as compliant; deliver findings for operator decision.
- Do not assert that a disclosure satisfies any endorsement statute, rule, or guideline, predict how a regulator would treat it, or give jurisdiction-specific advice as settled.
- Do not contact the influencer, an agency, or a platform, and do not visit profiles or fetch posts externally; work only from the materials supplied in the issue.
- Do not transmit the content or the review to any external party or system; the review is a work product pending operator approval.
