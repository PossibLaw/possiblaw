# Known limitations

This file captures known sharp edges in the PossibLaw + Paperclip combo at the
current pinned commit. Workarounds are listed where they exist. None of these
block a working demo at the 11-agent scale — they get more visible as the
package grows toward 100–200 agents.

## Importer

### Importer DB writes are non-atomic

`POST /api/companies/import` performs ~6 DB writes per agent sequentially. A
mid-failure leaves a partially-created company in the DB. `--reset` is the
documented recovery path.

- Workaround for the operator: re-run `bin/possiblaw --reset --yes`.
- Watch the launcher heartbeat for the elapsed-seconds counter; if the POST
  blows past ~90s without finishing, the launcher reports the partial agent
  count via a side-channel `GET /api/companies` poll.

### Repeated `--target new` imports collide on the issue prefix

Once a company is imported with default `--target new`, a second import in the
same data directory fails on Paperclip's `companies_issue_prefix_idx`
constraint (the `POS` prefix is taken). This is a Paperclip DB constraint,
not a package defect.

- Workaround: pass `--reset` to wipe the data dir, **or** point
  `--data-dir` at a different directory for the second import.

### HTTP timeout risk at scale

The CLI default HTTP timeout is 2 minutes. ~6 DB writes × ~1.5s per write ×
200 agents ≈ 30 minutes worst case, easily exceeding that.

- Mitigation in the launcher: `curl --max-time 600` ceiling, `Connection:
  keep-alive`, elapsed-seconds heartbeat, partial-count check after 90s of
  silence.
- For >200 agents on a slow disk, expect to bump `IMPORT_MAX_TIME_SECS` at
  the top of `bin/possiblaw`.

## UI

### Sidebar agent list is not virtualized

Paperclip's sidebar renders all agents linearly. At ~100 agents the sidebar
gets noticeably sluggish in the browser; at ~200 it starts to jank during
scroll. Operator scope decision (per `~/.claude/plans/eventual-munching-fairy.md`
§7): document, don't patch the submodule.

- Workaround in `.paperclip.yaml`: group agents under `sidebar.agents` so the
  most-used roles appear first. The launcher imports use that ordering.
- Longer-term: a Paperclip-side virtualization fix would solve this for all
  large packages.

## Ollama variant

### Quality

The `ollama` variant ships as **experimental quality**. Llama 3.1 (8B routing,
70B drafting) trails Claude Opus and Codex on long legal-drafting tasks
based on internal spot-checks. Use it for fully-local development, training,
or when matter content cannot leave the operator's machine.

### Setup overhead

The variant requires three pieces in place:
1. Ollama daemon running (`ollama serve`).
2. The model pulled (`ollama pull llama3.1:8b` and/or `llama3.1:70b`).
3. OpenCode global config declaring the `ollama` provider in
   `~/.config/opencode/opencode.json`.

The launcher's preflight checks all three and offers to write the OpenCode
config block on first run.

### Privacy-encoder dependency

Even when the operator picks a cloud variant (`codex`, `claude`, `opencode`,
`openrouter`, or an `-api` twin), any matter with
`metadata.possiblaw.privacyTier: confidential|privileged` will block at
runtime unless a local model lane is also reachable — an Ollama daemon or a
llama.cpp server (the privacy-encoder skill routes the substitution step
through a local model so confidential plaintext never reaches a cloud CLI).
The launcher emits a non-blocking warning at startup when this combination
is detected.

## llamacpp variant

### One model per llama-server

llama.cpp's `llama-server` serves whichever GGUF it was started with and
ignores the model name in the request, so all five lanes pin
`llamacpp/default` — there is no per-lane quality split like the Ollama
variant's 8B/70B mix. Pick the GGUF at server start. Running two
llama-server instances on different ports for a real lane split would need
per-lane `baseURL`s, which OpenCode providers can't express in one provider
block (declare two providers and edit `variants.yaml` lanes if you need
this).

### Same quality and setup caveats as Ollama

Local GGUF models trail the cloud variants on long legal-drafting tasks, and
the variant needs `llama-server` running plus the `llamacpp` provider block
in `~/.config/opencode/opencode.json` (the launcher offers to write it).

