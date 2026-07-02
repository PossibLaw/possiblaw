# PossibLaw Agent Catalog

178 agents · 174 skills · 34 teams under two executives. Derived from `companies/legal-operations/` (agent frontmatter + `.paperclip.yaml` lanes); regenerate after package changes.

The catalog is the menu — import what your firm practices. `./bin/possiblaw --teams <names>` (e.g. `litigation,commercial`, or presets `boutique` / `inhouse`) imports just those teams plus the executives, meta-reviewers, capability builder, and the skills they reference. See the operator walkthrough.

## Lane rubric

Five lanes, set per agent via `metadata.possiblaw.modelLane` in `.paperclip.yaml`:

- **primary** — org-wide executive judgment + routing at the top of the chain. Reserved for the two executives (`chief-of-staff`, `chief-counsel`); no lead or specialist is `primary`.
- **routing** — practice/function-lead triage + delegation: classify the matter, dispatch to the right specialist.
- **drafting** — produces documents.
- **review** — adversarial clause-by-clause reading.
- **extractive** — structured extraction/tracking, no interpretation.

Decision rule for a new agent: org-wide judgment + routing over every practice/function → `primary`; classifies and delegates within one practice/function → `routing`; otherwise pick by output shape — produces a document → `drafting`, critiques/red-flags an existing document → `review`, extracts or tabulates facts without judgment → `extractive`.

Exception: `reconciler` (a Chief Counsel meta-review specialist) is `drafting`, not `review` — unlike its meta-review siblings `risk-spotter` and `debate-judge`, it merges resolved positions into one consolidated work product rather than critiquing one, so it takes the lane of the document-producing role it actually plays.

Every agent works inside paperclip issues, never sends/files/serves anything externally, and gates external actions on operator approval.

## Executives

| Agent | Lane | What it does |
|---|---|---|
| `chief-of-staff` | primary | Intake, domain routing, delegation, notifications, and operator escalation. |
| `chief-counsel` | primary | Legal practice-area classification and legal-team delegation. |

### Chief Counsel direct reports (meta-review) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `risk-spotter` | review | Second-pass additive risk registers over other specialists' work products. |
| `debate-judge` | review | Structured adjudication of conflicting specialist positions; the operator decides. |
| `reconciler` | drafting | Merges resolved positions into one consolidated work product with a change log. |

### Chief of Staff direct reports — 1 specialist

| Agent | Lane | What it does |
|---|---|---|
| `capability-builder` | drafting | Drafts new skills, agent definitions, and connector descriptors from observed repeatable patterns; operator-review gated. |

## Legal practice teams (28)

### Commercial Lead (`commercial-lead`) — 7 specialists

| Agent | Lane | What it does |
|---|---|---|
| `nda-drafter` | drafting | NDA intake, assumptions tracking, conflicts notice, drafting, and disk output. |
| `contract-reviewer` | review | Clause-by-clause review of commercial contracts with structured risk scoring and our-side logic. |
| `clause-extractor` | extractive | Verbatim clause inventories with location cites; no interpretation or risk rating. |
| `msa-drafter` | drafting | Master services agreement skeleton drafting. |
| `sow-drafter` | drafting | Statement-of-work drafting with MSA conflict flags. |
| `contract-amendment-drafter` | drafting | Amendment and change-order drafting tied to the original contract. |
| `contract-obligation-extractor` | extractive | Obligation, deadline, and notice-window extraction tables. |

### Employment Lead (`employment-lead`) — 6 specialists

| Agent | Lane | What it does |
|---|---|---|
| `employment-offer-letter-drafter` | drafting | Offer letter and employment agreement drafting from matter facts. |
| `employment-policy-reviewer` | review | Clause-by-clause handbook, policy, and restrictive-covenant review with risk ratings. |
| `employment-separation-drafter` | drafting | Separation agreement, severance, and release drafting with privacy-encoder gating. |
| `contractor-classification-analyst` | review | Worker-classification factor analysis, flag-only findings. |
| `workplace-investigation-intake` | extractive | Structured workplace-complaint intake with escalation flags. |
| `cba-reviewer` | review | Collective-bargaining-agreement clause-by-clause review. |

