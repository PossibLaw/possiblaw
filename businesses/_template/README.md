# Per-business learning store (template)

Copy this directory to `businesses/<your-firm-slug>/` (the launcher does this
on `--business <slug>` if it is absent). Commit it **in your own clone** — it is
your firm's portable memory.

- `memory/firm-memory.md` — the HOT memory injected into every matter (≤ ~100 lines, generated).
- `memory/archive/` — decayed/overflow lessons.
- `learnings/ledger.jsonl` — canonical lesson record (generated); `ledger.md` — human view.
- `skill-overlays/` — reserved for Tier-2 (SkillOpt) skill edits.

Edit lessons only through the paperclip approval flow — do not hand-edit `ledger.jsonl`.
