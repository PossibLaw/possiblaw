---
name: marketing-pitch-polish
description: Tighten a rough pitch draft into a crisp, compelling version — headline, value, evidence, CTA, tone, and length.
metadata:
  sources:
    - path: layer/skills/marketing/pitch-polish-playbook.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Pitch Polish Playbook

Use this skill to transform a rough pitch draft into a crisp, compelling version. Apply each step in order.

## Polishing Steps

1. Read the draft end-to-end first. Before changing a single word, read the entire draft once to understand the core message, the intended audience, and what the author is trying to achieve. Note the overall structure and length.

2. Identify and strengthen the headline. The first sentence or heading must immediately answer "What do you do and for whom?" If the headline buries the value proposition, rewrite it to lead with the benefit. Aim for under 15 words.

3. Sharpen the value proposition. Locate the statement that explains why the reader should care. Make it specific: replace vague phrases like "we help companies succeed" with concrete outcomes such as "we help mid-size manufacturers cut contract review time by 40%." If no value proposition exists, add one.

4. Add or tighten supporting evidence. Every major claim should be backed by one of: a quantified result, a named client category (not individual names without permission), a methodology reference, or a comparative benchmark. Remove unsupported superlatives ("best," "leading," "premier") unless evidence is provided.

5. Verify the call to action (CTA). Every pitch must end with exactly one clear next step. Typical CTAs: "Schedule a 30-minute consultation at [LINK]," "Reply to request our capability statement," or "Visit [URL] to learn more." If the draft has no CTA or has multiple competing CTAs, reduce to one.

6. Check tone and audience alignment. Confirm the tone matches the audience. For prospective business clients, use professional but accessible language. Avoid legalese in marketing copy. Adjust formality based on signals in the draft (e.g., first-name address vs. formal salutation).

7. Eliminate redundancy and filler. Remove repeated ideas, throat-clearing phrases ("I am writing to…", "As you may know…"), and passive constructions where active voice is clearer. Each sentence must earn its place.

8. Verify length. A pitch email should be 150–250 words. A pitch deck section (single-slide narrative) should be 50–100 words. A one-pager executive summary should be 300–500 words. Trim to the target range; do not pad to fill it.

9. Final flow check. Read the polished version aloud (mentally). Transitions between paragraphs should be smooth; each paragraph should logically follow the previous one. The structure should be: Hook → Problem → Solution → Evidence → CTA.

10. Label changes. When returning the polished version, include a brief "Changes made" section listing two to four specific improvements and the rationale for each, so the operator can learn and accept or revert changes.

## Output Requirements

- Return the polished pitch in the same format as the source (email, slide narrative, one-pager) at the target length.
- Preserve operator-specified facts, party names, jurisdiction, and proprietary statistics.
- Do not invent client names, metrics, or testimonials. Replace unsupported claims with placeholders like `[QUANTIFIED RESULT]` when the underlying evidence is missing.
- Include the "Changes made" section after the polished pitch.

## Boundaries

- Never-Send Rule: the polished pitch is a draft. Sending, publishing, or
  posting it is human-owned — this skill never transmits anything.
- Lawyer-advertising compliance: attorney marketing is regulated
  communication (ABA Model Rule 7.1 and state analogs). Never add
  "specialist," "expert," "certified," guaranteed-outcome, or
  past-results-imply-future-results language; if the draft contains such
  claims, flag them for operator review instead of silently keeping them.
  Jurisdiction-specific requirements (e.g. "Attorney Advertising" labels)
  are surfaced as bracketed placeholders for counsel confirmation.
- Confidentiality: never introduce client names, matter facts, or
  work-product details into marketing copy. If the source draft contains
  them, flag for confirmation that informed client consent exists — do not
  assume it.
- Conflicts guard: a pitch that names a target, adverse party, or
  counterparty routes back through `bd-lead` for a conflicts check before
  polishing continues (same guard as `bd-proposal-playbook`).
- No comparative claims against named competitors or other firms.
- Preserve meaning: polish is editorial, not substantive. If a claim seems
  wrong or unverifiable, question it in "Changes made" — never "improve" a
  fact.