### IP Lead (`ip-lead`) — 6 specialists

| Agent | Lane | What it does |
|---|---|---|
| `ip-trademark-intake-triage` | extractive | Trademark intake extraction, structured intake records, and clearance-search outlines. |
| `ip-licensing-drafter` | drafting | IP license agreement and license-section drafting with OSS-compliance checks. |
| `ip-infringement-analyst` | review | Infringement triage both directions, structured findings, and C&D or response drafts. |
| `dmca-takedown-drafter` | drafting | DMCA takedown and counter-notice drafting, never submitted. |
| `ip-assignment-drafter` | drafting | IP assignment and invention-assignment drafting. |
| `trademark-portfolio-tracker` | extractive | Trademark portfolio tables with renewal-deadline flags. |

### Privacy Lead (`privacy-lead`) — 6 specialists

| Agent | Lane | What it does |
|---|---|---|
| `privacy-dpa-drafter` | drafting | DPA and processing-addendum drafting with SCC/IDTA placeholders and privacy-encoder gating. |
| `privacy-policy-reviewer` | review | Privacy notice and policy review with disclosure-completeness checks and risk ratings. |
| `privacy-incident-triage` | extractive | Data-incident fact intake into structured records with operator follow-ups for regimes and deadlines. |
| `dsr-response-coordinator` | extractive | Data-subject-request intake and response-clock tracking. |
| `dpia-assessor` | review | Data-protection impact assessments with residual-risk flags. |
| `breach-notification-drafter` | drafting | Per-audience breach-notification letter drafting, never sent. |

### Litigation Lead (`litigation-lead`) — 10 specialists

| Agent | Lane | What it does |
|---|---|---|
| `litigation-hold-drafter` | drafting | Litigation-hold notice drafting with custodian scoping and acknowledgment tracking. |
| `litigation-docket-monitor` | extractive | Docket monitoring via CourtListener with structured filing summaries; read-only posture. |
| `deadline-calculator` | extractive | Filing-deadline computation via deterministic FRCP Rule 6 engine; never estimates dates; fails closed to UNCONFIRMED for unsupported jurisdictions. |
| `litigation-demand-response-drafter` | drafting | Demand letter and response drafting; internal work products only, operator gate before any use. |
| `discovery-request-drafter` | drafting | RFP, interrogatory, and RFA drafting, never served. |
| `discovery-response-drafter` | drafting | Discovery responses and objections drafting with privilege flags. |
| `deposition-summarizer` | extractive | Page-line deposition summaries and admission tables. |
| `settlement-agreement-drafter` | drafting | Settlement-agreement skeletons with release scope flagged. |
| `mediation-statement-drafter` | drafting | Confidential mediation statement drafting, never transmitted. |
| `privilege-log-builder` | extractive | Privilege-log tables with waiver-risk flags. |

### Corporate Lead (`corporate-lead`) — 6 specialists

| Agent | Lane | What it does |
|---|---|---|
| `corporate-entity-drafter` | drafting | Entity formation and governance drafting with official-form preparation sheets; never files anything. |
| `corporate-governance-reviewer` | review | Section-by-section governance-document review with risk ratings and proposed redlines. |
| `corporate-diligence-extractor` | extractive | Due-diligence document intake into cited diligence records with red-flag signal logs. |
| `board-minutes-drafter` | drafting | Board and committee minutes drafting pending secretary review. |
| `annual-compliance-tracker` | extractive | Entity annual-report and franchise-tax compliance calendars. |
| `cap-table-reviewer` | review | Cap-table consistency review against source documents. |

### Regulatory Lead (`regulatory-lead`) — 6 specialists

