# Demo Video 1 — "Run the business side of your firm. With receipts."

Operator-layer demo script (video 1 of 2). Target length **3:30–4:00**. Talk-to-camera
plus screen capture. Video 2 (litigation integrity) is scripted separately after
WP-F2/WP-F3 land — see `.agent/PLAN.md` Sprint F.

**Positioning guardrails for this video**
- Lead with the operator layer. Practice layer gets one teaser line, no more.
- "Runs next to Clio" — never "replaces Clio."
- No motion/pleading drafting on screen at any point (see litigation-integrity
  positioning: verification, not drafting).
- Every claim shown must be reproducible by a viewer from the public repo.

---

## Pre-flight (do all of this BEFORE recording)

1. Fresh disposable data dir + port — never your working instance:
   ```bash
   export DEMO_DD="$HOME/possiblaw-demo-data"
   ```
2. Confirmed working baseline (record only after all pass):
   ```bash
   bash -n bin/possiblaw
   ./bin/possiblaw --dry-run --variant claude --teams flagship \
     --non-interactive --yes --mission "operator demo rehearsal" \
     --data-dir "$DEMO_DD" --port 3188
   # expect: preview agents=63 skills=90 ... warnings=0 errors=0
   kill "$(cat "$DEMO_DD/possiblaw.pid")"   # dry-run leaves the server up by design
   ```
3. `pandoc` installed if you want the `.docx` delivery beat (optional; the
   markdown delivery beat works without it and never silently falls back).
4. Model quota headroom on the variant you demo (the probe checks access, not
   quota — a plan at its limit passes preflight and dies mid-demo).
5. Browser zoomed to ~125% for legibility; dashboard on `--theme possiblaw`.
6. Rehearse the full run once end-to-end. Import of 63 agents takes real time;
   capture it, then timelapse in the edit.

**Known sharp edges to avoid on camera** (`docs/known-limitations.md`):
- Do not re-import into the same data dir without `--reset` (issue-prefix
  collision).
- Routines (intake sweep etc.) need manual wiring in the paperclip UI after
  import — do NOT claim "fully automatic intake" on camera until the WP-F4
  live verification of the auto-provision path is done. `UNCONFIRMED`.
- Stay off Notion delivery (no write path) and CRM writes (hard-blocked by
  design — fine to *mention* as a fail-closed feature, not as a workflow).

---

## Cold open (0:00–0:20) — camera

> "Law firms have great software for managing cases. Almost nothing for
> running the *business* — the intake, the engagement letters, the invoices,
> the follow-ups. I spent fifteen years in big law watching lawyers do that
> part at 10pm.
>
> So I built an AI operations layer for it. It's open source, it runs on your
> machine, and — this is the part that matters — every single thing it does
> leaves a receipt. Let me show you."

On-screen text: **PossibLaw — open source, Apache 2.0** + repo URL.

## Beat 1 — Launch the firm (0:20–0:55) — screen

```bash
./bin/possiblaw --teams flagship --data-dir "$DEMO_DD" --port 3188
```

- Show the preset expansion line: `teams: preset 'flagship' -> commercial,
  litigation,research,bd,ops,finance,marketing,admin,legal-ops`.
- Timelapse the import; land on the dashboard.

> "One command. It imports a focused firm — nine teams, sixty-three agents:
> a chief of staff, business operations — BD, finance, marketing, admin,
> legal ops — plus two practice teams we'll come back to. Not a chatbot: an
> org chart, with routing rules and permissions."

Scroll the sidebar slowly past the leads (this is the org-chart money shot).

## Beat 2 — A matter walks in (0:55–1:35) — screen

Create an issue addressed to the chief of staff, e.g.:

> *"New client: Meridian Staffing (fictional). They need a vendor services
> agreement reviewed and a fee engagement set up. Get us ready to start."*

- Show chief-of-staff routing: conflicts confirmation step (human-gated —
  say so), then delegation to `engagement-letter-drafter` under ops.

> "I state the matter in plain English. The chief of staff routes it — and
> notice the first thing it does is stop and ask a human to confirm conflicts.
> This system's signature move is *refusing* to guess."

## Beat 3 — Engagement letter + invoice (1:35–2:20) — screen

- Open the engagement-letter work product when it lands; scroll it.
- Then ask `billing-prep` (finance) for a draft invoice for the first
  milestone.

> "A real engagement letter draft, from the firm's own playbook — and over in
> finance, a draft invoice with an actual rate card, real invoice numbering,
> Net-30 terms. Not a demo prop; there's a deterministic eval in the repo
> that checks these numbers."

On-screen text: `pnpm eval: finance-memo-sanity — deterministic ✓`

## Beat 4 — Delivery, with a receipt (2:20–3:00) — screen

- Have `deliverables-courier` file the engagement letter to the local
  deliverables tree (credential-free path).
- Then the receipt:

```bash
curl -s "http://127.0.0.1:<gate-port>/receipts/bundle?issueId=<matter>" | less
```

- Scroll the Matter Trust Report: the delivery receipt, the hash chain.

> "Here's the part no one else shows you. Every action — the routing, the
> draft, the delivery — is in a hash-chained receipt file you can verify with
> openssl, offline, without trusting me. If a client or a regulator ever asks
> 'what did the AI do on this matter?' — this is the answer. Cryptographic,
> not vibes."

## Beat 5 — The operator's cockpit (3:00–3:30) — screen

```bash
pnpm -C firm-overview start   # config per docs/workflows/ethical-walls.md
```

- Show the board: issues in flight, pending approvals, deliverables.
- Approve one pending item on camera.

> "And this is your morning: one screen — everything in flight, everything
> waiting on a human, everything delivered. You approve; the agents proceed.
> Nothing goes out the door without you."

## Close (3:30–4:00) — camera

> "If you run on Clio or MyCase — keep it. This runs next to it and takes the
> business side off your plate. And if you want to go further: the same org
> chart has practice teams — contracts review, litigation support with
> verified citations and deterministic deadlines. That's the next video.
>
> It's all open source. Link below. Clone it, read the receipts, tell me
> what breaks."

End card: repo URL + "Built by a recovering big-law litigator" + Trazomo
mention (one line).

---

## Edit notes

- Caption every fail-closed moment ("refused: needs human confirmation") —
  the refusals are the brand.
- All client names fictional; say so on screen once.
- B-roll: `bash -n` green run, receipt JSON scrolling, the org chart.
- Do NOT speed up the receipt-verification beat; slow is credible there.
