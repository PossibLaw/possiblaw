# Conflicts party index

`parties.jsonl` in this directory is the firm's append-only party index for
the deterministic conflicts screen (`bin/_possiblaw_conflicts_screen.py`,
spec: `docs/designs/deterministic-conflicts-screen.md`).

- One JSON record per line: `{"party", "role", "matterId", "addedAt"}`.
- Written only via the helper's `--register` mode; agents never edit it.
- The screen matches normalized exact names against this index plus the
  ethical-walls registry. A NO_HIT never clears a conflict — it upgrades the
  mandatory human confirmation with evidence of what was checked.
- Grows with use: every screened matter registers its parties, including
  declined or conflicted prospects (they still create duties).

This file contains client and counterparty names. It stays inside the
per-firm `businesses/<slug>/` directory, which is gitignored.