| Agent | Lane | What it does |
|---|---|---|
| `regulatory-filing-drafter` | drafting | License, registration, and regulator-correspondence drafting; never submits to any regulator. |
| `compliance-policy-reviewer` | review | Section-by-section compliance-policy review with risk ratings, regulator flags, and proposed redlines. |
| `regulatory-change-monitor` | extractive | Regulatory-change intake into cited impact records with dates flagged as operator follow-ups. |
| `license-renewal-tracker` | extractive | Business and professional license renewal calendars. |
| `aml-kyc-intake-screener` | extractive | KYC intake completeness tables with risk-indicator flags. |
| `conflict-of-interest-screener` | review | COI disclosure screening with suggested mitigations. |

### Research Lead (`research-lead`) — 5 specialists

| Agent | Lane | What it does |
|---|---|---|
| `legal-research-analyst` | review | Connector-backed legal research memos with exact citations and coverage notes. |
| `legal-citation-checker` | extractive | Citation and quotation verification against supplied sources; currency flagged to operator. |
| `fifty-state-surveyor` | drafting | 50-state survey skeletons with verification gates per state. |
| `case-law-summarizer` | extractive | Structured case briefs from provided opinions. |
| `plain-language-summarizer` | drafting | Client-friendly plain-language document summaries. |

### Tax Lead (`tax-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `tax-research-memo-drafter` | drafting | Issue-spotting tax research memo drafting with open questions flagged. |
| `tax-clause-reviewer` | review | Contract tax-provision review with risk-rated findings. |
| `tax-filing-calendar-tracker` | extractive | Entity tax-filing calendar tables with owners and due dates. |

### Real Estate Lead (`real-estate-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `lease-abstractor` | extractive | Commercial lease abstraction into key-terms tables. |
| `lease-reviewer` | review | Clause-by-clause commercial lease review with suggested rewrites. |
| `real-estate-purchase-drafter` | drafting | Purchase-and-sale agreement skeleton drafting with ancillaries. |

### M&A Lead (`ma-lead`) — 4 specialists

| Agent | Lane | What it does |
|---|---|---|
| `ma-diligence-request-drafter` | drafting | Tailored due-diligence request lists by deal type and industry. |
| `ma-diligence-summarizer` | extractive | Data-room document summaries with red-flag tables. |
| `disclosure-schedule-drafter` | drafting | Disclosure-schedule skeletons keyed to representation sections. |
| `ma-closing-checklist-tracker` | extractive | Signing and closing checklist tracking with dependencies. |

### Banking & Finance Lead (`banking-finance-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `credit-agreement-reviewer` | review | Credit-agreement covenant and default review with risk ratings. |
| `loan-document-drafter` | drafting | Promissory note, guarantee, and security-agreement skeletons. |
| `ucc-filing-tracker` | extractive | UCC-1/UCC-3 tracking tables with lapse-date flags. |

### Securities Lead (`securities-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `public-disclosure-reviewer` | review | Periodic-report and press-release disclosure review with findings. |
| `equity-financing-drafter` | drafting | SAFE, convertible note, and financing-consent skeletons. |
| `trading-window-tracker` | extractive | Insider-trading window and blackout calendar tracking. |

### Restructuring Lead (`restructuring-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `proof-of-claim-drafter` | drafting | Proof-of-claim package assembly with bar dates flagged. |
| `claims-register-analyst` | extractive | Claims-register organization into priority and class tables. |
| `restructuring-agreement-reviewer` | review | Forbearance, standstill, and RSA review with risk ratings. |

### Immigration Lead (`immigration-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `visa-petition-organizer` | drafting | Petition support-letter skeletons and evidence checklists. |
| `i9-compliance-auditor` | review | Internal I-9/E-Verify audit findings with remediation flags. |
| `immigration-deadline-tracker` | extractive | Case-status and immigration-deadline tracking tables. |

