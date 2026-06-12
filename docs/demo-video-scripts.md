# PossibLaw Demo Video Scripts

Three audience cuts of one story: **with PossibLaw you see a future where any legal team
handles any type of work with a team of agents — customizable by a non-technical lawyer,
with traceability, governance, and efficiency in one platform.**

| Cut | Composition id | Audience | Runtime @ 30fps |
|---|---|---|---|
| A | `LawFirm` | Boutique / small firm | 90s → `durationInFrames: 2700` |
| B | `LegalDept` | In-house legal department | 90s → `durationInFrames: 2700` |
| C | `BigLaw` | BigLaw practice group | 100s → `durationInFrames: 3000` |

All three share one Remotion project, one component library, and the same finale —
only the cold open, the middle "day in the life" act, and the persona stats differ.

---

## 1. Production spec (Remotion)

Per the remotion-best-practices skill (`remotion-dev/remotion` → `packages/skills/skills/remotion`):

- Scaffold: `npx create-video@latest --yes --blank possiblaw-demo`
- `<Composition>` per cut: `width: 1920, height: 1080, fps: 30`, `durationInFrames` per table above.
- **Motion**: `useCurrentFrame()` + `interpolate()` with `Easing.bezier()` everywhere; `spring()` ONLY
  on the giant-letter slams (physics is explicitly wanted there). CSS transitions/animations are
  forbidden (will not render). Individual transform props (`scale`, `translate`, `rotate`) inline in
  `style` — no composed `transform` strings — so scenes stay editable in Remotion Studio.
- **Scenes**: one `<Sequence from={...} durationInFrames={...}>` per scene row below;
  scene-to-scene cuts via `@remotion/transitions` (`fade()` 12 frames, except where a hard cut is marked).
- **Typewriter** moments: string slicing per frame (never per-character opacity).
- **Fonts**: `@remotion/google-fonts` — Archivo Black (giant type), Inter (UI/body, 400/600).
- **Palette**: PossibLaw light theme — background `#FFFFFF`/`#FAFAF7`, ink `#1A1A1A`,
  brand orange `#F97316` (giant-type fill and accents), muted gray `#6B7280`.
- **SFX**: `@remotion/sfx` (CC0, WAV) via `<Audio>` — `whip` on every giant-letter entrance,
  `pageTurn` on document/work-product reveals, a soft tick on checklist rows. Music: one
  understated electronic bed, −18 LUFS under VO, duck −6 dB during giant-type beats.
- **Screen capture**: record the real dashboard (fresh data dir, `--theme possiblaw`,
  1920×1080 browser, 125% zoom) as MP4s in `public/captures/`; embed via `<OffthreadVideo>`
  inside the `ScreenFrame` component. Capture list in §6.
- **VO**: ~140 wpm; each scene's VO fits its frame window with ≥10 frames of air on both ends.

### Shared component library (build once, reuse in all three cuts)

| Component | What it does | Implementation note |
|---|---|---|
| `GiantWord` | THE flare. A single word/phrase in Archivo Black, ~280px, slams in from off-screen and settles | `spring({frame, fps, config: {damping: 14, stiffness: 160}})` on `scale` (2.2→1) + `translate` (off-screen → center); 4-frame `#F97316` flash on impact; `whip` SFX at frame 0 of each word |
| `WordStack` | 2–4 `GiantWord`s landing in rhythm | stagger 18 frames apart via nested `<Sequence>` |
| `ScreenFrame` | Browser chrome around a dashboard capture, slow push-in | `scale: interpolate(frame, [0, 240], [1, 1.05], {easing: Easing.bezier(0.16, 1, 0.3, 1)})` |
| `Spotlight` | Dims the capture except a circular highlight that glides to the UI element the VO mentions | radial-gradient mask; center driven by `interpolate` keyframes |
| `AgentGrid` | The "wow" shot: 175 small agent tiles (name + lucide icon) cascade into a hierarchy | tiles enter in 8 waves, 6 frames apart, `opacity` + `translate` y 24px→0, `Easing.bezier(0.22, 1, 0.36, 1)`; data straight from `docs/agent-catalog.md` |
| `RoutingFlow` | Animated org-chart path: a matter card travels Chief of Staff → Chief Counsel → lead → specialist | path drawn via `strokeDashoffset` interpolation; card position via keyframed `translate` |
| `StatStamp` | Big number + caption stamped on screen (e.g. "175 AGENTS") | count-up via `interpolate(frame, [0, 45], [0, n])` + `Math.round`, settle flash |
| `TraceRail` | Vertical timeline of issue events (comment → child issue → work product) drawing top-to-bottom | line height interpolated; each node pops at its keyframe with a tick SFX |
| `GateCard` | An approval gate slab: "BLOCKED — AWAITING OPERATOR APPROVAL" with a thumb-stamp "APPROVED" | slab drops in (`translate` y −200→0, bezier overshoot `Easing.bezier(0.34, 1.56, 0.64, 1)`); stamp rotates in at approval beat |
| `LogoLockup` | PossibLaw circuit-tree mark + wordmark (from `branding/`) | draw-on via opacity ramps; final frame of every cut |

