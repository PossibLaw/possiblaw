---
name: promotions-playbook
description: Draft sweepstakes and contest official-rules skeletons when a promotions matter arrives, producing a markdown work product with defaults and state registration and bonding flags for the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/promotions-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Promotions Playbook

Use this skill to draft official rules for a sweepstakes or contest. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, mark missing legal or business facts with bracket placeholders, and flag — never resolve — registration and bonding questions.

## When To Invoke

- The issue requests official rules for a sweepstakes, contest, giveaway, or similar promotion.
- The issue requests revisions to existing PossibLaw-drafted official rules; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for advertising-claims review or influencer-disclosure work; those belong to other specialists in the advertising practice.

## Drafting Steps

1. Gather facts from the issue: sponsor name and address, promotion name, promotion type, promotion period, eligible jurisdictions and minimum age, entry methods and any purchase connection, prize descriptions and approximate retail values, number of winners, selection method, and the platforms involved. If the promotion type (chance-based sweepstakes or skill-based contest) is not stated, gate with `missing-info-gate`; the type controls the structure and is never defaulted.
2. Confirm the structure for the type:
   - Chance-based sweepstakes: include a no-purchase-necessary statement at the top, a free alternate method of entry, and language that all entry methods receive equal treatment in winner selection.
   - Skill-based contest: include judging criteria, judge identification placeholders, and tie-breaking mechanics instead of an odds-of-chance statement.
3. Draft the required sections in order:
   - Promotion name and sponsor identification
   - No-purchase-necessary statement (chance-based promotions) as the opening line
   - Promotion period with start, end, and time zone
   - Eligibility: residency, minimum age, and exclusions for sponsor employees and their household members
   - How to enter: each entry method, the free alternate entry method where required, and entry limits
   - Prize: description, approximate retail value, number of winners, and a no-substitution/cash-equivalent placeholder
   - Odds: an odds statement for sweepstakes or a judging-criteria reference for contests
   - Winner selection and notification: method, timing, notification channel, claim deadline, and unclaimed-prize handling
   - Winner verification: eligibility confirmation and an affidavit-and-release placeholder
   - Publicity release: standard language granting the sponsor use of the winner's name and likeness, with a jurisdiction flag for consent-law variation
   - General conditions: disqualification grounds, technical-failure handling, and a modification/termination placeholder
   - Liability release placeholder
   - Privacy: a pointer to the sponsor's privacy policy placeholder
   - Disputes and governing law placeholder
   - Winners-list request mechanics placeholder
   - Sponsor contact placeholder
4. Flag registration and bonding triggers per the section below; never resolve them.
5. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
6. Produce the output in the format below.

## Registration and Bonding Flags

Some jurisdictions require registration, bonding, or filings for promotions — commonly chance-based promotions above prize-value thresholds, and promotions connected to a purchase. Where the facts show any of the following trigger signals, add a flag addressed to the operator, restating the trigger fact and phrasing the determination as a question (for example `Does any state registration or bonding requirement apply given a total prize value of [VALUE] and entrants in [JURISDICTIONS]? — operator/counsel to determine`):

- A chance-based promotion open to entrants in any jurisdiction, where total prize value or eligible locations are stated or unknown
- Total approximate retail value that is unstated or material
- Any purchase connection or other consideration tied to entry
- Prizes or sponsors involving regulated products (for example alcohol)

Never resolve, confirm, or rule out a registration, bonding, or filing requirement, and never name a jurisdiction's requirement as settled.

## Output Format

- A single well-structured markdown document: title block with promotion name and sponsor placeholder, the sections in the order above, and a closing registration-and-bonding flag block.
- A short `Assumptions and open items` section before the rules body listing every placeholder, default, and operator flag, with registration-and-bonding flags listed first.
- Preserve operator-specified prizes, dates, eligibility terms, and entry mechanics exactly as given.

## Boundaries

- Do not resolve registration, bonding, or filing requirements, and do not opine on whether a promotion structure is a lawful promotion or an illegal lottery; flag the trigger facts for the operator or responsible counsel.
- Do not give jurisdiction-specific legal advice as settled or predict how a regulator would treat the promotion.
- Do not publish, post, file, register, or transmit the rules or the promotion to any external party or system; the draft is a work product pending operator approval.
