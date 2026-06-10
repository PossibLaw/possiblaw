---
name: ip-license-playbook
description: Draft IP license agreements and license sections when a licensing matter arrives, classifying the license and producing a complete draft with stated defaults.
metadata:
  sources:
    - path: companies/legal-operations/skills/ip-license-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# IP License Playbook

Use this skill to draft an IP license agreement or a standalone license section. Classify first, draft every required section, apply the defaults below when the operator has not provided contrary instructions, and mark unresolved business facts with bracket placeholders.

## Step 1: Classify the License

State the classification at the top of the draft before any clause:

- **Direction** — inbound (company is licensee), outbound (company is licensor), or cross-license.
- **Exclusivity** — exclusive, sole, or non-exclusive.
- **Subject matter** — software, content, patent, or trademark; a mixed grant lists each right separately in the grant clause.

The classification drives clause emphasis: outbound drafts protect grant scope, restrictions, and audit rights; inbound drafts protect use rights, warranty coverage, and continuity; cross-licenses balance both with symmetric terms unless instructed otherwise.

## Step 2: Required Sections

Every draft includes these sections in order. Use a bracket placeholder rather than omitting a section.

1. **Definitions** — licensed IP, licensed products or uses, territory, field, improvements, net sales (if royalties apply).
2. **Grant** — rights granted, exclusivity, territory, field of use, reservation of all rights not granted.
3. **Restrictions** — prohibited uses; no reverse engineering for software; a no-challenge clause only on operator instruction.
4. **Fees and royalties** — structure, rates, payment timing, reporting obligations, late-payment terms.
5. **IP ownership and improvements** — background ownership confirmed; improvement ownership and any grant-back stated explicitly.
6. **Confidentiality** — pointer to the parties' NDA, or a short incorporated confidentiality clause if none exists.
7. **Warranties** — placeholder section flagging ownership and non-infringement positions for the operator or counsel.
8. **Indemnification** — placeholder section flagging scope, procedure, and caps for the operator or counsel.
9. **Limitation of liability** — placeholder section flagging caps and exclusions for the operator or counsel.
10. **Term, termination, and effects** — term, termination triggers, cure periods, wind-down rights, survival list.
11. **Audit** — records retention and audit rights matching the royalty structure.
12. **Assignment** — consent requirements and change-of-control treatment.
13. **Governing law** — governing law and dispute forum.

## Step 3: Defaults

| Field | Default |
|---|---|
| Licensor / Licensee | `[LICENSOR NAME]` / `[LICENSEE NAME]` placeholders |
| Exclusivity | Non-exclusive |
| Territory | Worldwide |
| Sublicensing | Not permitted without prior written consent |
| Improvements | Each party owns its own improvements; no grant-back |
| Royalty reporting | Quarterly, with records retained three years |
| Cure period | 30 days for material breach |
| Governing law | State of Delaware, USA |

## Step 4: Output Format

- Lead with the classification and a short open-items list of defaults applied and placeholders remaining.
- Draft in well-structured markdown with numbered sections matching Step 2.
- Close with a signature block using placeholder names, titles, and dates.

## OSS Interaction

When the licensed work embeds open-source components, run `legal-oss-compliance` before finalizing. Surface any copyleft conflict — for example a GPL-family component inside a proprietary outbound grant — as a blocker with an unblock owner, not as a footnote in the draft.

## Boundaries

- No negotiation. Record counterparty positions or requested changes as open items for the operator; do not concede or counter terms.
- No transmission. The draft is a work product; sending, filing, or executing it with any external party requires operator approval outside this skill.