---

## 2. Script A — "The Whole Firm" (Law Firm cut, 90s / 2700 frames)

Persona: a 6-lawyer boutique. Story: the firm of six that runs like a firm of sixty.

| # | Frames | Scene & visuals | Giant type (kinetic) | VO | SFX |
|---|---|---|---|---|---|
| A1 | 0–179 | Cold open. White void. Three giant words slam in one after another (`WordStack`), each with impact flash. On the third, camera pulls back: the words become a law-office door plaque | **SIX LAWYERS. / EVERY MATTER. / EVERY HAT.** | "Six lawyers. Every kind of matter. And everybody wears every hat." | `whip` ×3 |
| A2 | 180–419 | Hard cut to black terminal. Typewriter (string-slice): `./bin/possiblaw --demo law-firm`. Enter key. Launch lines scroll; browser opens into the dashboard (`ScreenFrame` capture C1) | — | "This is PossibLaw. One command — and your firm gets a legal operations team." | `pageTurn` on browser open |
| A3 | 420–659 | `AgentGrid` cascade — 175 tiles flood in, organize into the org chart, then `StatStamp`s land | **175 AGENTS** → **34 TEAMS** | "A hundred seventy-five agents in thirty-four teams. Litigation. Real estate. Tax. Family law. Immigration. Marketing, billing, intake — the whole firm." | `whip` on each stamp |
| A4 | 660–1079 | The demo beat. Capture C2: operator types an issue — "Review this lease for our bakery client." `RoutingFlow` overlays the path: Chief of Staff → Chief Counsel → Real Estate Lead → Lease Reviewer. Card lands; findings table scrolls (capture C3), `Spotlight` on risk-rated rows | **WATCH IT ROUTE.** (at 690) | "Drop a matter in. The chief of staff routes it, the practice lead assigns it, and the lease reviewer returns a clause-by-clause findings table — risk-rated, with suggested rewrites — while you pour the coffee." | tick per findings row |
| A5 | 1080–1439 | Customization beat. Capture C4: operator comments "we send this engagement letter every week." Cut to capability-builder's drafted skill posted as a work product; `GateCard` shows "AWAITING OPERATOR APPROVAL", then the APPROVED stamp | **NO CODE. / YOUR PLAYBOOK.** | "See a pattern? Say so in plain English. The capability builder drafts the new skill, and nothing ships until a lawyer — not a developer — approves it." | `whip`, stamp thud |
| A6 | 1440–1799 | Trust beat. `TraceRail` draws the lease matter's full trail (intake → handoffs → defaults disclosed → work product). Then `GateCard`: "Send to counterparty? BLOCKED — operator approval required" | **EVERY STEP. / ON THE RECORD.** | "Every handoff, every assumption, every draft — on the record. And nothing leaves the building without your sign-off." | tick cascade |
| A7 | 1800–2159 | Delivery beat. Capture C5: deliverables-courier files the finished lease review into the firm's OneDrive; folder appears, link posted back on the issue | **WHERE YOU WORK.** | "Finished work lands where your team already works — your OneDrive, your Drive, your Notion. Your tenant, your privilege boundary." | `pageTurn` |
| A8 | 2160–2399 | Efficiency montage: 6 quick capture cuts (NDA draft, invoice prebill, client alert, conflicts check, docket update, settlement draft), 40 frames each, each stamped with its team name | **ONE PLATFORM.** | "Practice, billing, marketing, ops — one platform, with the model provider you choose. Even fully local." | tick per cut |
| A9 | 2400–2699 | Finale (shared, §5): white void, four words land, then `LogoLockup` + URL + Apache-2.0 line | **ANY TEAM. / ANY MATTER. / TRACEABLE. / GOVERNED.** | "PossibLaw. The future of your firm — open source, and already running." | `whip` ×4, music out |

---

## 3. Script B — "The Department" (Legal Department cut, 90s / 2700 frames)

Persona: in-house legal at a growing company. Story: the team that says yes to the business.

