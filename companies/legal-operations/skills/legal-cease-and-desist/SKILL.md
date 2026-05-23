---
name: legal-cease-and-desist
description: Draft a cease-and-desist letter (send mode) calibrated to the operator's enforcement posture, or triage an incoming one (receive mode) into a structured options memo with a recommendation.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: ip-legal/skills/cease-desist/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/ip-legal/skills/cease-desist/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# Cease-and-Desist

Two modes. Pick one:

- **send** — draft a cease-and-desist letter calibrated to the operator's enforcement posture. A loud gate runs before delivery.
- **receive** — triage a cease-and-desist someone sent the operator. Produces an options memo with a recommendation.

If the mode is not provided, ask once: "Are we sending a cease-and-desist (asserting) or triaging one received (defending)?" then dispatch.

## Purpose

A cease-and-desist letter asserts a legal right and demands that someone stop doing something. It is one of the most consequential letters an IP practice sends or receives. Sending one is a first step toward litigation — recipients can file a declaratory judgment action in a forum of their choosing, and overbroad or bad-faith assertions can be used against the sender. Receiving one starts a clock and forces a decision. This skill handles both sides with the guardrails the decision deserves.

> **External deliverable (send mode):** the drafted cease-and-desist is sent to the counterparty. Do NOT include any privileged / work-product header on the outgoing letter. Internal drafts, pre-send briefs, and triage memos keep the header per the operator's output conventions.

## Jurisdiction Assumption

Trademark rights are territorial — a US registration does not travel. Copyright is Berne-multilateral but enforcement is jurisdiction-specific, and statutory remedies (including US §504 statutory damages) turn on local law. This skill assumes the jurisdiction declared in the matter or the operator's `Registered in:` footprint. If the infringing conduct, counterparty, or forum is somewhere else, flag it — the draft may not apply as written.

## Load Context

From the operator's IP playbook, pull:

- **Enforcement posture** — default posture, cease-and-desist triggers, soft-letter criteria, approval matrix, automatic escalations.
- **IP practice profile** — practice area mix, registered jurisdictions, outside counsel roster.
- **Output conventions** — work-product header (for internal artifacts), role (lawyer vs. non-lawyer).
- **Any cease-and-desist template or enforcement playbook** referenced in the operator's documents — read it, match the structure.

If the operator's profile is missing required positions (enforcement posture, approval matrix), surface the gap and stop. Do not draft on default assumptions.

## Send Mode — Drafting the Cease-and-Desist

### Step 1: Identify the Right

Ask, in one batch:

> Which IP right are we asserting?
>
> - **Trademark** — is it registered? Where (USPTO, EUIPO, UKIPO, national)? Registration number and class(es)? Or common-law only (first-use date, geographic scope)?
> - **Copyright** — is it registered? Title, registration number, date? Or unregistered (note: US suits require registration for filed claims; statutory damages and fees require pre-infringement registration)?
> - **Both** — identify each.

Record each right. Registered rights get cited by number. Common-law rights get the first-use evidence paragraph. Unregistered copyrights get a flag: "We may not be able to file suit on an unregistered US copyright without registering first — verify before the letter threatens litigation."

### Step 2: Identify the Conduct

Describe the infringing conduct in specifics, not adjectives:

- **Who** is doing it — entity name, individual, platform handle?
- **What** — the accused mark, the accused copy, the accused product? Attach or describe samples.
- **Where** — website URL, marketplace listing, physical retail, social media?
- **Since when** — date first observed, date of the earliest documented use?
- **Evidence** — screenshots, receipts, watch-service hit, customer confusion reports?

Facts go in specific. "You sold product X on [URL] bearing the mark [Y] on [date]" beats "You have been infringing our rights." Adjectives tell on a thin record.

### Step 3: Identify the Relationship

- **Competitor** (direct or adjacent) — standard posture applies.
- **Reseller / channel partner** — tone adjusts; consider the soft-letter path.
- **Former licensee / ex-employee / former partner** — contract provisions likely apply; cite them.
- **Stranger / random infringer** — standard.
- **Current customer or partner** — automatic escalation per the operator's playbook; flag before drafting.

This changes tone, approver, and whether to draft at all without escalation.

### Step 4: Identify the Demand

What does the operator actually want?

- **Stop** — cease the infringing use.
- **Account** — report sales, profits, volumes (for damages baseline).
- **Destroy** — destroy or recall infringing inventory.
- **Damages** — monetary settlement.
- **Transfer or assign** — transfer the domain, hand over the account, assign the accused mark or copyright.
- **Public correction** — takedown of offending content, public statement.
- **Confirm in writing** — compliance undertaking by a date.

