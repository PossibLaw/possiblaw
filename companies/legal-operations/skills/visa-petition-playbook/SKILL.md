---
name: visa-petition-playbook
description: Build petition support-letter skeletons and evidence checklists for H-1B, L-1, O-1, TN, and PERM-intake matters when a visa-petition support request arrives, producing a markdown package with placeholders and attorney follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/visa-petition-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Visa Petition Playbook

Use this skill to organize a petition support package: a support-letter skeleton plus an evidence checklist for the visa category the issue states. The package organizes facts and collection work; it carries no eligibility conclusions and is never filed by this company. Petition matters carry beneficiary personal data: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`, run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## Drafting Steps

1. Run the privacy-tier check before any other step; the encoder decision precedes fact gathering when matter content will reach a cloud-capable model.
2. Scope intake. Record the visa category, petitioner, beneficiary, role title and duties, worksite, offered wage, requested dates, and prior immigration history as the issue states them. The category has no default — if it is absent, gate with `missing-info-gate` before doing anything else; for other gaps apply the drafting agent's defaults and record each one.
3. Select the category module below and note its open items; every eligibility-sensitive point in the module is an attorney follow-up, never a conclusion.
4. Build the support-letter skeleton in the structure below, inserting the module's category-specific sections.
5. Build the evidence checklist from the module's evidence list plus any documents the issue identifies, in the table format below.
6. Compile `Assumptions and open items`: every placeholder, every default used, and every attorney follow-up from the module.
7. Produce the output in the format below.

## Category Modules

Each module lists the category-specific letter sections and core evidence items. Frame every eligibility criterion as an open item for the responsible immigration attorney.

- **H-1B** — Letter sections: specialty-occupation description tying duties to a degree field, beneficiary's qualifying education and experience, wage and worksite statement. Evidence: degree and transcript copies, degree-equivalence evaluation if the degree is foreign or non-matching (attorney follow-up), labor condition application as an attorney-owned item, organizational chart, detailed duties breakdown. Open items: specialty-occupation framing, wage-level sufficiency.
- **L-1** — Letter sections: qualifying corporate relationship between petitioner and foreign entity, beneficiary's qualifying year of employment abroad, managerial or executive duties (L-1A) or specialized-knowledge description (L-1B). Evidence: corporate ownership documents, foreign payroll or employment records, organizational charts for both entities, duties descriptions abroad and in the offered role. Open items: qualifying relationship, capacity classification.
- **O-1** — Letter sections: field of extraordinary ability, criterion-by-criterion achievements narrative, itinerary or event description, agent or employer framing as stated. Evidence: awards, published material about the beneficiary, memberships, original contributions, high-remuneration evidence, advisory opinion or consultation letter as an attorney-owned item. Open items: which criteria to claim, consultation requirement.
- **TN** — Letter sections: profession as listed under the USMCA, beneficiary's citizenship statement, offered role and duties matched to the listed profession, temporary-intent statement. Evidence: proof of Canadian or Mexican citizenship, degree or license for the listed profession, detailed offer terms. Open items: profession-list match, qualification fit.
- **PERM intake** — This module organizes intake only; recruitment and filings are operator- and attorney-owned. Sections: role description and minimum requirements as stated, business-necessity notes as stated. Evidence checklist rows: prevailing-wage determination as an attorney-owned item, recruitment-step tracking rows (each step `[TO COLLECT]` with owner), job description and requirements sign-off, beneficiary qualification documents against the stated minimums. Open items: requirements framing, recruitment plan, wage determination.

## Support-Letter Skeleton Structure

1. Letterhead placeholder and date placeholder.
2. Addressee placeholder for the operator to complete.
3. RE line: category, petitioner, and beneficiary.
4. Petitioner introduction: business, size, and operations as stated or placeholders.
5. Role and duties description.
6. Beneficiary qualifications as stated; eligibility characterizations left as bracketed attorney follow-ups.
7. The category-specific sections from the module.
8. Conclusion stating the requested action and validity period placeholder.
9. Signature placeholder: signatory name and title.

## Evidence Checklist Format

| Item | Source / owner | Status |
|---|---|---|
| Document or evidence item | Who holds or produces it | `Received` or `[TO COLLECT]` |

Include one row per module evidence item and one row per gap recorded at intake (for example prior immigration history). Mark attorney-owned items in the Source / owner column.

## Output Format

1. Cover summary: category, petitioner, beneficiary, requested action, and the `Assumptions and open items` list.
2. The support-letter skeleton.
3. The evidence checklist table.
4. Operator follow-ups: strategy calls, eligibility questions, and wage or labor-condition items for the responsible immigration attorney.

## Boundaries

- Do not file, submit, serve, send, post, or transmit anything to USCIS, the Department of Labor, a consulate, or any other external party or system; the package is a work product pending operator approval.
- Do not predict adjudication outcomes, approval likelihood, or processing times; flag outcome-sensitive questions for the responsible immigration attorney.
- Do not state that a beneficiary qualifies for any category or criterion; eligibility points are open items, never conclusions.
- Do not invent facts about the petitioner or beneficiary; preserve supplied names, dates, and history exactly and use placeholders for everything else.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