## opencode variant interpretation

The `opencode` variant pins OpenCode's own Zen gateway (`OPENCODE_API_KEY`)
— the no-other-vendor-logins reading of "first-class OpenCode". If you
instead want agents to ride a provider you've connected via
`opencode auth login`, edit the lane models in
`companies/legal-operations/variants.yaml` to that provider's prefix; the
adapter passes any `provider/model` id through to OpenCode.

## Routines

### TASK.md routine-binding is partial

A `routine:` block declared inside `projects/<p>/tasks/<t>/TASK.md` is not
fully lifted into the Paperclip import manifest. The top-level
`routines:` section of `.paperclip.yaml` declares the intent and the
recurring `weekly-renewal-scan` task imports correctly, but operator wires
the routine ↔ task assignment in the Paperclip UI after import.

## Connectors

Connector skills under `companies/legal-operations/skills/connector-*/` ship
as Apache-2.0 metadata descriptors only. Endpoints and auth flows for Lexis,
Westlaw, midpage, iManage (upload), and NetDocuments (upload) are flagged
`UNCONFIRMED` and need operator verification against current vendor docs
before live use.

## Hybrid variant

Not shipped. Paperclip's `assigneeAdapterOverrides` only merges config
*within* the same adapter type — it cannot swap adapter types per issue.
A "route confidential issues to Ollama, everything else to Claude" pattern
would need either a per-call routing primitive in Paperclip or a custom
`ollama_local` adapter plugin (out of scope for the current sprint).

## Model probe cost and coverage

Live launches of the codex / codex-api / claude / claude-api variants probe
each distinct lane model with one minimal CLI request before importing (3
models on claude variants, 1 on codex). Each probe is a tiny billable request
against your subscription or API key. `--skip-model-probe` bypasses it; dry
runs never probe. The probe verifies model *access*, not quota headroom — a
plan at its usage limit can pass the probe and still fail mid-run.

The opencode-based variants are not CLI-probed. `openrouter` gets a keyless
catalog pin check (each pinned model must exist in
`openrouter.ai/api/v1/models`); `opencode` and `llamacpp` rely on the key /
endpoint preflights only, so a Zen-catalog rotation or a wrong GGUF surfaces
on the first live run rather than at launch.

## Theme overlay caveats

The `--theme possiblaw|light` overlay serves a patched copy of the BUILT
paperclip UI from `paperclip/server/ui-dist/` (the server's first static
lookup path) and forces static UI mode for launcher-started servers. Caveats:

- The build output (`paperclip/ui/dist/`) and the overlay are untracked files
  inside the submodule working tree — the same class of dirt as
  `node_modules`; the pinned submodule commit never changes. `--theme dark`
  removes the overlay.
- Markdown code blocks in the editor keep a hardcoded dark palette upstream
  (`ui/src/index.css` Catppuccin tokens) even in light mode.
- A server you started some other way (e.g. a long-lived instance launched
  before the overlay existed) picks the overlay up on its next restart, since
  the static path wins over the monorepo dist path.
- After a paperclip submodule update, delete `paperclip/ui/dist` to force a
  rebuild on the next themed run (stale assets otherwise persist).

## Gemini variants have no reasoning-effort lanes

Paperclip's `gemini_local` adapter exposes no reasoning-effort or thinking
knob, so the `gemini` / `gemini-api` lanes differ by model and timeout only
(`gemini-2.5-pro` judgment, `gemini-2.5-flash` routing, `gemini-2.5-flash-lite`
extractive). The adapter also honors `GOOGLE_API_KEY`; the `gemini-api`
variant binds `GEMINI_API_KEY` specifically — if both are set, the CLI's own
precedence applies.

## API-key variants and dry-run

`--dry-run` never creates the paperclip company secret (there is no company
to attach it to). A dry-run of `codex-api` / `claude-api` with the key unset
warns instead of blocking; the live run requires the key exported in the
launching shell. The key is stored once per import as a company secret
(provider `local_encrypted`); re-importing into a fresh data dir creates a
fresh secret, and rotation afterward happens in the Paperclip UI.
