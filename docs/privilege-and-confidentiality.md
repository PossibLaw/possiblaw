# Privilege, Confidentiality, and Cloud Models — PossibLaw Posture

*Authoritative posture doc. The marketing copy (README, announcement) and the
`gate-proxy` tier-floor logic both cite this file. Research memo prepared June
2026; case law and vendor terms are recency-sensitive — see Sources and
re-verify before any client-facing use.*

## TL;DR

**Sending client data to a third-party cloud LLM does not, by itself, waive
attorney-client privilege or work-product protection.** Waiver turns on the
*conditions* of disclosure, not the bare fact that a vendor's servers touched
the data. "Self-hosted = privilege-safe, cloud = privilege waived" is **not an
accurate legal statement** — it is a confidentiality / risk-reduction posture
dressed up as a privilege rule.

For PossibLaw this means two things:

1. **Marketing:** never claim local-only "preserves privilege" or that cloud
   "waives" it. Mirror Spellbook's honest framing — "reasonable steps to
   protect confidentiality and privilege." Local-only is a real risk-reduction
   and trust differentiator, **not** a privilege necessity.
2. **Product:** `privacyTier` enforcement should be **tiered, not binary** —
   classify cloud lanes by their data terms (ZDR / no-train / no-human-review /
   tenant-isolated), hard-block consumer-tier endpoints, and let the firm
   choose local-only as a documented risk posture. See
   `docs/builds/privacy-tier-floor-data-terms.md` for the build that encodes
   this.

## The crux: two different legal regimes

The vendor marketing conflates these. They are different doctrines with
different scope and different waiver consequences.

| | **Duty of confidentiality (Rule 1.6)** | **Attorney-client privilege** |
|---|---|---|
| Type | *Ethics* rule (bar discipline) | *Evidentiary* rule (discovery/admissibility) |
| Scope | **Broad** — all info relating to the representation, any source | **Narrow** — confidential communications to obtain/give legal advice |
| Standard | "Reasonable efforts" to prevent unauthorized disclosure (1.6(c)) | Confidentiality + no waiver |
| Waiver | No "waiver" concept; breach = ethics violation | Waived by disclosure to a third party outside the privileged circle (subject to the agent exception) |

Vendors that say "we protect privilege" are almost always describing
**confidentiality** measures.

## Why cloud egress does not per se waive privilege

- **The agent/vendor exception (*Kovel*).** Disclosure to a vendor acting as
  the lawyer's agent to facilitate legal advice — interpreters, e-discovery,
  litigation support, cloud storage — generally does **not** waive privilege if
  confidentiality is reasonably maintained (*United States v. Kovel*, 296 F.2d
  918 (2d Cir. 1961)). ABA Formal Op. 477R (2017) + 20+ state bar opinions
  apply this to cloud providers. Whether AI/LLM vendors qualify is not yet
  settled at the appellate level — it is fact- and contract-dependent.
- **Work product is even more forgiving.** Waived **only** by disclosure to an
  adversary, or in a manner that "substantially increases the likelihood" an
  adversary sees it (*Hickman v. Taylor*; FRCP 26(b)(3); *Pfizer v. Regor*, D.
  Conn. 2023). A neutral vendor under confidentiality terms does not meet that
  bar.
- **2026 case law — deployment-dependent, not cloud-vs-local:**
  - ***Warner v. Gilbarco*** (E.D. Mich., Feb. 2026): ChatGPT use did **not**
    waive work product — "generative AI programs are tools, not persons."
  - ***U.S. v. Heppner*** (S.D.N.Y., Rakoff, Feb. 2026): **no** protection —
    but only because it was a *consumer* tool, on training/disclosure terms,
    used *without counsel's direction*. The court expressly said the result
    "may have been different" with counsel-directed enterprise use, and pointed
    to "closed" enterprise deployments as the safe path. **Not authority that
    cloud AI waives privilege.**
