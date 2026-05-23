---
name: legal-ip-infringement-triage
description: Triage a potential IP dispute across trademark, copyright, patent, and trade secret — producing a factor flag list with direction, not a finding of infringement or non-infringement.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: ip-legal/skills/infringement-triage/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/ip-legal/skills/infringement-triage/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# IP Infringement Triage

**This is a triage, not a finding of infringement or non-infringement.** Infringement analysis is fact-intensive and legally complex. Acting on a triage — sending a cease-and-desist, refusing to stop, filing suit, or deciding not to — without attorney review is how companies end up on the wrong side of fee awards, Rule 11 sanctions, declaratory-judgment actions, and (for patents) treble damages.

## What This Skill Does

1. Identifies which IP right is at issue — trademark, copyright, patent, trade secret, or a mix. If mixed, runs each separately; never blends.
2. Runs the common intake (party posture — senior or accused, jurisdiction, timing, exhibits).
3. Walks the mode-specific factors:
   - **Trademark** — circuit's confusion test plus dilution (if famous) plus false advertising (if a comparative claim).
   - **Copyright** — ownership, registration, access, substantial similarity, fair use, DMCA safe harbor (if applicable).
   - **Patent** — claim-chart first pass; literal plus doctrine of equivalents; indirect plus divided; invalidity defenses to consider.
   - **Trade secret** — secrecy plus reasonable measures plus misappropriation; preemption and reverse-engineering flags.
4. Produces a flag list with direction — what cuts toward the senior party, what cuts toward the accused, what is mixed. Never concludes.
5. Ends with recommended next steps. If the operator's enforcement posture supports assertion, offers a chain into the cease-and-desist or takedown skills; does not draft automatically.

This skill never concludes. If uncertain, flag — the attorney decides.

## THIS IS A TRIAGE, NOT A FINDING

**The loudest guardrail. Say this at the top of every output. Do not drop it. Do not soften it.**

> **This is a triage, not a finding of infringement or non-infringement.** Infringement analysis is fact-intensive and legally complex. The triage identifies the factors and flags the ones that matter most; it does not conclude. A conclusion that something does or does not infringe is a legal opinion that requires an attorney's judgment on the facts, the claim or right scope, the relevant jurisdiction's law, and the likely defenses. Acting on a triage — sending a cease-and-desist, refusing to stop, filing suit, or deciding not to — without attorney review is how companies end up on the wrong side of fee awards, Rule 11 sanctions, declaratory-judgment actions, and (for patents) treble damages.

Under-calling a conflict is a one-way door — a cease-and-desist not sent and a mark goes generic in the market; a claim not chased and the statute of limitations runs; a copied copyrighted work kept on the site. Over-calling is a two-way door — the attorney narrows. Stay on the two-way door side.

## Load the Operator's IP Profile First

Pull from the operator's IP playbook:

- **Enforcement posture** — the triage output should end with a routing suggestion consistent with the stated posture (aggressive / measured / conservative) and the named approver for the relevant letter type.
- **Registered in / enforce where** — determines which circuit / jurisdiction test to apply by default.
- **Integrations** — CourtListener, Westlaw, and similar tools affect whether the triage can cite case law, prior rulings, or prior art.
- **Decision posture on subjective legal calls** — this skill never concludes on a subjective threshold.

If the operator's profile is missing required positions, surface the gap and offer to run in "provisional" mode with generic US-jurisdiction defaults, middle risk appetite, and no playbook — tagging every finding `[PROVISIONAL]` so the user can see what the skill does before committing.

## Mode Selection

Ask at the top, before anything else:

> Which right are we triaging?
>
> 1. **Trademark** — confusion, dilution, or false advertising.
> 2. **Copyright** — substantial similarity, fair use, DMCA safe harbor.
> 3. **Patent** — claim-chart first pass, literal read plus doctrine of equivalents.
> 4. **Trade secret** — secrecy, reasonable measures, misappropriation.
> 5. **Mixed / not sure** — describe the facts and the skill will pick.