### Healthcare Lead (`healthcare-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `hipaa-baa-drafter` | drafting | Business associate agreement and subcontractor BAA drafting. |
| `healthcare-compliance-reviewer` | review | Stark, AKS, and fee-splitting flag-only arrangement review. |
| `clinical-trial-agreement-reviewer` | review | Clinical trial agreement clause-by-clause review. |

### Antitrust Lead (`antitrust-lead`) — 2 specialists

| Agent | Lane | What it does |
|---|---|---|
| `hsr-threshold-analyst` | extractive | HSR transaction-fact intake tables for counsel determination. |
| `competition-policy-reviewer` | review | Competitor-contact and pricing-policy review with risk ratings. |

### Trade Compliance Lead (`trade-compliance-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `sanctions-screening-analyst` | extractive | Party-screening intake tables with potential matches flagged, never cleared. |
| `export-control-classifier` | review | ECCN/USML classification rationales pending counsel sign-off. |
| `tariff-classification-analyst` | review | HTS classification rationales and duty-exposure summaries. |

### Insurance Lead (`insurance-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `coverage-position-analyst` | review | Claim-to-policy mapping into draft coverage-position memos. |
| `claim-notice-drafter` | drafting | Notice-of-claim drafting with deadlines flagged, never sent. |
| `policy-renewal-summarizer` | extractive | Year-over-year policy renewal comparison tables. |

### Construction Lead (`construction-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `construction-contract-reviewer` | review | Construction-contract clause-by-clause review with risk ratings. |
| `lien-notice-drafter` | drafting | Preliminary-notice and lien-claim skeletons, deadlines flagged. |
| `change-order-tracker` | extractive | Change-order logs with cumulative impact flags. |

### Government Contracts Lead (`govcon-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `far-flowdown-analyzer` | review | FAR/DFARS flowdown clause presence review with risk notes. |
| `govcon-proposal-reviewer` | review | Proposal compliance matrices against solicitation requirements. |
| `govcon-certification-tracker` | extractive | Reps-and-certs and registration tracking with renewal flags. |

### Environmental Lead (`environmental-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `permit-obligation-tracker` | extractive | Environmental permit obligation and renewal tracking tables. |
| `esg-disclosure-reviewer` | review | ESG claim substantiation and greenwashing-risk review. |
| `environmental-diligence-summarizer` | extractive | Phase I/II report summaries with findings tables. |

### Trusts & Estates Lead (`estates-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `will-drafter` | drafting | Simple-will skeleton drafting with execution formalities flagged. |
| `trust-drafter` | drafting | Revocable-living-trust skeleton drafting with elections flagged. |
| `estate-inventory-organizer` | extractive | Estate asset and liability inventory tables with gap flags. |

### Family Law Lead (`family-law-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `parenting-plan-drafter` | drafting | Parenting-plan skeleton drafting with standards flagged. |
| `marital-settlement-drafter` | drafting | Marital-settlement-agreement skeletons, support formulas flagged. |
| `financial-disclosure-organizer` | extractive | Financial-disclosure organization into structured tables. |

### Investigations Lead (`investigations-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `witness-interview-memo-drafter` | drafting | Interview memoranda drafting with Upjohn and work-product labeling. |
| `investigation-chronology-builder` | extractive | Source-cited investigation chronologies with conflict flags. |
| `fcpa-risk-screener` | review | Third-party corruption red-flag screening, flag-only findings. |

### AI Governance Lead (`ai-governance-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `ai-use-policy-drafter` | drafting | Internal AI acceptable-use and governance policy skeletons. |
| `ai-vendor-assessment-reviewer` | review | AI vendor terms review covering training-data and output rights. |
| `ai-incident-intake-triage` | extractive | Structured AI-incident intake with escalation-path flags. |

### Advertising Lead (`advertising-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `ad-claims-reviewer` | review | Claim-by-claim ad-copy substantiation review. |
| `promotions-rules-drafter` | drafting | Sweepstakes and contest official-rules skeletons. |
| `influencer-disclosure-reviewer` | review | Endorsement material-connection disclosure review. |