- **ABA Formal Op. 512 (2024)** is an *ethics* opinion (competence,
  confidentiality, supervision, fees), not a privilege ruling. It requires
  informed client consent before inputting representation information into
  *self-learning* tools, and requires lawyers to read and understand vendor
  Terms of Use. A no-train enterprise tool narrows the consent trigger.

## The load-bearing term is ZDR, not "no training"

The *NYT v. OpenAI* preservation order (May 2025) forced OpenAI to retain
consumer logs *despite deletion* — but **zero-data-retention / Enterprise / API
customers were unaffected** because nothing was retained. So "no training" is
not enough; **zero retention + no human review + tenant isolation** is the
configuration the case law actually blesses. Consumer-tier endpoints (which
train by default and reserve third-party disclosure rights) are the *only*
configuration the cases condemn.

## What the competitors actually claim

None flatly claims "cloud waives privilege" or "we preserve privilege." They
market confidentiality, data residency/sovereignty, no-training, tenant
isolation, "reasonable steps."

- **Cicero** (Law In Order): "first private AI for legal," self-hosted
  Meta/Mistral, SOC 2 / ISO 27001 / ISO 42001 — sells **sovereignty**; the word
  "privilege" is absent from its marketing pages.
- **Harvey:** confidentiality framing, no-train, ZDR by model providers,
  in-region residency, tenant separation; "privilege" absent.
- **Spellbook** (clearest): "choosing a platform with ZDR, encryption, and SOC
  2-compliance, you are taking the 'reasonable steps' required by ethics rules
  to protect the privilege" — reasonable steps, not a guarantee. **This is the
  framing PossibLaw should adopt.**

The legitimate kernel of "self-hosted": it eliminates the third-party
disclosure step (no *Kovel* fight), sidesteps CLOUD Act and preservation-order
risk, and makes the Rule 1.6 case trivial. Real risk reduction — not a
privilege requirement.

## The tier policy PossibLaw should encode

| Tier | Gate policy |
|---|---|
| `standard` | Cloud OK under enterprise terms |
| `confidential` | Cloud OK **only** if the lane is enterprise ZDR / no-train / no-human-review / tenant-isolated; else local or anonymize (privacy-encoder) |
| `privileged` | Local (belt-and-suspenders) **or** ZDR-cloud-under-counsel-direction — operator's documented choice, not a hard local-only rule |
| any tier on a **consumer-tier endpoint** | **Hard block** — the only config the case law condemns |

This is more defensible *and* more honest than a binary "cloud bad" rule,
because it encodes the actual law instead of the marketing myth. Implementation:
`docs/builds/privacy-tier-floor-data-terms.md`.

## Marketing language — do / don't

- ✅ "Helps you take the reasonable steps Rule 1.6 and ABA Op. 512 require."
- ✅ "Reversible local masking + local-model tier-floor so confidential matter
  text is protected by default."
- ✅ "Confidentiality, data sovereignty, and an auditable consent trail."
- ❌ "Privilege-safe." / "Preserves attorney-client privilege."
- ❌ "Cloud models waive privilege." / "The only privilege-safe choice."

## Sources

**Privilege / agent exception**
- ACC, "Working with Vendors Without Waiving Privilege" (Mar. 12, 2018) — https://www.acc.com/resource-library/working-vendors-without-waiving-privilege-united-states
- *United States v. Kovel*, 296 F.2d 918 (2d Cir. 1961) — https://law.justia.com/cases/federal/appellate-courts/F2/296/918/131265/
- Reed Smith, "Third Parties and Attorney-Client Privilege" — https://viewpoints.reedsmith.com/post/102id97/third-parties-and-attorney-client-privilege-unravelling-an-e-discovery-enigma

