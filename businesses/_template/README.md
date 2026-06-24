# Per-business learning store (template)

Copy this directory to `businesses/<your-firm-slug>/` (the launcher does this
on `--business <slug>` if it is absent). Commit it **in your own clone** — it is
your firm's portable memory.

- `memory/firm-memory.md` — the HOT memory injected into every matter (≤ ~100 lines, generated).
- `memory/archive/` — decayed/overflow lessons.
- `learnings/ledger.jsonl` — canonical lesson record (generated); `ledger.md` — human view.
- `skill-overlays/` — per-skill firm overlays written by the morning-review approve-edit; applied on the next `--business <slug>` launch. (SkillOpt-style auto-refinement remains deferred.)
- `deliveries/` — delivery manifest (system-captured ids and content hashes, no client facts).
- `proposals/` — queued skill-edit proposals awaiting morning review.

Edit lessons only through the paperclip approval flow — do not hand-edit `ledger.jsonl`.
