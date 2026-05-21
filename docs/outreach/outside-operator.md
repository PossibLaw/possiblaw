# Outreach Template — Outside Operator

Use this template when reaching out to a friendly outside operator (solo attorney, small-firm administrator, legal ops lead) who is willing to try PossibLaw on a real matter and give honest feedback.

**Replace all `[bracketed]` items before sending.**

---

**Subject:** Would you spend an hour trying PossibLaw on a real matter?

Hi [Name],

I built a proof-of-concept called PossibLaw that shows how to wire AI agents into the day-to-day operations of a small legal practice — NDA drafting, intake forms, invoices, and similar routine work. I'd love your perspective as someone who actually runs this kind of work.

The project is open-source and public on GitHub. Important upfront: it is explicitly a PoC, not a finished product. It's not legal advice, it doesn't practice law, and I wouldn't ask you to use it for anything that doesn't have your eyes on it before it leaves the door. Every output includes an explicit disclaimer to that effect.

What I'm asking is simple: clone the repo, follow the getting-started guide, and try it on one real matter — or a lightly fictionalized version of one. Then tell me what worked, what didn't, and what felt wrong. An hour of your time. No obligation beyond that.

A few things that might be relevant for you:

- **Privacy:** A Privacy Filter masks sensitive entities (names, EINs, dollar amounts) before anything reaches the cloud. You control the profile: always-mask, cloud-only, or off.
- **Cost transparency:** Every run prints a per-agent cost breakdown. There's a full offline mode that costs nothing (uses local fixtures).
- **Audit trail:** Every step is logged to a local JSONL audit file.

If you're willing, I can walk you through setup in 15 minutes on a call, or you can follow [docs/getting-started.md](../getting-started.md) solo.

Thanks for considering it.

[Your name]
[Your contact]
[Repo URL: https://github.com/PossibLaw/possiblaw]