| # | Frames | Scene & visuals | Giant type | VO | SFX |
|---|---|---|---|---|---|
| B1 | 0–179 | Cold open: giant words slam in over a blurred wall of Slack pings and contract PDFs | **EVERY TEAM'S LAWYER. / EVERY REQUEST. / YESTERDAY.** | "You're every team's lawyer. Every request was due yesterday." | `whip` ×3 |
| B2 | 180–419 | Terminal typewriter: `./bin/possiblaw --teams inhouse`. Dashboard opens — the subset import loads only the practices the department runs | **YOUR PRACTICES. / NOTHING ELSE.** | "PossibLaw imports the legal department you actually are — commercial, privacy, employment, regulatory, AI governance — and skips the rest." | `pageTurn` |
| B3 | 420–719 | `RoutingFlow` on capture: sales contract lands → Commercial Lead → MSA drafter + obligation extractor in parallel; second card: "vendor breach notice" → privacy team | **INTAKE, HANDLED.** | "Sales drops in an MSA. Procurement forwards a breach notice. Each one routes itself to the right specialist — and starts immediately." | `whip` |
| B4 | 720–1139 | Governance beat (the in-house differentiator). Split screen: left, privacy-encoder gates a confidential matter to a **local model** (capture: ollama lane); right, `GateCard` blocks an outbound notification pending approval | **PRIVILEGE, BUILT IN.** | "Confidential matters can run on fully local models — nothing leaves your machines. Regulator-facing steps stop at an approval gate with your name on it." | low impact |
| B5 | 1140–1499 | Delivery-to-tenant beat. Policy file on screen: `onedrive: trustedFor: [confidential, privileged]`. Courier files a privileged memo into the department's own SharePoint; `Spotlight` on the posted link | **YOUR TENANT. / YOUR RULES.** | "Tell it your tenant is trusted, and finished work files itself into your SharePoint, Drive, or Notion — auto-filed for the document types you choose, on-request for the rest." | `pageTurn` |
| B6 | 1500–1859 | Ops beat. Captures: legal-invoice-auditor flags block billing on an outside-counsel invoice; legal-spend-reporter table; `StatStamp` on flagged adjustments | **SPEND, SEEN.** | "The legal ops team audits outside-counsel invoices line by line and reports spend by matter, firm, and budget — receipts included." | tick |
| B7 | 1860–2159 | Customization beat: GC comments "every NDA over $1M needs my review" → capability-builder drafts the routing rule → APPROVED stamp | **YOUR PLAYBOOK. / NO TICKETS.** | "Want a new rule? Say it. A lawyer approves it. No backlog, no vendor ticket, no code." | stamp thud |
| B8 | 2160–2399 | `TraceRail` across a whole matter family; zoom out to the issue graph | **AUDIT-READY. / ALWAYS.** | "And when anyone asks who did what, when, and why — the record is already written." | tick cascade |
| B9 | 2400–2699 | Shared finale (§5) | **ANY TEAM. / ANY MATTER. / TRACEABLE. / GOVERNED.** | "PossibLaw. The legal department that scales with the business — open source, and already running." | `whip` ×4 |

---

## 4. Script C — "The Practice Group" (BigLaw cut, 100s / 3000 frames)

Persona: a litigation-heavy practice group inside a large firm. Story: scale without losing the standard.