**Cloud ethics / Op. 512**
- ABA Formal Op. 477R (2017), via NonaSec (Jul. 5, 2025) — https://nonasec.com/resources/aba-opinion-477r-attorney-cloud-security
- ABA press release on first AI ethics guidance (Jul. 2024) — https://www.americanbar.org/news/abanews/aba-news-archives/2024/07/aba-issues-first-ethics-guidance-ai-tools/
- NCBE *Bar Examiner*, "Generative AI Tools" (Fall 2024) — https://thebarexaminer.ncbex.org/article/fall-2024/generative-artificial-intelligence-tools/
- Frankfurt Kurnit client alert (Jan. 27, 2025) — https://technologylaw.fkks.com/post/102jwnl/aba-issues-comprehensive-formal-ethics-opinion-on-lawyers-use-of-generative-ai
- Frantz Ward, "Privilege Considerations When Using Generative AI" (Aug. 19, 2025) — https://www.frantzward.com/privilege-considerations-when-using-generative-artificial-intelligence-in-legal-practice/
- Official ABA Op. 512 PDF (verify manually; 403s to automated fetch) — https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-512.pdf

**Work product & 2026 AI case law**
- *Hickman v. Taylor*, 329 U.S. 495 (1947) — https://supreme.justia.com/cases/federal/us/329/495/
- McGuireWoods "Privilege Points" citing *Pfizer v. Regor* (Apr. 19, 2023) — https://www.mcguirewoods.com/client-resources/privilege-ethics/privilege-points/2023/4/some-courts-understand-work-product-waiver-some-dont/
- K&L Gates, "Generative AI Data, Attorney-Client Privilege, and the Work-Product Doctrine" (Feb. 23, 2026) — https://www.klgates.com/Litigation-Minute-Generative-AI-Data-Attorney-Client-Privilege-and-the-Work-Product-Doctrine-2-23-2026
- Gibson Dunn, "AI Privilege Waivers: SDNY Rules Against Privilege Protection for Consumer AI Outputs" (*Heppner*, 2026) — https://www.gibsondunn.com/ai-privilege-waivers-sdny-rules-against-privilege-protection-for-consumer-ai-outputs/
- Paul Weiss on *Warner v. Gilbarco* (Mar. 25, 2026) — https://www.paulweiss.com/insights/client-memos/federal-courts-reach-different-outcomes-on-whether-ai-generated-materials-warrant-work-product-protection
- Perkins Coie, "Heppner and Gilbarco" (Apr. 1, 2026) — https://perkinscoie.com/insights/update/heppner-and-gilbarco-courts-apply-privilege-and-work-product-protection-generative

**Vendor retention / training terms**
- OpenAI "Your Data" developer docs (no-train default eff. Mar. 1, 2023; ZDR) — https://developers.openai.com/api/docs/guides/your-data
- OpenAI Enterprise Privacy — https://openai.com/enterprise-privacy/
- Anthropic privacy, "Is my data used for model training?" (updated Mar. 16, 2026) — https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training
- National Law Review, "Privacy Under Pressure: NYT v. OpenAI" (Jul. 25, 2025) — https://natlawreview.com/article/privacy-under-pressure-what-nyt-v-openai-teaches-us-about-data-governance
- OpenAI, response to NYT data demands (June 2025) — https://openai.com/index/response-to-nyt-data-demands/

**Vendor positioning**
- Law In Order / Cicero — https://www.lawinorder.com/cicero/
- Harvey security — https://www.harvey.ai/security
- Spellbook, "AI and Waiver of Privilege" — https://spellbook.com/learn/ai-waiver-of-privilege
- Robin AI security — https://robinai.com/security

### Confidence notes
- **High confidence:** the confidentiality-vs-privilege distinction; the
  *Kovel* agent exception; Op. 512's consent holding; the work-product waiver
  standard; OpenAI/Anthropic enterprise no-train defaults; the 2026 outcomes.
- **Watch items:** *Heppner* decision-date discrepancy across sources (oral
  Feb. 10 / written Feb. 17, 2026); it is a single trial-court ruling, narrow
  and fact-specific, not binding, and likely distinguishable for enterprise /
  counsel-directed deployments. Several OpenAI pages and the ABA PDF 403'd
  automated fetch and were corroborated secondarily — quote-verify before
  client-facing use.
