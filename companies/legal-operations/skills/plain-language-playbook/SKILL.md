---
name: plain-language-playbook
description: Convert an operator-supplied legal document into a client-friendly plain-language summary when a summarization matter arrives, producing what-it-is, key-obligations, key-dates, risks, and what-happens-if sections under an accuracy-over-simplicity rule with a nuances-lost flag list.
metadata:
  sources:
    - path: companies/legal-operations/skills/plain-language-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Plain Language Summary Playbook

Use this skill to convert a legal document into a summary a non-lawyer can use. Accuracy beats simplicity at every turn: when a simplification would change the meaning of a provision, keep the accurate longer phrasing or add the precise qualifier, and put every nuance the simplification loses on the flag list. The summary describes the document; it never advises the reader what to do.

## Drafting Steps

1. Intake. Record the document supplied, the audience (default: a non-lawyer client with no legal background), and the reader's side (`[OPERATOR TO CONFIRM]` when unstated, with risks framed for both sides). If no document is supplied or the audience cannot be determined and no acceptable default applies, gate with `missing-info-gate`.
2. Read the full document before writing. Inventory the obligations, dates, conditions, exceptions, thresholds, and defined terms so that nothing is summarized out of context.
3. Draft the sections in this order:
   - **What it is** — document type, parties, and purpose in one short paragraph.
   - **Key obligations** — who must do what, grouped by party, exactly as the document provides; where the document is silent, write the placeholder rather than inferring a term.
   - **Key dates** — a table of dates and deadlines exactly as the document states them, with `[DATE NOT STATED IN DOCUMENT]` where it is silent.
   - **Risks** — what could go wrong for the reader's side (or both sides when the side is unconfirmed), stated factually from the document's terms.
   - **What happens if** — consequences of breach, termination, and missed deadlines as the document provides them.
4. Apply the plain-language rules. Write in short sentences and active voice for the defaulted audience, explain any unavoidable legal term on first use, keep party names exactly as written in the source document, and keep the summary to the defaulted length unless the operator set another.
5. Apply the accuracy-over-simplicity rule. When a simplification would change the meaning of a provision, keep the accurate longer phrasing or add the precise qualifier; never trade correctness for readability.
6. Build the nuances-lost flag list. Every dropped condition, exception, threshold, or defined-term subtlety goes on the list with a pointer to the source section it came from. A summary with no flagged nuances is suspect for a document of any complexity; re-check step 2's inventory before delivering one.
7. List every default used.

## Output Format

A single markdown document in this order:

1. What it is.
2. Key obligations.
3. Key dates (table).
4. Risks.
5. What happens if.
6. Nuances lost in simplification — the flag list with source-section pointers.

State the flag-list count at the end so the operator can gauge how much the simplification dropped.

## Boundaries

- Do not characterize enforceability, fairness, or market position, and do not recommend signing, terminating, or negotiating; should-we questions belong to the operator and responsible counsel.
- Do not infer terms the document does not state; use the placeholders instead.
- Do not send the summary to the client or any external party or system; the operator delivers client communications.