| # | Frames | Scene & visuals | Giant type | VO | SFX |
|---|---|---|---|---|---|
| C1 | 0–209 | Cold open: words slam over a skyline-of-documents visual (stacked deposition transcripts) | **FOUR HUNDRED LAWYERS. / ONE STANDARD. / KEEP IT.** | "Four hundred lawyers. One standard of work. Keeping it is the hard part." | `whip` ×3 |
| C2 | 210–449 | Terminal: `./bin/possiblaw --demo biglaw-practice-group`. Dashboard opens on the litigation team | — | "PossibLaw gives the practice group an agent team that works the way the group already does." | `pageTurn` |
| C3 | 450–899 | Depth beat. `AgentGrid` filtered to litigation: discovery request + response drafters, deposition summarizer, privilege-log builder, settlement and mediation drafters, docket monitor, hold drafter. Captures: privilege log building itself; deposition page-line summary | **DISCOVERY TO SETTLEMENT.** | "Discovery requests and responses. Page-line deposition summaries. Privilege logs with waiver flags. Holds, demands, mediation statements, settlements — specialists for each, not one bot for everything." | tick per tile |
| C4 | 900–1349 | Governance beat (the BigLaw differentiator). Capture: risk-spotter runs a second-pass risk register on a specialist's draft; debate-judge adjudicates two conflicting positions; `GateCard` on the filing question — "NEVER FILES. NEVER SERVES." | **SECOND PASS. / BY DEFAULT.** | "Every work product can get an adversarial second read. Conflicting positions go to a debate judge. And no agent ever files, serves, or sends — those calls stay with counsel." | low impact |
| C5 | 1350–1709 | Traceability beat. `TraceRail` on a matter with twelve child issues; `Spotlight` on "Defaults used" and "Review note" lines in a completion comment | **WHO. WHAT. WHEN. WHY.** | "Associates document their reasoning on good days. Agents document it every time — defaults disclosed, review notes attached, every handoff timestamped." | tick cascade |
| C6 | 1710–2069 | Firm-business beat. Captures: new-matter-conflicts-screener report with flagged hits; prebill-reviewer narrative hygiene table; trust-accounting reconciler flags | **RISK DESK, INCLUDED.** | "Conflicts screens on intake. Prebill review before the client ever sees an invoice. Trust accounting that flags, never touches." | tick |
| C7 | 2070–2429 | Customization-at-scale beat. Group's playbook comment → capability-builder drafts a group-specific review checklist → APPROVED stamp → new skill appears in the catalog grid | **THE GROUP'S PLAYBOOK. / ENCODED.** | "Your group's playbook becomes the system's playbook — proposed in plain English, approved by a partner, versioned like everything else." | stamp thud |
| C8 | 2430–2699 | Scale/efficiency: lane diagram — routing, drafting, review, extraction lanes mapping to model tiers; `StatStamp`: **10 MODEL VARIANTS**; quick flash of fully-local lane for privileged matters | **THE RIGHT MODEL. / EVERY TASK.** | "Heavy models where judgment matters, fast models where volume matters — and fully local where privilege demands it." | `whip` |
| C9 | 2700–2999 | Shared finale (§5), BigLaw tagline variant | **ANY TEAM. / ANY MATTER. / TRACEABLE. / GOVERNED.** | "PossibLaw. Scale the group without bending the standard — open source, and already running." | `whip` ×4 |

---

## 5. Shared finale spec (last 300 frames of every cut)

1. Hard cut to white. Four `GiantWord`s land on a 2×2 grid, 18 frames apart:
   **ANY TEAM. / ANY MATTER. / TRACEABLE. / GOVERNED.** (orange fill on words 3–4).
2. Words scale down 1→0.6 and drift to corners (`Easing.bezier(0.16, 1, 0.3, 1)`, 40 frames)
   as `LogoLockup` draws in center.
3. Bottom line, Inter 600, fades in: `github.com/PossibLaw/possiblaw · Apache 2.0 · runs on paperclip`.
4. Compliance line, Inter 400 gray, 60% size, on screen ≥90 frames in every cut:
   *"PossibLaw is open-source tooling, not a legal-services provider. Regulated legal work requires a licensed lawyer's review and approval."*
5. Music resolves; 12-frame fade to white.

---

## 6. Capture shot list (record once, reuse across cuts)

| id | Setup | Shot |
|---|---|---|
| C1 | `./bin/possiblaw --demo law-firm --reset` fresh data dir | Launch lines → browser opens → dashboard first paint, sidebar visible |
| C2 | same instance | Typing the lease-review issue, moving it to `todo` |
| C3 | same instance | Lease reviewer's findings-table work product, slow scroll |
| C4 | same instance | Capability-builder draft + "AWAITING OPERATOR APPROVAL" comment, then APPROVED reply |
| C5 | delivery configured (policy file + OneDrive token) | Courier completion comment with destination link; the file in OneDrive |
| C6 | `--demo inhouse-legal` | Privacy team routing on a breach-notice issue; ollama lane indicator on a confidential matter |
| C7 | `--demo biglaw-practice-group` | Privilege-log work product; risk-spotter second-pass register; debate-judge adjudication comment |
| C8 | any | Conflicts-screen report, prebill review table, spend report table |
| C9 | any | Issue-graph / matter-family view for the TraceRail zoom-out |

Capture rules: 1920×1080 window, `--theme possiblaw`, demo data only (no real client names),
mouse movement slow and deliberate, 2s of stillness at each shot's head and tail for edit room.

---

## 7. VO and accuracy guardrails

- Numbers spoken or stamped (175 agents, 34 teams, 10 variants) must match the shipped package
  at render time — re-check `docs/agent-catalog.md` before recording VO.
- Never show or imply an agent filing with a court, serving a party, or sending to a counterparty —
  the product's gates forbid it, and the videos must too (it is the governance pitch).
- Demo data only: synthetic names from `companies/demos/`, no real matters.
- Every cut keeps the compliance line in §5.4 on screen ≥3 seconds.