If the user picks "not sure," help them sort. The same facts can implicate multiple rights (a competitor's product uses our logo — trademark; and the product is a near-copy of ours — possible patent, copyright on packaging, possible trade dress; and a former employee launched it — trade secret).

**If more than one right is in play, run the triage for each, separately.** Do not mash them together. Each right has different factors, different jurisdictional rules, and different remedies.

## Intake (Common to All Modes)

Before walking factors:

1. **Posture.** Is the operator the potentially senior party (they are taking ours) or the potentially accused party (we are the ones being looked at)? The factors are symmetric but the output differs — a "mine's being copied" triage routes toward an assertion letter; a "we might be exposed" triage routes toward a risk memo.
2. **Jurisdiction.** Which country / circuit / court? US federal default if not specified. Flag if foreign law may apply.
3. **Timing.** Is a statute of limitations or laches clock running?
4. **Exhibits / evidence / source documents.** A screenshot, a URL, a packaging photo, a code excerpt, an ex-employee contract.

Wait for the answer before walking factors.

## Trademark Mode

### Confusion

Use the applicable circuit's multi-factor test. Cite the test (du Pont / Polaroid / Sleekcraft / other). Walk each factor and flag what cuts each way:

- **Similarity of marks** — sight / sound / meaning / commercial impression.
- **Similarity of goods or services** — expected-source test, not identity.
- **Channels of trade.**
- **Consumer sophistication.**
- **Strength of the senior mark** — fanciful / arbitrary / suggestive / descriptive with secondary meaning / generic.
- **Intent** — evidence of copying, knock-off trade dress, near-miss mark.
- **Actual confusion** — any evidence (surveys, misdirected inquiries, social).
- **Likelihood of expansion / bridge-the-gap** — whether the zones overlap commercially.

### Dilution

Apply the federal TDRA (15 U.S.C. § 1125(c)) and any applicable state statute.

- **Fame threshold.** The senior mark must be famous to the general consuming public — a niche-famous mark is not enough. *Starbucks Corp. v. Wolfe's Borough Coffee, Inc.*, 588 F.3d 97 (2d Cir. 2009) is representative.
- **Blurring vs. tarnishment.** Blurring = distinctiveness harm; tarnishment = reputation harm.
- **Defenses** — comparative advertising, news reporting, fair use, non-commercial use.

If the senior mark is not plainly famous nationally, flag dilution as a stretch.

### False Advertising / Comparative Claims

If the triage is prompted by a competitor's comparative ad or a claim about product attributes:

- Apply Lanham Act § 43(a) / 15 U.S.C. § 1125(a) for the materiality, falsity-or-misleading, deception, commercial-speech, and injury elements.
- Flag whether the statement is literally false, implicitly false, or puffery. Puffery is not actionable.
- Substantiation evidence the claimant has or needs.

### Output

Factors table; what cuts each way; a "not a finding" conclusion line. End with a routing suggestion against the operator's enforcement posture.

## Copyright Mode

### Ownership

Is the claimant the owner (or exclusive licensee with standing)? Work-for-hire issues; joint authorship; assignments; and termination rights all flag.

### Registration

17 U.S.C. § 411 requires registration (or preregistration) as a precondition to filing an infringement action in US federal court. *Fourth Estate Public Benefit Corp. v. Wall-Street.com, LLC*, 586 U.S. 296 (2019) — registration means actually issued, not just applied for. Flag registration status; if not registered, flag the practical bar on filing.

### Access + Substantial Similarity

Two paths to proving copying:

- **Access + probative similarity** — defendant had access and the works share features probative of copying.
- **Striking similarity** — even absent proof of access, the similarity is so striking that independent creation is unlikely.

For substantial similarity, apply the circuit's test (Second Circuit's ordinary-observer; Ninth Circuit's extrinsic / intrinsic under *Krofft* and *Swirsky*; Fourth / Seventh / Eleventh circuits' variations). Flag which test applies.

### Fair Use

17 U.S.C. § 107 four factors, analyzed as a whole:

1. Purpose and character of the use (transformativeness; commercial vs. non-commercial).
2. Nature of the copyrighted work (factual / functional vs. creative).
3. Amount and substantiality of the portion used.
4. Effect on the market for the original.

Recent touchstones: *Google LLC v. Oracle America, Inc.*, 593 U.S. 1 (2021); *Andy Warhol Found. for the Visual Arts, Inc. v. Goldsmith*, 598 U.S. 508 (2023). Flag the transformativeness analysis carefully — *Warhol* narrowed the scope of transformative use and is still being applied by lower courts.

### DMCA Safe Harbor

