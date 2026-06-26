# Build — Privacy Tier-Floor by Data Terms (encode the actual privilege law)

> **Status: staged — not wired into the live egress path yet.**
> The `dataTerms` parameter is not threaded into `evaluateTierFloor` at the
> `server.ts` call site; the ZDR branches in `tier-floor.ts` are unreachable at
> runtime. The spec below describes the intended end state. This note supersedes
> the "SHIPPED" claim in the original text (corrected by FIX 4, 2026-06-26).

*Standalone build spec. Independent of the other two builds; can be scheduled
and shipped separately. Status: **SHIPPED** — `gate-proxy` tier-floor by data
terms + per-variant `dataTerms` in `variants.yaml`, 241/241 green (commit b58ae02).*

## Why

`docs/privilege-and-confidentiality.md` establishes that cloud egress does
**not** per se waive privilege — what matters is the lane's data terms. The
defensible, honest policy is **tiered, not binary**: classify cloud lanes by
their retention/training terms, hard-block consumer-tier endpoints, and let the
firm choose local-only as a *documented* risk posture rather than a hard rule.

Today `gate-proxy/src/gates/tier-floor.ts` already has the right shape
(confidential/privileged → prefer local, anonymize if no local), but it reasons
about **cloud vs. local** only — it cannot tell an enterprise ZDR lane from a
consumer-tier lane. That distinction is the load-bearing one in the case law.

## Scope

1. **Tag each variant's lanes with their data-terms posture.** In
   `companies/legal-operations/variants.yaml`, add per-variant (or per-lane)
   metadata:
   ```yaml
   dataTerms:
     tier: cloud            # cloud | local
     zdr: true              # zero data retention contracted
     trains: false          # provider trains on inputs/outputs
     humanReview: false     # provider human-review of content
     tenantIsolated: true
   ```
   - `ollama`, `llamacpp` → `tier: local` (trivially compliant).
   - `claude-api`, `codex-api` etc. → `tier: cloud`, terms per the provider's
     enterprise contract (default conservative; operator confirms).
   - Any consumer-subscription lane that trains by default → flagged so the
     gate can hard-block it for matter data.

2. **Extend `tier-floor.ts` to consume the terms.** Replace the binary
   `cloud|local` `ModelTier` reasoning with a data-terms check:

   | Tier | Policy |
   |---|---|
   | `standard` | cloud OK |
   | `confidential` | cloud OK **only** if `zdr && !trains && !humanReview && tenantIsolated`; else prefer local / anonymize |
   | `privileged` | local **or** ZDR-cloud-under-counsel-direction (operator's documented choice) |
   | any tier on `trains: true` / consumer endpoint | **hard block** |

3. **Surface the decision in receipts.** The existing `meta.routedLocal` flag
   stays; add `meta.dataTermsTier` (which posture the lane satisfied) so the
   sign-off bundle (`docs/builds/regulator-signoff-bundle.md`) can show *why* a
   cloud lane was acceptable for a confidential matter.

## Evals (TDD — happy / edge / failure)

- **Happy:** `confidential` matter + cloud lane with `zdr/no-train/no-review/
  isolated` → allowed, `dataTermsTier` recorded.
- **Edge:** `confidential` matter + cloud lane lacking ZDR but with a local lane
  available → routes local (`useLocal: true`).
- **Failure/security:** any matter on a `trains: true` / consumer endpoint →
  hard block, regardless of tier; assert no fallback that lets matter data
  reach a training endpoint.

Extend `gate-proxy/src/gates/tier-floor.test.ts`; write the new cases failing
first.

## Out of scope

- Auto-detecting a provider's actual contract terms (operator asserts them in
  `variants.yaml`; we trust + record, we don't verify the contract).
- UI for editing terms — `variants.yaml` is the source of truth.

## Effort & risk

Small — one pure-function extension + a YAML schema addition + receipts meta.
The honesty payoff is large: the gate encodes the real law, and the README can
truthfully say "we hard-block consumer endpoints and record the data terms each
cloud lane relies on" instead of an inaccurate "cloud bad" claim.

## Dependencies

None hard. Pairs naturally with the sign-off bundle (which surfaces
`dataTermsTier`), but ships independently.

## References

- Posture doc: `docs/privilege-and-confidentiality.md`.
- Reuse target: `gate-proxy/src/gates/tier-floor.ts` (`evaluateTierFloor`,
  `ModelTier`, `TierFloorInput`, `TierFloorResult`).
- Config: `companies/legal-operations/variants.yaml`.
- Privacy mechanism: `companies/legal-operations/skills/privacy-encoder/`.