### Benefits Lead (`benefits-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `erisa-plan-reviewer` | review | Plan-document and SPD consistency review with findings. |
| `equity-comp-grant-drafter` | drafting | Option and RSU grant paperwork skeletons, elections flagged. |
| `benefits-notice-tracker` | extractive | Required benefits-notice calendars with delivery status. |

## Business teams (6)

### Finance Lead (`finance-lead`) — 4 specialists

| Agent | Lane | What it does |
|---|---|---|
| `billing-prep` | extractive | Billing entry preparation, time aggregation, and invoice drafting. |
| `expense-categorizer` | extractive | Expense categorization against the firm scheme; ambiguous items flagged for operator. |
| `prebill-reviewer` | review | Prebill narrative and guideline review with edit recommendations. |
| `trust-accounting-reconciler` | review | Three-way trust reconciliation review, flag-only. |

### Marketing Lead (`marketing-lead`) — 4 specialists

| Agent | Lane | What it does |
|---|---|---|
| `intake-form-drafter` | drafting | Marketing intake-form drafting from operator brief. |
| `pitch-polisher` | drafting | Polishes supplied pitch and marketing copy; never invents claims, never sends. |
| `client-alert-drafter` | drafting | Client-alert drafting with facts marked for attorney verification. |
| `newsletter-curator` | drafting | Newsletter assembly from provided items, never sent. |

### Admin Lead (`admin-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `calendar-coordinator` | extractive | Calendar coordination, meeting scheduling, and conflict checking. |
| `cle-compliance-tracker` | extractive | Attorney CLE compliance tables with deadline flags. |
| `legal-proofreader` | review | Defined-term, cross-reference, and numbering proofreading. |

### BD Lead (`bd-lead`) — 4 specialists

| Agent | Lane | What it does |
|---|---|---|
| `bd-proposal-drafter` | drafting | Pitch, proposal, and RFP-response drafting from supplied facts; never sends to prospects. |
| `bd-crm-coordinator` | extractive | CRM record structuring via the HubSpot connector with dedup and completeness checks. |
| `experience-database-curator` | extractive | Matter-experience records for pitches with confidentiality flags. |
| `competitive-intel-monitor` | extractive | Public-source competitive-intel briefing tables with citations. |

### Ops Lead (`ops-lead`) — 8 specialists

| Agent | Lane | What it does |
|---|---|---|
| `ops-vendor-intake` | extractive | Vendor-onboarding fact intake with legal/security review flags; never approves vendors. |
| `ops-sop-curator` | drafting | Internal SOP drafting and revision with versioning; never invents process steps. |
| `hr-internal-coordinator` | drafting | Internal onboarding/offboarding coordination; employment-law questions route to the employment practice. |
| `new-matter-conflicts-screener` | review | Structured conflicts screening with hits flagged, never cleared. |
| `engagement-letter-drafter` | drafting | Engagement-letter skeleton drafting, never sent to clients. |
| `deliverables-courier` | extractive | Files finished work products to policy-declared OneDrive/Drive/Notion destinations with read-back verification; never alters content. |
| `learning-scribe` | drafting | Captures lawyer feedback and `remember this:` comments, generalizes them into sanitized firm-memory lessons, and posts human-approval cards. |
| `skill-improvement-scribe` | drafting | Diffs lawyers' finalized delivered documents against the agent's drafts and proposes sanitized, generalized skill-edit improvements for morning human review. |

### Legal Ops Lead (`legal-ops-lead`) — 3 specialists

| Agent | Lane | What it does |
|---|---|---|
| `outside-counsel-engagement-drafter` | drafting | Outside-counsel engagement letters and billing guidelines. |
| `legal-invoice-auditor` | review | Line-by-line invoice review against billing guidelines. |
| `legal-spend-reporter` | extractive | Legal-spend summaries and accrual tables with anomaly flags. |
