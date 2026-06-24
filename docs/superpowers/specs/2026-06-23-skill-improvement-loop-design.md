# Skill-improvement loop — learn from the lawyer's edits (design)

**Date:** 2026-06-23
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `feat/skill-improvement-loop` (off `main` @ `13b6e1f`, after Tier-1 PR #1 merged)
**Relationship:** Centerpiece of Tier-2 of the learning loop. **Supersedes** the SkillOpt-as-centerpiece design (`2026-06-23-skillopt-design.md` — SkillOpt demoted to a deferred future engine). Tier-1 (per-firm memory) shipped in PR #1.
**Capture model:** **external-destination-first** (the firm's OneDrive / Google Drive), because lawyers finalize and email work product from their own document store, not inside the app. In-app (paperclip-document) capture is a documented future path.

---

## 1. Purpose

Let a firm's agents **improve from real work**, passively. An agent drafts a work product; the courier files it to the firm's OneDrive/Drive; the lawyer edits and finalizes it **there** (where they actually work and email from). A **nightly sweep** re-reads each delivered file by its stable vendor ID, detects that a human changed it, **diffs the lawyer's current version against the draft we delivered**, distills the *generalizable* change, sanitizes out client-identifying facts, and queues a **suggested skill edit**. Each morning the launcher shows the queue to a **designated reviewer** for **yes / no / edit**; approved items become per-firm skill-overlays that improve the agent going forward.

No model training, no live watcher, no graded eval set required, and no reliance on filenames or lawyer conventions — the loop anchors on the **vendor file ID captured at delivery**.

## 2. Operator decisions (resolved 2026-06-23 — do not re-ask)

1. **Centerpiece = the capture + morning-review loop**, not SkillOpt (deferred; needs evals + graded data a firm won't have on day one).
2. **Capture is external-destination-first.** Work product is finalized in the firm's own document store (OneDrive / Google Drive), not in the app. Diff = lawyer's current version vs. the agent's delivered draft.
3. **Anchor on a delivery manifest, not filenames.** At delivery the courier records the vendor file ID (OneDrive item id / Drive file id), stable across renames/moves. The sweep re-reads that exact file by ID. This resolves the naming-convention problem.
4. **Destinations v1 = OneDrive + Google Drive** (both connectors exist). Box and others are later.
5. **Soft "final" signal.** Trigger a diff whenever the delivered file changed since delivery (`modified > deliveredAt`); the **morning review is the real quality gate**. No lawyer convention required.
6. **Execution = a scheduled nightly sweep** (paperclip routine, `schedule` trigger; no event trigger is available to our layer without modifying the submodule).
7. **Review = a morning digest** via the launcher to a **designated reviewer**: yes / no / edit per item.
8. **Apply = per-firm `skill-overlays/`** via the launcher override path; propagation is next-launch.
9. **Privacy = the firm's product-level lane choice** (the variant they run); the ethical-wall **sanitizer** runs on every suggested edit.
10. **Layer-not-fork is absolute.** PossibLaw is a *client* of paperclip's existing APIs and the firm's own cloud (via the existing connectors). All new code is in our layer; `paperclip/` is never modified and no PRs are sent to paperclip.

## 3. Relationship to Tier-1, the delivery layer, SkillOpt, and the eval-harness

- **Reuses Tier-1 (merged in PR #1):** `learning-loop/` `sanitizer` (ethical wall), `ledger`, `store`, `recurrence`; the `learning-scribe` agent (extended to diff-distillation); `businesses/<slug>/` store; `skill-overlays/` (reserved slot); the `--business <slug>` overlay.
- **Builds on the delivery layer (Sprint B, shipped):** `output-delivery-playbook` + `deliverables-courier` + `connector-onedrive` / `connector-google-drive` already file finished work products to the firm's cloud through the gate proxy and read them back by vendor ID. We extend delivery to record a **manifest** and add the nightly read-back/diff.
- **SkillOpt = deferred future engine** (`2026-06-23-skillopt-design.md`): once a firm has enough graded cases, SkillOpt can *generate* eval-validated candidate edits into the *same* morning-review queue. Not built now.
- **Eval-harness = optional future validation:** when a skill has eval cases, a suggested overlay could be regression-checked before being offered/applied. Optional, deferred.

## 4. What we leverage (as a client; verified)

**From the firm's cloud, via the existing connectors (read paths already specced):**
- **OneDrive read-back by ID** — `GET /drives/{driveId}/items/{itemId}` (+ `/content`); token `MS_GRAPH_READ_TOKEN`, scope `Files.Read`; metadata includes `lastModifiedDateTime` / `lastModifiedBy` / `webUrl`. (`companies/legal-operations/skills/connector-onedrive/SKILL.md:124-133`.)
- **Google Drive read-back by ID** — content `GET /drive/v3/files/{id}?alt=media`; metadata `GET /files/{id}?fields=id,name,size,modifiedTime,lastModifyingUser`; token `GDRIVE_READ_TOKEN`, scope `drive.file` (app-created files stay visible — our delivered file qualifies). Native Google Docs need `files.export` (UNCONFIRMED). (`companies/legal-operations/skills/connector-google-drive/SKILL.md:66-70,99-105`.)
- **Stable vendor file ID at delivery** — the gate proxy upload returns the vendor `id` + `webUrl` on 200. (`output-delivery-playbook` step 5; `connector-onedrive:112`; `connector-google-drive:93`.) The gate's hash-chained receipts also log each `upload_document` (candidate manifest cross-check; UNCONFIRMED whether the vendor id is in the receipt body — verify at planning).

**From paperclip, via its existing API (no submodule edits, no PRs):**
- **Scheduled routine** — `ROUTINE_TRIGGER_KINDS = ["schedule","webhook","api"]` (`paperclip/packages/shared/src/constants.ts:370-371`); the nightly sweep is a `schedule` routine (operator sets the cron in the UI, per the Tier-1 `learning-sweep` precedent).
- **Agent-triggers-agent** — `runRoutine(...)` / `POST /routines/:id/run` with `assigneeAgentId`, plus `heartbeat.wakeup` (`paperclip/server/src/services/routines.ts:2114-2137`; `routes/routines.ts:414-430`) — the sweep dispatches the diff/scribe agent.
- **(Future, in-app path only)** documents/revisions/lock (`documentRevisions`, `POST …/lock`) exist but the lawyer-facing UI has **no human finalize button** and lawyers edit externally — so in-app capture is deferred.

## 5. Architecture — what we add (all in our layer)

- **Package (`companies/legal-operations/`):**
  - **Delivery manifest** — extend `output-delivery-playbook` / `deliverables-courier` to record, on every successful delivery, a manifest entry: `{ matter, issueId, agentId, skillSlug, destinationKind, driveId?, vendorFileId, deliveredAt, draftHash, draftLocalPath }` into `businesses/<slug>/deliveries/`.
  - **`skill-improvement-scribe`** — extend `learning-scribe` (ops-lead, drafting): given a delivered draft + the lawyer's current version, diff them, distill the generalizable change, sanitize, and queue a suggested skill edit.
  - **`skill-improvement-sweep`** — a **scheduled (nightly) routine** that walks the manifest, reads each delivered file by vendor ID via the connector, detects human-modified-since-delivery, and dispatches the scribe per changed file.
- **`learning-loop/` (TS component):**
  - **`manifest.ts`** — read/write the delivery manifest + per-entry idempotency state (`lastProcessedHash`).
  - **`diff.ts`** — compute the meaningful textual diff between the delivered draft and the current version; produce a structured change set the scribe reasons over.
  - **`proposals.ts`** — the firm-repo proposal queue (extends `ledger`): a suggested edit = `{ skillSlug, sourceMatter, vendorFileId, observedChange, generalizedEdit, proposedOverlayBody, status }`; statuses proposed/approved/edited/rejected; all post-sanitizer.
  - reuse `sanitizer`, `recurrence`, `store`.
- **Launcher (`bin/possiblaw`, stdlib helpers):**
  - **Morning digest** — first run of the day for a `--business <slug>`: surface pending proposals to the designated reviewer (yes / no / edit), gated once per day.
  - **Overlay-override apply path** — carried from `2026-06-23-skillopt-design.md` §6b: a dedicated overlay pass in `_possiblaw_inline_source.py` that **replaces** `skills/<slug>/SKILL.md` with `businesses/<slug>/skill-overlays/<slug>/SKILL.md` (override, not collision-error; unknown slug errors; demo extra-root collision guard intact).
- **Firm repo (`businesses/<slug>/`):** `deliveries/` (manifest), `proposals/` (queue), `skill-overlays/<slug>/SKILL.md` (+ `SKILL.md.prev`), a `reviewer` config field.

## 6. Data flow (end to end)

1. **Draft + deliver.** A drafting agent produces the work product (local copy retained); the courier files it to the firm's OneDrive/Drive via the gate proxy and **records a manifest entry** (vendor file ID + delivered draft hash).
2. **Lawyer finalizes externally.** The lawyer opens the file in their own Drive/OneDrive, edits, finalizes, and emails it. No app action required.
3. **Nightly sweep.** `skill-improvement-sweep` runs (cron). For each manifest entry, it reads the file's current metadata by vendor ID; if `modified > deliveredAt` and the content hash differs from `lastProcessedHash`, it fetches the current content.
4. **Diff + distill.** The scribe diffs the current (final) version against the delivered draft and distills the **generalizable** change (e.g., "default governing law to Delaware for sales NDAs unless specified") — not the client-specific wording.
5. **Sanitize.** The change passes the Tier-1 fail-closed `sanitizer`; client-identifying facts are stripped/generalized or the item is dropped. Nothing client-identifying is stored.
6. **Queue.** A suggested skill edit (source matter, observed change, generalized edit, proposed overlay body) is written to `businesses/<slug>/proposals/`; `recurrence` flags edits seen across matters; the manifest entry's `lastProcessedHash` is updated so the same change isn't re-proposed.
7. **Morning digest.** The launcher presents the queue to the designated reviewer: **yes** (apply) / **no** (reject, archived) / **edit** (modify then apply).
8. **Apply.** Approved → `businesses/<slug>/skill-overlays/<slug>/SKILL.md` (prior archived to `SKILL.md.prev`); applied at **next launch** via the override path.

## 7. Key mechanisms / seams

### 7a. Delivery manifest (the anchor)
Recorded by the courier at delivery; keyed on `vendorFileId`. This is what makes the loop robust to renames/moves and removes any need for naming conventions. Source of truth is the manifest file in `businesses/<slug>/deliveries/`; the gate-proxy receipt chain is a cross-check. **UNCONFIRMED — confirm the upload 200 response surfaces the vendor id to the courier (it does per the connector skills) and that we can persist it at delivery time.**

### 7b. Connector read-back + soft-final detection
Per destination: OneDrive `GET /drives/{driveId}/items/{itemId}` (+ `/content`); Drive `GET /files/{id}?alt=media` (+ metadata fields). "Changed by a human since delivery" = `modified > deliveredAt` (the app wrote the file exactly once at delivery, so any later change is the lawyer's); `lastModifiedBy`/`lastModifyingUser` is an optional refinement. Idempotency via `lastProcessedHash` per entry. Read tokens are the agent-side read-scoped `*_READ_*` vars (never write scopes). **UNCONFIRMED — exact metadata field names per vendor; Google native-Docs export path; verify at planning.**

### 7c. Diff → suggestion distillation
The scribe receives delivered-draft + current-final text; `diff.ts` provides a structured change set; the scribe's skill prompt enforces a *generalized* lesson + one-line rationale + the target skill slug (the skill the drafting agent used, carried in the manifest). It never copies client-specific clauses verbatim.

### 7d. Firm-repo proposal queue
`proposals.ts` extends the `ledger` status machine; every entry carries a required source-matter citation and is post-sanitizer. Contradictory suggestions are flagged for reviewer reconciliation, never silently merged.

### 7e. Morning-review digest
First launcher run of the day for the business shows pending proposals; the reviewer answers yes/no/edit. Designated reviewer is a `businesses/<slug>/` config field (default: the launcher operator). A `learn review` CLI subcommand offers the same outside the morning prompt. (A richer in-app review surface is a future enhancement; the CLI/launcher digest is v1.)

### 7f. Overlay-override apply path
Carried verbatim from `2026-06-23-skillopt-design.md` §6b. A firm overlay's `SKILL.md` shares the base skill's rel-path and must **override** it; the launcher's existing extra-root pass *raises* on a shared path (`_possiblaw_inline_source.py:286-289`), so we add a dedicated overlay pass with replace semantics + a log line, guarding unknown slugs and preserving the demo-collision check.

## 8. Privacy & ethical wall

- **Lane = the firm's product choice** (the variant they run); no loop-specific privacy default. Reading the firm's own Drive/OneDrive and diffing in the firm's chosen model lane sits inside the firm's privilege boundary and privacy posture; a future consolidated per-business privacy/lane setting reads in at the same point.
- **Sanitizer is the ethical wall.** Every suggested edit passes the Tier-1 fail-closed `sanitizer` before storage or display — one client's identifying facts can never be baked into a firm-wide skill. Most safety-critical component; unit-tested on a labeled fixture.
- **Read-only, least-privilege reads.** The sweep uses agent-side read-scoped tokens (`MS_GRAPH_READ_TOKEN` / `GDRIVE_READ_TOKEN`); it never writes to the firm's cloud and never uses a write-scoped token.

## 9. Error handling, isolation & layer-not-fork guarantees

- **Layer-not-fork:** every new artifact is in our layer (`companies/legal-operations/`, `learning-loop/`, `bin/possiblaw`, `businesses/<slug>/`). `paperclip/` is untouched; no PRs; we only call paperclip's API and the firm's cloud via the existing connectors.
- **Fail-closed sanitizer:** a rejection drops the suggestion (no partial store).
- **Idempotent sweep:** `lastProcessedHash` per manifest entry prevents re-proposing the same change; a delivered file unchanged since delivery is skipped.
- **Graceful read failures:** a `401/403/404/429` on read-back is logged per entry (token expired / not visible / moved-to-untracked / rate-limited) and the sweep continues; never corrupts the queue or blocks the dashboard.
- **Reviewer-gated apply:** no overlay without an explicit yes/edit; `SKILL.md.prev` archived for one-move revert.

## 10. Testing (TDD) + eval walkthrough

**Tests:**
- **`learning-loop/` (node:test):** `manifest` (write/read entry, idempotency state), `diff` (delivered-vs-final change set; identical content → no change; whitespace-only → no change), `proposals` (status transitions, source-matter required, post-sanitizer invariant, contradiction flag), `sanitizer` reuse on suggested-edit fixtures (leaked client fact → dropped).
- **Connector read-back (mocked HTTP):** by-ID fetch + metadata parse for OneDrive and Drive; `modified > deliveredAt` detection; token-expiry/not-visible handled gracefully.
- **Launcher (`python --self-test` + `bash -n`):** overlay-override replaces `skills/<slug>/SKILL.md`; unknown overlay slug errors; demo extra-root collision still errors; morning-digest once-per-day gating; no-business dry-run regression unchanged.
- **Package parse checks:** updated `output-delivery-playbook` / courier + `skill-improvement-scribe` frontmatter valid; dry-run counts update cleanly.
- **Live-ish e2e (disposable server, never port 3100; mocked cloud):** courier delivers → manifest entry written; simulate a human edit (changed content + later modifiedTime) on the by-ID read; run the sweep → scribe diffs + sanitizes → proposal queued → morning digest "yes" → overlay written → `--business` import readback shows the overridden skill body.

**Eval walkthrough (Given/When/Then):**
- **Happy:** Given an NDA the agent delivered to the firm's Google Drive (manifest records the file id + draft hash), and a lawyer who edits in a Delaware governing-law clause; When the nightly sweep runs; Then it detects the change, distills a sanitized suggestion ("default governing law to Delaware for sales NDAs unless specified"), queues it, and the morning digest applies it to `legal-nda-playbook` on "yes".
- **Edge (no/irrelevant change):** Given a delivered file unchanged since delivery, or changed only in client-specific ways; When the sweep runs; Then nothing is queued (unchanged → skipped via `lastProcessedHash`; client-specific → dropped post-generalization), logged with a reason — not an error.
- **Failure/security (ethical wall + offline-edit blindness):** Given the lawyer's edit embeds client-identifying facts, the sanitizer strips/generalizes or fails closed and nothing client-identifying is stored. And given the lawyer instead downloads the file and edits it offline without re-saving to the tracked Drive file, the sweep sees no change and surfaces nothing — a documented limitation, not a silent failure.

## 11. Scope boundary

**In scope this build:**
- delivery **manifest** (extend `output-delivery-playbook` / `deliverables-courier`);
- connector **read-back by ID** + soft-final detection for **OneDrive + Google Drive**;
- `skill-improvement-scribe` (extend `learning-scribe`) + `skill-improvement-sweep` nightly routine;
- `learning-loop/` `manifest.ts` + `diff.ts` + `proposals.ts` (+ sanitizer/recurrence/store reuse);
- launcher morning-digest (yes/no/edit) + the overlay-override apply path;
- firm-repo `deliveries/` + `proposals/` + reviewer config;
- docs (README, CHANGELOG, CLAUDE.md code-map, known-limitations, walkthrough) + HANDOFF refresh.

**Explicitly deferred (documented):**
- **In-app (paperclip-document) capture** — for firms whose lawyers edit in the app; needs a human finalize/lock affordance; future.
- **Box and other destinations** — net-new connectors; future.
- **SkillOpt engine** + **eval-harness validation** of suggested edits — future.
- **Native Google Docs** (`files.export`) — verify and add later; v1 covers markdown/docx files.
- a richer in-app review surface (v1 is the launcher digest + `learn review` CLI);
- a consolidated per-business privacy/lane settings object (read point only).

## 12. Risks / landmines

1. **Offline-edit blindness** — if the lawyer downloads, edits in Word, and emails without re-saving to the tracked cloud file, we never see the final. Mitigation is workflow ("edit in place in the firm's Drive"), documented as a known limitation; the manifest at least scopes us to files we can see.
2. **Ethical-wall breach** — gravest risk; fail-closed sanitizer + reviewer gate + source-matter citation; unit-tested on a labeled fixture.
3. **Bad-suggestion propagation** — morning human gate + `SKILL.md.prev` revert + recurrence weighting.
4. **Vendor API specifics** — exact metadata fields, native-Docs export, receipt contents (§7a/§7b UNCONFIRMED); verify against the connectors before building read-back.
5. **Manifest drift** — a file moved out of the app's scope (`drive.file`) or deleted reads as not-visible; handled as a logged skip, not an error.
6. **Re-delivery / multiple drafts** — if the agent delivers several drafts of the same matter, the manifest must track which delivered draft a given file id corresponds to (latest delivery wins per file id); covered by `manifest.ts` tests.

## 13. Open items / UNCONFIRMED to resolve at planning

- **Manifest persistence:** confirm the courier can capture the vendor `id` at delivery and persist it; decide manifest file vs. gate-receipt-derived (§7a).
- **Vendor metadata fields:** exact `modified*` / `lastModifiedBy` field names for Graph and Drive; Google native-Docs export path (§7b).
- **Read scopes/tokens:** confirm `MS_GRAPH_READ_TOKEN` / `GDRIVE_READ_TOKEN` read scopes suffice for by-ID content reads of app-created files.
- **Designated-reviewer config + digest UX:** field name/location in `businesses/<slug>/`; launcher prompt vs `learn review` CLI; once-per-day gating marker.
- **Sweep scheduling:** how the nightly `skill-improvement-sweep` cron is declared/wired (operator sets cadence in the UI, per the Tier-1 `learning-sweep` precedent).
