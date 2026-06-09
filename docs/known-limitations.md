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

Even when the operator picks `codex` or `claude`, any matter with
`metadata.possiblaw.privacyTier: confidential|privileged` will block at
runtime unless Ollama is also running (the privacy-encoder skill routes the
substitution step through a local model so confidential plaintext never
reaches a cloud CLI). The launcher emits a non-blocking warning at startup
when this combination is detected.

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

## API-key variants and dry-run

`--dry-run` never creates the paperclip company secret (there is no company
to attach it to). A dry-run of `codex-api` / `claude-api` with the key unset
warns instead of blocking; the live run requires the key exported in the
launching shell. The key is stored once per import as a company secret
(provider `local_encrypted`); re-importing into a fresh data dir creates a
fresh secret, and rotation afterward happens in the Paperclip UI.
