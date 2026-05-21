# Sprint 4 Demo — Privacy Filter

This walkthrough exercises the Privacy Filter end-to-end:

1. **Default profile (offline):** rule-based encoder + deterministic decoder + audit-log entries showing `«ENT_*»` tokens in model traffic.
2. **With Ollama (live):** encoder via Llama 3.1 8B + Anthropic call sees only masked text + decoder rehydrates + final NDA has real entities.
3. **Failure case:** profile `off` with `--matter-tag sensitive` → `privacy-filter-required` guardrail fires.

---

## Setup

```bash
cd possiblaw
pnpm install
pnpm build
```

---

## Demo 1 — Offline mode: rule-based encoder + deterministic decoder

The Privacy Filter activates even without Ollama. When Ollama is unreachable, a deterministic rule-based encoder masks known entity patterns (ORG, EIN, SSN, ADDRESS, MONEY, EMAIL, PHONE, CODENAME).

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel \
  "draft an NDA for ACME Corp (EIN 12-3456789) at 100 Industrial Way, Wilmington DE; counterparty Beta Holdings LLC; codename Project Quetzal; value \$2,500,000" \
  --privacy-profile cloud-only
```

**What you should see:**

1. The disclaimer banner and `[offline mode]` notice.
2. Router chain: chief-counsel → commercial-lead → nda-drafter (offline fixtures).
3. **Privacy Filter encode step logged** in the audit log:
   - `step: privacy-filter:encode`
   - `mode: offline-fallback`
   - Key store populated with 6 entries: `«ENT_ORG_001»` → `ACME Corp`, `«ENT_EIN_001»` → `12-3456789`, etc.
4. The NDA drafter runs against the **masked prompt** (the cloud LLM, if live, would see only tokens).
5. **Privacy Filter decode step:** tokens rehydrated deterministically.
6. Final deliverable contains real entity values: `ACME Corp`, `12-3456789`, `Beta Holdings LLC`, `$2,500,000`.
7. Groundedness test passes (stub).
8. Signed-document guardrail HITS → escalation card.

**Inspect the key store after the run:**

```bash
# The matter ID is printed in the audit_log_path line of the report.
# Example:
node dist/cli/index.js privacy show <matter-id>
```

Expected output:
```
Privacy Filter — Key Store for matter: <matter-id>
Entity count: 6

Entities by type:
  ORG: 2
  EIN: 1
  ADDRESS: 1
  CODENAME: 1
  MONEY: 1

Token → Original:
  «ENT_ORG_001»  →  ACME Corp
  «ENT_EIN_001»  →  12-3456789
  «ENT_ADDRESS_001»  →  100 Industrial Way, Wilmington DE
  «ENT_ORG_002»  →  Beta Holdings LLC
  «ENT_CODENAME_001»  →  Project Quetzal
  «ENT_MONEY_001»  →  $2,500,000
```

---

## Demo 2 — Live mode: Ollama encoder + Anthropic call sees only masked text

This demo requires:
- Ollama running locally: `ollama serve`
- Llama 3.1 8B installed: `ollama pull llama3.1:8b`
- Anthropic API key set: `export ANTHROPIC_API_KEY=sk-ant-...`

```bash
node dist/cli/index.js run quick-counsel \
  "draft an NDA for ACME Corp (EIN 12-3456789) at 100 Industrial Way, Wilmington DE; counterparty Beta Holdings LLC; codename Project Quetzal; value \$2,500,000" \
  --privacy-profile cloud-only \
  --verbose
```

**What you should see (with --verbose):**

1. `[privacy-filter] Encoded prompt (mode=llm). Key store has N entries.`
2. The user prompt sent to the NDA-drafter specialist contains **only** `«ENT_*»` tokens — no real entity names, EINs, or addresses.
3. The Anthropic response (raw) contains `«ENT_*»` tokens in the NDA body.
4. `[privacy-filter] Decoded response. Output length=N.`
5. The final deliverable printed to the terminal contains the **real entity values** — `ACME Corp`, `12-3456789`, `Beta Holdings LLC`, `$2,500,000`.

**What the cloud LLM never sees:**
- `ACME Corp` — replaced with `«ENT_ORG_001»`
- `12-3456789` — replaced with `«ENT_EIN_001»`
- `100 Industrial Way, Wilmington DE` — replaced with `«ENT_ADDRESS_001»`
- `Beta Holdings LLC` — replaced with `«ENT_ORG_002»`
- `Project Quetzal` — replaced with `«ENT_CODENAME_001»`
- `$2,500,000` — replaced with `«ENT_MONEY_001»`

**Audit log entries:**
```jsonl
{"ts":"...","step":"privacy-filter:encode","prompt":"[privacy-filter mode=llm] masked_text_length=287","output":"[\"«ENT_ORG_001»\",\"«ENT_EIN_001»\",...]"}
{"ts":"...","step":"privacy-filter:decode","output":"[privacy-filter] rehydration complete"}
```

---

## Demo 3 — Failure case: profile `off` with sensitive matter tag

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel \
  "anything sensitive" \
  --privacy-profile off \
  --matter-tag sensitive
```

**What you should see:**

1. Router chain runs normally.
2. Specialist produces output.
3. Groundedness test passes (stub).
4. **`privacy-filter-required` guardrail HITS** (before `signed-document`):
   ```
   ⚠ guardrail:privacy-filter-required — HIT (escalating)
   ```
5. **Escalation card** prints:
   ```
   Guardrail triggered:
     privacy-filter-required

   Reason:
     This matter is tagged sensitive, but the active Privacy Filter profile is "off".
     Either set profile to "cloud-only" or "always", or change the matter's tag.
   ```
6. Exit code: 0 (escalation is a success state).

---

## What this demo proves

| Capability | Where it shows up |
|---|---|
| **Reversible substitution** | Key store at `layer/privacy-filter/keys/<matter-id>.json`; tokens rehydrated after cloud call. |
| **Offline fallback** | Rule-based encoder activates when Ollama is unreachable; `mode: offline-fallback` in audit. |
| **LLM encoder (Ollama)** | Llama 3.1 8B handles structural context the regex cannot (deal codenames, ambiguous ORG names). |
| **Profile: cloud-only** | Default profile; Anthropic call sees only masked text; local calls pass through. |
| **Profile: off + sensitive tag** | `privacy-filter-required` guardrail escalates before the document is delivered. |
| **Pre-delivery scan** | Any `«ENT_` prefix in the final draft throws `PrivacyFilterError` — placeholder cannot leak. |
| **Per-matter key store** | Each run gets an isolated `<matter-id>.json`; no cross-matter token bleed. |
| **`possiblaw privacy show`** | Read-only dump of entity counts and token→original mappings. |

---

## Related documentation

- `docs/privacy-filter.md` — Threat model, failure modes, adversarial test set
- `layer/guardrails/risk-gates/privacy-filter-required.yaml` — Guardrail definition
- `layer/privacy-filter/adversarial-tests/` — 8 adversarial test cases
- `layer/privacy-filter/keys/` — Per-matter key stores (created at runtime)