17 U.S.C. § 512. If the accused is a service provider hosting user content, flag whether § 512(c) applies: designated agent, notice-and-takedown procedure, no actual or red-flag knowledge, no financial benefit attributable to infringement the provider could control, expeditious takedown on valid notice. Repeat-infringer policy required. Safe harbor does not cover direct infringement by the service provider itself.

### Output

Factors flagged; fair-use balance with "the triage does not conclude"; ownership / registration / safe-harbor threshold notes. Routing per the operator's posture.

## Patent Mode

### Design Patent (D-number) — Branch Before the Workflow

**Check the asserted patent's registration number FIRST.** If it has a `D`, `RE`, or `PP` prefix (e.g., `D712,345`), it is not a utility patent and the workflow below does NOT apply. Branch per prefix:

- **`D` prefix — design patent (35 U.S.C. §171).** Different test, different claim structure, different damages. Do NOT build a claim chart; do NOT run doctrine of equivalents; do NOT do element-by-element mapping. Design patents have a single claim defined by the drawings; charting a figure as if it were a utility claim element list is wrong doctrine.
- **`RE` prefix — reissue patent.** Treat as the utility patent it reissued, but flag reissue-specific defenses (intervening rights under §252, recapture rule, original-patent requirement).
- **`PP` prefix — plant patent.** Separate regime (35 U.S.C. §161). Asexually reproduced plant varieties. Route to plant-patent counsel; this skill does not analyze plant patents.

**Design patent infringement test — ordinary observer.** *Egyptian Goddess, Inc. v. Swisa, Inc.*, 543 F.3d 665 (Fed. Cir. 2008) (en banc). The question is whether an ordinary observer, **familiar with the prior art designs**, would be deceived into thinking the accused design is the same as the patented design. Compare **overall ornamental appearance**, not individual elements. The accused product must appropriate the **novelty** that distinguishes the patented design from the prior art.

**Functional-vs-ornamental filter.** Design patents protect ornamental features only; functional features are not protected. If the accused similarity is in features dictated by function, flag that the overlap may fall outside the patented scope.

**§289 total-profit damages flag.** Design patent damages under 35 U.S.C. §289 are the infringer's **total profits on the "article of manufacture,"** which can be the whole product or a component. *Samsung Electronics Co. v. Apple Inc.*, 580 U.S. 53 (2016). Specialist work — do not compute.

**Trade dress cross-flag.** The same ornamental-shape facts are usually also a **trade dress** question under Lanham Act §43(a) (15 U.S.C. §1125(a)). Product configuration trade dress requires **secondary meaning** (*Wal-Mart Stores, Inc. v. Samara Bros., Inc.*, 529 U.S. 205 (2000)) and must be **non-functional** (*TrafFix Devices, Inc. v. Marketing Displays, Inc.*, 532 U.S. 23 (2001)). Flag trade dress as a parallel track.

### Design Patent Triage — Output

Because the skill cannot see the patent drawings or the accused product directly, the design patent triage is mostly a request for the materials and a frame for the analysis:

- **Ask for the drawings.** "Cannot run the ordinary-observer test without seeing the patent figures and the accused product. Paste or attach: (a) the patent drawings (all figures, including broken-line disclaimers), (b) photos of the accused product from comparable angles, (c) any prior-art designs you are aware of."
- **Prior-art landscape.** Ordinary observer is a comparison test — the observer is familiar with the prior art, so the scope of the patented design narrows as the prior-art field crowds.
- **Functional-vs-ornamental analysis.** Walk the features and flag which look functional (and therefore unprotected) vs. ornamental.
- **Broken lines.** Solid lines for claimed features, broken lines for unclaimed environmental context. Flag whether the alleged copying is in claimed or unclaimed territory.
- **§289 damages flag** as above.
- **Trade dress cross-flag** as above.

**Route to a design patent specialist for anything beyond first-pass triage.**

### Utility Patent Workflow

The rest of this mode assumes the asserted patent is a **utility patent** (no `D`/`RE`/`PP` prefix).

> **Patent systems differ by jurisdiction.** The US claim chart (all-elements rule, doctrine of equivalents, prosecution history estoppel, §284/§289 damages) does not transfer to other systems:
> - **Germany:** Utility models (Gebrauchsmuster), the Schneidmesser/Kunststoffrohrteil questions for DOE, bifurcated validity/infringement proceedings.
> - **China:** Utility models (shiyong xinxing), CNIPA examination, different claim construction.
> - **Japan:** Utility models, JPO examination, a narrower DOE.
> - **Europe (Unified Patent Court):** UPC procedure as of 2023.
>
> When non-US jurisdictions are in scope, flag that the analysis uses the US claim-charting framework and that an infringement and validity call requires jurisdiction-specific review.