The demand must be proportionate to the harm. An overbroad demand is evidence of bad faith if the matter is ever litigated.

**Channel-takedown parallel path (marketplace infringement).** If the accused conduct is on a marketplace (Amazon, Etsy, eBay, Alibaba, TikTok Shop, AliExpress, Walmart Marketplace, Shopify-hosted storefronts), flag the platform's brand-protection / IP-infringement reporting path as a faster, cheaper parallel track that does not require a cease-and-desist or litigation:

- **Amazon Brand Registry** (trademark and copyright takedown, counterfeit removal)
- **Etsy IP Infringement reporting** (trademark / copyright / patent forms)
- **eBay VeRO** (Verified Rights Owner program)
- **Alibaba IPP** (IP Protection Platform)
- **TikTok Shop IP Protection**
- **Shopify DMCA / trademark reporting**

A marketplace takedown often resolves in days; a cease-and-desist gives the infringer time to sell through inventory while negotiating. Recommend filing both when the conduct is marketplace-based, with the cease-and-desist covering off-platform conduct (DTC site, wholesale, social, physical retail) the platform report cannot reach. Note in the pre-send brief whether the parallel path has been filed, is queued, or is declined (and why).

### Step 5: Calibrate to Posture

Read the operator's default enforcement posture and apply:

- **Aggressive** — firm letter, short deadline (often 7–14 days), explicit consequence language (litigation, statutory damages, fees, injunctive relief), no settlement softening.
- **Measured** — firm but professional, standard deadline (14–30 days), consequences noted without theatrics, openness to discussion if they respond.
- **Conservative** — soft letter framing, longer deadline or no hard deadline, "we'd like to discuss" opening, consequence language muted or absent.

Also read the operator's criteria for "when we send a cease-and-desist," "when we send a soft letter first," and "when we just file." If the facts suggest a soft letter or a direct filing per the operator's playbook, flag it before drafting: "Per the operator's enforcement posture, this pattern matches [soft letter / filing]. Confirm before proceeding with a cease-and-desist."

Matter-level overrides beat the operator's default.

### Step 5.5: Counterparty Diligence — Required Precondition

**Before drafting, run counterparty diligence and present the results for sign-off.** This is not conditional on "if the counterparty looks big." Every cease-and-desist assertion carries declaratory-judgment / fee-shifting / bad-faith exposure calibrated to *who* the recipient is. The skill does not draft a cease-and-desist until the diligence has been seen and confirmed.

Collect and present — in one block — the following:

- **Legal entity** — exact corporate name, state/country of formation, registered agent, any `d/b/a` aliases. USPTO / EUIPO ownership records; state Secretary of State business search; public company filings if any. Flag any unconfirmed item.
- **Size and resources** — approximate headcount, revenue band if publicly known, funding if a startup, parent company if a subsidiary. Public sources (LinkedIn headcount, press, Crunchbase, SEC filings). Flag honestly if size cannot be determined.
- **IP portfolio** — do they hold registered marks, patents, or copyrights in adjacent classes? A counterparty with its own IP portfolio is more likely to (a) understand the posture, (b) counter-assert, and (c) file declaratory judgment.
- **Litigation history** — PACER / CourtListener quick pass for prior IP litigation as plaintiff or defendant. A repeat litigant or DJ-happy counterparty changes the calculus.
- **Counsel** — known outside IP counsel? Firm, lead partner if identifiable from prior filings. "No counsel on file" is itself a data point.
- **DJ-plaintiff risk posture** — given size, IP portfolio, litigation history, counsel, and forum: is this a counterparty likely to welcome a cease-and-desist as an invitation to file declaratory judgment in a forum of their choosing? Flag high / medium / low with a one-sentence reason.
- **Relationship risk** — are we a customer of theirs, do we share investors, are they a potential acquirer or partner? Anything beyond "none" is flagged.

Present this as a short memo before the draft:

