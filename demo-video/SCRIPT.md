# Talking-head script — PossibLaw architecture video (~1:49)

Spoken pace target: ~145 words/min. Timestamps match the video's scene cuts —
loose sync is fine; land the bolded beats near their scene and you're golden.
~265 words total.

---

**[0:00 — TITLE: "Agents do the work…"]**

I started with an idea. What if legal work was atomic — small units of work,
done by small, specialized agents? Atomic work. Atomic agents. Would the
output actually be better?

**[0:05 — LAYER, NEVER A FORK]**

So I built the whole thing in the open — a legal AI layer on an open-source
control plane — and then I tested my own idea on Harvey's public benchmarks,
scored by Harvey's own judge, under rules I wrote down *before* I ran
anything.

**[0:16 — SEPARATION OF POWERS]**

The answer, so far? **No.** Teams of agents didn't reliably beat one strong
agent. I published everything — the scores, the method, the parts that didn't
flatter me. But building that experiment forced me to build something better
than the hypothesis: an architecture where a team can *improve* every agent —
each one with its own skills, its own evals — and prove what happened.
Real receipts.

**[0:29 — THE GATE PIPELINE]**

Every consequential action — an email, a court filing, a signature, a payment
— passes through a gate proxy. The agents never hold credentials. Policy
decides: allow it, anonymize it, or stop and ask a human. And an approval is
bound to the exact payload — approving X never authorizes Y.

**[0:45 — CONFIDENTIALITY & PRIVILEGE]**

Confidential matters route through local models. Client names get masked
before anything touches the cloud — and the key never leaves your machine.
Confidentiality can be raised. Never lowered.

**[0:59 — MATTER OWNERSHIP & WALLS]**

Ethical walls are real walls. A screened matter doesn't show a lock icon —
it doesn't exist. And approving an action takes authority *and* entitlement
to that specific matter. One never implies the other.

**[1:14 — THE AUDIT SPINE]**

And everything — every gate decision, every trace of which model ran, on what,
and why — lands in a hash-chained receipt you can verify offline, without
trusting me. Evals make each agent improvable. Receipts make the whole firm
accountable.

**[1:29 — HONEST LIMITS]**

The thesis failed. The architecture didn't.

**[1:42 — CLOSE]**

It's open source. Clone it. Read the receipts. Tell me what breaks.

---

## Delivery notes

- The two sentences to hit hardest: "**The answer, so far? No.**" (0:16) and
  "**The thesis failed. The architecture didn't.**" (1:29). Pause a full beat
  after each.
- "It doesn't exist" (walls) lands best flat and quiet — no emphasis needed.
- If you run long, the trim order is: cut "on what, and why" (1:14), then
  "each one with its own skills, its own evals" (0:16 block).