### Workflow

- Accused product / process / method — described in technical detail.
- Identified patent(s) at issue.
- Claim chart for each independent claim: element-by-element mapping to the accused product.
- Literal infringement first. Doctrine of equivalents as a flag.
- Indirect (induced, contributory) and divided infringement as flags.
- **Invalidity defenses to consider** — anticipation (§ 102), obviousness (§ 103), § 112 written-description / enablement / definiteness, § 101 subject-matter eligibility (*Alice* / *Mayo*). Known IPR or PGR outcomes, known prior art, known prosecution history. Flag each; do not opine.
- **Unenforceability defenses** — inequitable conduct flag, prosecution laches flag, assignor / licensee estoppel flag. Each is attorney-only.
- **Damages posture** — lost profits vs. reasonable royalty (Georgia-Pacific factors), marking, pre-suit notice, willfulness.

### Output

Claim charts. Element flags. Defense flags. Routing to patent counsel.

## Trade Secret Mode

### Was It a Secret?

Apply the Defend Trade Secrets Act (18 U.S.C. § 1836 et seq.) for federal purposes and the applicable state UTSA (or, in non-UTSA jurisdictions, the state's common-law test). Flag:

- **Not generally known** — to the public or to others in the industry who can obtain economic value from disclosure.
- **Economic value from secrecy** — independent economic value actual or potential, derived from not being generally known.
- **Combinations and compilations** — a combination of public elements can be a trade secret.

### Reasonable Measures

- NDAs with employees, contractors, counterparties. Scope, signed, enforced?
- Access controls — technical (role-based), physical (doors, badges), organizational (need-to-know).
- Marking — confidentiality legends on documents, code, data.
- Exit interviews / return of materials on termination.
- Trade-secret policy / training.

Flag what is in place and what is missing. *Reasonable* is fact-specific; the triage does not decide whether the measures were reasonable — it lists them.

### Misappropriation

Acquisition by improper means, or disclosure / use in breach of duty. Improper means includes theft, bribery, misrepresentation, breach or inducement of breach of a duty to maintain secrecy, or espionage. 18 U.S.C. § 1839(6).

- **Former employee fact pattern** — new employer, overlapping work, departure timing, documents taken (and returned?), access logs, recruiting channels, assignment and invention-assignment agreements.
- **Inadvertent disclosure** — was disclosure made by a person with a duty? Did the recipient know or have reason to know of the breach?
- **Reverse engineering** — a defense if the means were lawful. Flag whether reverse engineering is plausible on the facts.

### Preemption

Where state tort claims (unfair competition, conversion, breach of confidence) might be preempted by the UTSA, flag preemption. Some jurisdictions preserve contract claims; others preempt most tort claims addressing the same facts.

### Output

Three flag groups — secrecy, measures, misappropriation — each with what cuts each way. Routing per the operator's posture.

## Output Format (All Modes)

```markdown
# Infringement Triage — [Trademark | Copyright | Patent | Trade Secret] (NOT A FINDING)

**This is a triage, not a finding of infringement or non-infringement.** The triage identifies factors and flags what matters most; it does not conclude. A conclusion requires an attorney's judgment on the facts, the right scope, jurisdiction, and defenses. Acting on a triage without attorney review is how companies end up on the wrong side of fee awards, Rule 11 sanctions, declaratory-judgment actions, and enhanced damages.

**Triage result:** [GREEN / YELLOW / RED — one sentence why]

## Posture and scope

- **Party posture:** [senior / accused]
- **Right at issue:** [trademark / copyright / patent / trade secret]
- **Jurisdiction:** [US federal — specific circuit / state / foreign]
- **Legal framework applied:** [cite the governing test and statute]
- **Statute of limitations / laches posture:** [clock status]
- **Exhibits / evidence reviewed:** [list]

## Factor analysis

[Mode-specific factor table — confusion factors / fair-use factors / claim chart / trade-secret elements. Each factor has a flag and a direction. This is a flag list, not a verdict.]

## Defenses and thresholds

[Mode-specific: dilution fame threshold / registration prerequisite / § 512 safe harbor / invalidity / inequitable conduct / preemption / reverse-engineering / consent / license / laches / statute of limitations. Flag each.]

## What cuts which way — summary

| Factor | Flag | Direction (senior / accused / mixed) |
|---|---|---|
| [factor 1] | [note] | [direction] |

**Conclusion:** *This skill does not conclude.* Attorney judgment required before acting. The factors cutting [direction] are [brief summary]; the factors cutting [direction] are [brief summary].

## Recommended next steps

- [formal opinion from counsel / route to IP outside counsel named in the operator's playbook]
- [evidence preservation and hold — if a litigation clock is running]
- [fact development needed before a decision — e.g., access logs, prosecution history, market studies, survey evidence]
- [routing per the operator's enforcement posture, if the posture is to assert]

## Citation verification

Every case, statute, registration number, claim quote, and exhibit cited here must be verified against the authoritative source before relying on it. Jurisdictional tests vary by circuit and change over time — confirm the current controlling authority.
```

## Handoff to Enforcement Skills

If the triage output points toward an assertion and the operator's enforcement posture supports it, offer:

> Want to draft a cease-and-desist on this? The cease-and-desist skill uses the flag list from this triage as the factual basis and applies the approval chain from the operator's playbook — the letter does not go anywhere without the approver signing off.

Or, if the mode is copyright and the accused is hosted content, offer to prepare a DMCA takedown.

Do not draft the letter automatically from the triage. The decision to assert is the approver's, not the triage's.

## What This Skill Does Not Do

- **Conclude infringement or non-infringement.** Ever. The loudest guardrail.
- **Substitute for survey evidence, damages experts, or claim construction.**
- **Evaluate jurisdiction-specific defenses outside the triage's jurisdiction scope.** If the facts cross borders, flag that foreign-law analysis is required.
- **Decide fair use as a matter of law.** Fair use is fact-intensive and reserved for the attorney and, ultimately, the court.
- **Draft the cease-and-desist, takedown, or complaint.** Those are separate skills gated by the approval chain in the operator's playbook.
- **Quote outputs to counterparties.** Internal-only.

## Tone

Factor-by-factor, flag-by-flag. No hedging prose. The guardrail at the top does the scope work; the analysis does the analysis. An attorney should leave the output knowing exactly which factors are flagged, which defenses apply, and what they need to do next to either assert or stand down.

## Evals

**Given** a trademark scenario where the operator holds a registered mark APEXLEAF in International Class 9 with US federal registration, a competitor has launched a product called APEXSEED in Class 9 distributed through the same retail channels, the operator's enforcement posture is "measured," and the relevant forum is the Second Circuit,
**When** the skill runs,
**Then** the output prints the NOT-A-FINDING guardrail at the top, identifies the right as trademark, cites the Polaroid factors as the controlling test, walks each factor with directional flags (similarity of marks, similarity of goods, channels of trade, strength, intent, actual confusion, expansion), produces a "what cuts which way" table, refuses to conclude infringement, and ends with a routing suggestion consistent with the operator's measured posture (offer to chain into the cease-and-desist skill, do not draft).

**Given** a patent triage request where the asserted patent number is `D712,345` (design patent), the accused product is a competitor's consumer-electronics enclosure, and the user attaches only a written description with no drawings or product photos,
**When** the skill runs,
**Then** the output branches to the design-patent path BEFORE running any utility-patent claim-chart workflow, explicitly does NOT build a claim chart, cites *Egyptian Goddess* as the controlling ordinary-observer test, requests the patent drawings (including broken-line disclaimers), the accused-product photos, and any known prior art, flags the §289 total-profits damages exposure, raises the parallel trade-dress track under §43(a), and recommends route to a design-patent specialist.

**Given** a "mixed / not sure" intake describing a former engineer who left for a competitor while also being accused of using copyrighted internal documentation in the new product's UI, with the operator's IP playbook missing required positions and the user requesting analysis anyway,
**When** the skill runs,
**Then** the output offers provisional mode with `[PROVISIONAL]` tagging, runs the trade-secret triage and the copyright triage SEPARATELY (not blended), walks the DTSA secrecy / reasonable-measures / misappropriation elements for the trade-secret track and the ownership / registration / access-and-substantial-similarity / fair-use elements for the copyright track, refuses to conclude on either, and ends with a recommendation to route to outside counsel before any assertion is drafted.