```
## Counterparty diligence — [Entity Name]

- **Entity:** [name, state of formation, parent if any]
- **Size:** [headcount band, revenue band, funding stage] — [source, verify where applicable]
- **IP portfolio:** [registered marks / patents / copyrights in adjacent classes — or "none found"]
- **Litigation history:** [prior IP cases as plaintiff or defendant — or "none found in quick pass"]
- **Counsel:** [known outside IP counsel — or "none identified"]
- **DJ-plaintiff risk:** [high / medium / low — reasoning]
- **Relationship risk:** [any customer / investor / partner / acquirer overlap — or "none identified"]

**Automatic escalations this triggers** (per operator's enforcement posture):
- [list each trigger this diligence surfaces]

**Confirm before drafting:**
- Proceed with a cease-and-desist against this counterparty given the diligence above?
- Any automatic escalations applicable? If yes, the named approver signs off before drafting, not after.
```

**Do not proceed to Step 6 until the diligence has been engaged with.** A blank "ok" is worse than no confirmation — push back: "Before drafting — anything in the diligence that changes the calculus? Size, prior litigation, their counsel, relationship?"

If diligence surfaces anything on the operator's automatic-escalation list (customer, bigger counterparty, patent matter, press-attracting, etc.), route to the named approver — do not draft until the approver has signed off on going forward.

If critical diligence items cannot be confirmed, say so and flag: "Cannot confirm [entity / size / counsel] from available sources. Pause until a paralegal or outside counsel runs the confirmation?"

### Step 6: Draft

Draft structure:

1. **Sender / letterhead and date**
2. **Recipient block**
3. **Re: line** — concise, does not reveal privileged strategy. Example: `Re: Unauthorized use of [MARK] (US Reg. No. [•])`.
4. **Opening** — identify the sender, the right, the registration (if any), and the fact of the letter.
5. **The right** — trademark: reg number, class, first-use date, registration status; copyright: registration number, title, year, work description; common-law: first-use date, geographic scope, evidence of acquired distinctiveness.
6. **The infringing conduct** — specific: who, what, where, when, evidence.
7. **The legal basis** — `[CITE: Lanham Act §32 / §43(a) / 17 U.S.C. §501 / state UCL / contract §]` as applicable.
8. **The demand** — numbered, specific, proportionate.
9. **The deadline** — calendar date, method of confirmation.
10. **Consequences of non-compliance** — calibrated to posture.
11. **Preservation demand** — documents, communications, metadata related to the accused conduct.
12. **Reservation of rights** — "without waiver of any claims or remedies, whether at law or in equity."
13. **Signature block** — approver per the operator's playbook.

**Drafting rules:**

- **Specificity over adjectives.** Dates, URLs, registration numbers, samples. Adjectives are a draftsperson's tell that the facts are thin.
- **No overbroad assertions.** If the mark is registered in one class and the accused use is in a different class, say so — do not pretend the registration covers both. Overbroad cease-and-desists are evidence of bad faith and can support §43(a)(1)(B) or Rule 11 exposure.
- **Citations as placeholders unless verified.** `[CITE: Lanham Act §32, 15 U.S.C. §1114]` stays as a placeholder unless the user provided the cite or a research tool returned it. Tag every citation with source — `[Westlaw]`, `[user provided]`, `[model knowledge — verify]`, `[web search — verify]`. Never strip the tags.
- **Consequence language matches posture.** Aggressive: specific relief threatened (injunction, statutory damages under 15 U.S.C. §1117 / 17 U.S.C. §504, attorneys' fees). Measured: "we reserve all rights." Conservative: "we'd like to discuss before considering further steps."
- **Jurisdiction-specific hooks** — if US, watch for Anti-Cybersquatting (15 U.S.C. §1125(d)) for domain matters, §43(a) for unregistered marks, §504(c) for pre-registration timing. Non-US: flag the forum and note the draft may need foreign associate review.

### Step 7: The Loud Gate Before Delivery

Before presenting the draft or writing a deliverable file, display this gate verbatim. **The user must engage with it** — a blank acknowledgment is worse than no gate.

```
+-------------------------------------------------------------+
|  BEFORE THIS DRAFT GOES ANYWHERE                            |
+-------------------------------------------------------------+
|                                                             |
|  This is a draft for attorney review — not a letter to      |
|  send. Sending a cease-and-desist letter is an assertion    |
|  of legal rights with real consequences:                    |
|                                                             |
|  * It can trigger a declaratory judgment action in a        |
|    jurisdiction of the recipient's choosing. A well-funded  |
|    recipient can use a C&D as an invitation to pick a       |
|    hostile forum.                                           |
|                                                             |
|  * Overbroad or bad-faith assertions can be used against    |
|    the sender — §43(a)(1)(B) claims, Rule 11 sanctions,     |
|    attorneys' fees under the Lanham Act / Copyright Act.    |
|                                                             |
|  * It starts a dispute that may not settle cheaply.         |
|                                                             |
|  Confirm before the letter leaves:                          |
|                                                             |
|    1. The rights asserted are valid — registered (pulled    |
|       from the register, not assumed) or solidly common     |
|       law with evidence of acquired distinctiveness.        |
|    2. The claim is colorable — a reasonable practitioner    |
|       would make it on these facts.                         |
|    3. The demand is proportionate — we are asking for       |
|       relief the conduct warrants, not everything.          |
|    4. Whoever has authority to start a fight has approved.  |
|    5. Counterparty diligence (Step 5.5) was presented       |
|       and confirmed — entity, size, IP portfolio, prior     |
|       litigation, counsel, DJ-plaintiff risk, and           |
|       relationship risk. Not conditional. Required.         |
|                                                             |
|  Approver per the operator's playbook:                      |
|    [approver name/role from Enforcement posture ->          |
|     Approval matrix -> C&D row]                             |
|                                                             |
|  Automatic escalations that apply here: [list any from the  |
|  operator's playbook that this matter triggers — customer,  |
|  bigger counterparty, patent, press-attracting, etc. —      |
|  surfaced in Step 5.5 diligence]                            |
|                                                             |
|  Parallel-path status (marketplace conduct): [filed /       |
|  queued / declined — from Step 4. "Not applicable" if       |
|  conduct is not on a marketplace.]                          |
|                                                             |
+-------------------------------------------------------------+
```

Do not write the draft to disk or mark it as ready without explicit engagement with the gate.

### Step 8: Output

- **Primary artifact:** the drafted letter, letter-formatted per the structure above. Strip any work-product header from the outgoing letter.
- **In-chat preview:** show the draft as plain text for review before committing to a final file. Iterate before producing the final.
- **Reviewer-facing closing note** (appended to the in-chat preview only, stripped from the final letter):

> This is a draft cease-and-desist letter for attorney review, not a letter ready to send. Sending it is an assertion of legal rights with the consequences described in the pre-delivery gate. A licensed attorney reviews, edits, and takes professional responsibility before sending.

**Citation verification.** Every `[CITE:___]` and every cite carried from a template or provided authority is unverified until run through a citator. Before sending, verify each cite is good law on a legal research platform. Fabricated or misquoted cites in sent assertion letters are professional-responsibility exposure. Preserve the source-attribution tags — `[Westlaw]`, `[CourtListener]`, `[user provided]`, `[model knowledge — verify]`, `[web search — verify]` — tags flagged `verify` get checked first.

**No silent supplement.** If a configured research tool returns few or no results for an authority the draft needs, report what was found and stop. Do NOT backfill from web search or model knowledge without asking. Present options — broaden the query, try a different tool, accept web search with tags, leave the placeholder — and let the user decide.

**Post-send checklist.** After the draft is approved, capture: final read by approver, all `[VERIFY]` resolved, all `[CITE]` filled and verified, privilege markings stripped from the outgoing letter, approver signed, delivery method executed, proof of delivery retained, compliance deadline calendared, escalation plan if no response.

## Receive Mode — Triaging the Incoming Cease-and-Desist

### Step 1: Read the Letter

Extract:

- **Sender** — entity, signer, outside counsel if any.
- **Recipient** — which of our entities/people.
- **Delivery method and date.**
- **Asserted right** — trademark (reg number? jurisdiction?), copyright (registered? title?), both, something else.
- **Alleged conduct** — their version of what we are doing.
- **Legal basis** — statutes, contract provisions, theories cited.
- **Demand** — what they want; is the deadline stated?
- **Threats** — what they say they will do.
- **Tone** — firm / soft / scorched-earth; counsel signature usually signals seriousness.

### Step 2: Assess the Assertion

Not a legal opinion — a structured read:

- **Rights validity.** Are the asserted registrations real and active? (Check USPTO TSDR, EUIPO eSearch, Copyright Office records — flag any that look dormant or not in force.) For common-law claims, what evidence is actually cited?
- **Plausibility of confusion / similarity / infringement.** On the facts as alleged, is this a colorable claim or is it stretching? For trademark: likelihood of confusion turns on multi-factor tests (Polaroid / AMF / Sleekcraft depending on circuit — verify the forum's test). For copyright: access plus substantial similarity. Flag where the claim looks weakest.
- **Overbreadth.** Are they demanding more than the conduct warrants? Overbroad demands weaken leverage and strengthen a §43(a)(1)(B) / unclean-hands counter.
- **Timing.** Laches, statute of limitations, registration timing (for US copyright statutory damages) — flag any date issues on the face of the letter.
- **Forum.** Where would they sue? Is there a declaratory-judgment opportunity for us?

### Step 3: Assess Our Exposure

- **Are we actually infringing?** Honest look. What does the record show?
- **Could we stop easily?** Cost of compliance vs. cost of fight.
- **Is the sender a troll or a real claimant?** Repeat plaintiff? Known willing to fight? Recent cease-and-desist campaign on comparable use? Check public dockets if time permits.
- **What is at stake beyond this dispute?** Brand equity, customer relationships, precedent for similar inbound cease-and-desists.

### Step 4: Options

Present 4–6 options with tradeoffs:

**A — Comply quickly.** When the claim is colorable, compliance is cheap, and the fight is not worth it. Tradeoff: establishes a concession they may point to later. Next step: confirm compliance in writing (narrow), do not concede broader theory.

**B — Negotiate.** When there is a middle-ground business deal (license, coexistence, rebranding timeline) that resolves it. Tradeoff: commits time; requires care on settlement-communication posture (FRE 408 or state equivalent). Next step: holding letter plus opening negotiation track.

**C — Respond firmly (reject).** When the claim is weak, overbroad, or factually wrong; we want to close it down without litigating. Tradeoff: locks in a position; if the claim is in fact colorable, our response becomes an exhibit. Next step: draft a response letter — consider running it through send mode reframed as a response.

**D — Ignore (and preserve).** When the claim is frivolous, the sender has no apparent capacity to sue, the deadline has no legal consequence. Tradeoff: silence can be used as non-denial in some contexts; legal hold required regardless; risk that filing follows. Next step: issue legal hold; log the demand; move on.

**E — Pre-empt with a declaratory-judgment action or cancellation.** When we face real business uncertainty, the claim is weak, and we benefit from our own forum. Tradeoff: we go on offense; budget and leadership sign-off required; there is now a lawsuit. Next step: escalate to outside counsel; do not draft.

**F — File to cancel their mark (TTAB) or invalidate their copyright registration.** When their rights themselves are vulnerable and we want to take the instrument off the board. Tradeoff: slow, expensive, public; separate from the dispute itself. Next step: escalate to outside counsel.

Recommend one with two sentences of rationale. Be specific about why.

### Step 5: Deadline Triage

- **Their stated deadline** — note it; it does not legally bind us (unless a specific statute gives it teeth).
- **Our internal decision deadline** — typically the stated deadline minus enough time to draft, review, and approve a response. Calendar it.
- **Legal deadlines** — statute of limitations on any underlying claim, contractual cure periods, forum-specific timelines.

Ignoring a stated deadline entirely is a choice, not a default. Note that filing usually follows silence, not the deadline date.

### Step 6: Write the Triage Memo

```markdown
# Cease-and-Desist Received — Triage

> **READ FOR TRIAGE, NOT OPINION.** This is an intake scan and options analysis — not a legal merit opinion. The assessment below is a structured read to support counsel's decision on routing and response. Every cited statute, rule, or case is flagged for SME verification; every merit call is the counsel's, not this skill's.

**Slug:** [slug]
**Received:** [YYYY-MM-DD]
**Received by:** [entity / person]
**Incoming file:** [path]

## The assertion

**Sender:** [entity, signer, counsel]
**Asserted right:** [trademark / copyright / both — with specifics, reg numbers, jurisdictions]
**Alleged conduct:** [their version, one paragraph]
**Demand:** [list — specific asks]
**Their stated deadline:** [date]
**Tone:** [firm / soft / scorched-earth]

## Rights validity

[Registrations as asserted — verify against the register; common-law claims evaluated against the evidence cited]

## Legal basis cited

[Each citation inline-tagged with `[SME VERIFY: applicability / currency / jurisdiction]` and source `[Westlaw / user provided / model knowledge — verify / web search — verify]`. Do not rely on any citation here without independent check.]

## Plausibility assessment

- **Confusion / similarity / infringement on the facts:** [read]
- **Overbreadth:** [read]
- **Timing issues (laches, SoL, registration timing):** [read]
- **Forum:** [their likely forum; DJ opportunity]

## Our exposure

- **Actually infringing?** [honest look]
- **Cost of compliance vs. cost of fight:** [read]
- **Sender credibility:** [troll / real claimant / repeat plaintiff — with any public-docket evidence]
- **Collateral stakes:** [brand, customers, precedent]

**Triage rating:** [substantial / debatable / weak / frivolous] — *structured read for routing, not a merit opinion*

## Options

### A. Comply quickly
[Rationale, tradeoffs, next step]

### B. Negotiate
[Rationale, tradeoffs, next step]

### C. Respond firmly
[Rationale, tradeoffs, next step]

### D. Ignore + preserve
[Rationale, tradeoffs, next step]

### E. Pre-empt (DJ)
[Rationale, tradeoffs, next step]

### F. File to cancel / invalidate
[Rationale, tradeoffs, next step]

**Recommendation:** [A/B/C/D/E/F] — [two sentences why]

## Deadlines

- **Their stated deadline:** [date]
- **Our internal decision deadline:** [date]
- **Legal deadlines on any underlying claim:** [SoL, cure, procedural — with dates]

## Immediate actions

- [ ] Legal hold issued — [yes/no]
- [ ] Matter logged — [yes/no/TBD]
- [ ] Counsel assigned — [who]
- [ ] Insurance tendered — [yes/no/N-A]
- [ ] Internal escalation — [who/when]
```

Close the in-chat presentation with this guardrail verbatim:

> This is a triage memo, not advice. The strength assessment above is a first read based on the letter alone — it does not account for facts not surfaced, registrations that cannot be verified, or jurisdictional issues. An attorney evaluates before responding, deciding to ignore, or committing to a path.

### Step 7: Hand Off

Based on the recommendation and user confirmation:

- **Respond firmly** — chain into send mode with context pre-populated as a response letter (the send-mode gate runs anew).
- **Negotiate** — start a holding letter / negotiation track.
- **Pre-empt or file to cancel** — escalate to outside counsel per the operator's IP litigation roster; do not draft.
- **Comply / ignore** — log the decision; issue or confirm the legal hold; close the triage record.

## Decision Posture

When uncertain whether there is infringement, whether a mark is confusingly similar, whether a work is substantially similar, whether a claim is colorable, or whether sending is safe — do not silently decide it is fine. Flag for attorney review, surface the factors cutting both ways, note the uncertainty. Sending a cease-and-desist on an assumption is a one-way door; surfacing doubt is a two-way door.

## What This Skill Does Not Do

- **Send the letter.** Drafting only. The responsible attorney sends, after approval.
- **Research citations.** Placeholders stay as placeholders unless the user provides authorities or a connected research tool returns them. Inventing cites is professional-responsibility exposure.
- **Bypass the gate.** The send-mode gate runs every time.
- **Decide merit definitively on the receive side.** The rating is a structured read for routing; a formal merit opinion lives with counsel.
- **Validate the sender's cited law.** Flags for the user; does not autonomously call a claim valid or invalid.

## Evals

**Given** a send-mode request to draft a cease-and-desist against a Fortune 500 competitor over a US-registered trademark with an aggressive enforcement posture configured in the operator's playbook,
**When** the skill runs,
**Then** counterparty diligence is presented before any draft (entity, size, IP portfolio, prior litigation, counsel, DJ-plaintiff risk, relationship risk), the operator's named approver is surfaced, automatic escalations for "bigger counterparty" are listed, the loud pre-delivery gate is shown verbatim, and the draft is not produced until the diligence and gate have been explicitly engaged with.

**Given** a receive-mode request to triage an incoming cease-and-desist that asserts a trademark in a class where the operator's accused use sits in a clearly different class and the registration appears dormant on the public register,
**When** the skill runs,
**Then** the triage memo flags the registration as `[SME VERIFY]`, marks the assertion as overbroad with reasoning, presents options A through F with rationale, recommends "Respond firmly (reject)" with two-sentence justification, calendars internal and stated deadlines, and prints the read-for-triage-not-opinion guardrail at the top and the not-advice guardrail at the close.

**Given** a send-mode request where no enforcement posture or approval matrix is configured in the operator's playbook and the counterparty diligence cannot confirm the entity (the entity is not on any public register and the user has no documentation),
**When** the skill runs,
**Then** the skill stops before drafting, surfaces both gaps explicitly (missing playbook positions, unverifiable counterparty), refuses to draft on default assumptions, and asks the user to either supply the missing items or pause until a paralegal or outside counsel completes the confirmation — it does NOT silently fill in defaults or proceed with a generic letter.
