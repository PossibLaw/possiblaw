# Privacy Filter — Threat Model

Sprint 4. Reversible entity-substitution interceptor that sits between PossibLaw agents and cloud LLMs.

**Key distinction:** This is NOT a one-way scrubber (Presidio, HuggingFace anonymizers). Those discard the original. The Privacy Filter's substitution is reversible — the key store maps every `«ENT_*»` token back to the original entity, and the decoder reconstitutes the final deliverable.

---

## Architecture

```
┌──────────┐                                    ┌──────────┐
│  agent   │ ──[raw text]──▶ [ENCODER]──▶[masked text]  │  cloud   │
│(PossibLaw)│                ▲                    ─────▶│   LLM    │
│          │                  │ key_store              │(Anthropic)│
│          │ ◀─[rehydrated]── [DECODER]◀──[masked reply]─│          │
└──────────┘                  ▲                          └──────────┘
                              │
                    layer/privacy-filter/keys/<matter-id>.json
                    (per-matter, persisted, reversible)
```

The encoder and decoder are the **same Ollama model** (default: `llama3.1:8b`) invoked with two different system prompts. When Ollama is unavailable, a deterministic rule-based encoder/decoder activates automatically (offline-fallback mode).

---

## Operator Profiles

| Profile | Behavior |
|---|---|
| `always` | Every model call is filtered — both local and cloud. |
| `cloud-only` | Default for legal surface. Anthropic/cloud calls are filtered; local-Ollama calls pass through unchanged. |
| `off` | Pass-through. Triggers `privacy-filter-required` escalation if matter is tagged sensitive. |

---

## Token Format

Tokens use the form `«ENT_<TYPE>_<NNN>»` where `<TYPE>` is one of:

- `PERSON` — Individual person names
- `ORG` — Organization names (including Corp, Inc, LLC, Ltd, Holdings, etc.)
- `EIN` — US Employer Identification Numbers (`NN-NNNNNNN`)
- `SSN` — Social Security Numbers (`NNN-NN-NNNN`)
- `ADDRESS` — Street addresses
- `MONEY` — Monetary amounts in deal terms (`$N,NNN.NN`)
- `CODENAME` — Deal codenames
- `ACCOUNT` — Account numbers

---

## Failure Modes

### 1. Detector Miss

**Description:** An entity reaches the cloud model in cleartext — the encoder failed to mask it.

**Detection:** After the rehydrate pass, compare hashes of the detected-entity-set versus the key_store keys. If a cleartext entity slips through, the rehydrate hash will not match the expected set. In the audit log, the `privacy-filter:encode` step records the key store snapshot hash; a post-hoc audit can verify no entity appears in the model response that should have been masked.

**Recovery:** Reject the response and re-encode with a stricter prompt. In LLM mode, retry with `temperature: 0`. In offline mode, tighten the regex patterns.

**Test case:** `adversarial-tests/test-001-detector-miss.json`

---

### 2. Entity Ambiguity

**Description:** A codename collides with a common English word. Example: codename `"Apple"` for a real client named `"Apple Inc."` — the word "apple" in unrelated text would also be replaced.

**Detection:** Post-encode sanity check — verify the masked text is grammatical and the codename is not applied to non-entity occurrences. The encoder must distinguish entity vs. common-noun context.

**Recovery:** Ambiguous matches require a per-matter `alias_hints` declaration. The operator pre-registers known codenames:
```json
{ "aliasHints": { "Apple": "Apple Inc." } }
```
The encoder then applies alias hints with operator precedence before any other masking.

**Test case:** `adversarial-tests/test-002-entity-ambiguity.json`

---

### 3. Rehydration Failure

**Description:** A `«ENT_*»` placeholder leaks into a signed deliverable. This can happen if:
- The token was not in the key store (hallucinated or corrupted token).
- The decoder failed to substitute a token.
- The cloud LLM introduced a new token that was never in the key store.

**Detection:** A pre-delivery scan checks for the `«ENT_` prefix in the final draft before any write operation. If found, a `PrivacyFilterError` is thrown.

**Recovery:** Hard error before write. The deliverable is not produced. The operator must inspect the model response and determine why the token was unresolvable (key store mismatch, hallucinated token, etc.).

**Test cases:** `adversarial-tests/test-003-rehydration-failure.json`, `test-007-unknown-token-passthrough.json`

---

### 4. Key-Store Concurrency

**Description:** Two matters run concurrently and write to the same key store, causing token collisions (e.g., `«ENT_ORG_001»` means `"ACME Corp"` in matter-A but `"Beta LLC"` in matter-B).

**Detection:** Key stores are scoped per matter-id. Each `layer/privacy-filter/keys/<matter-id>.json` is owned exclusively by its matter. There is no shared lookup path between matters.

**Mitigation:** Per-matter isolation is structural — the `loadKeyStore(matterId)` and `saveKeyStore(matterId, ...)` functions only ever read/write `<matter-id>.json`. There is no global key store. Token numbers start from 1 per matter, so `«ENT_ORG_001»` in matter-A is entirely separate from `«ENT_ORG_001»` in matter-B.

**Test case:** `adversarial-tests/test-004-key-store-concurrency.json`

---

### 5. Profile Misconfiguration

**Description:** The `off` profile is accidentally selected for a matter tagged `sensitive`, `privileged`, or `client-confidential`. Cloud calls proceed without masking.

**Detection:** The `privacy-filter-required` guardrail (type: `rule`, kind: `privacy-profile-check`) runs in Phase 4 of the pipeline. It checks the active profile against the matter tag. If the matter tag is in `[sensitive, privileged, client-confidential]` and the profile is `off`, it fires with `human_required: true`.

**Recovery:** Set the profile to `cloud-only` or `always`, or remove the sensitive tag from the matter before the cloud call. The escalation card prints the exact remediation steps from `reason_template`.

**Test case:** `adversarial-tests/test-005-profile-misconfiguration.json`

---

## Offline Fallback

When Ollama is unreachable (daemon not running, model not installed), the Privacy Filter automatically uses a deterministic rule-based encoder:

- `EIN`: `/\b\d{2}-\d{7}\b/`
- `SSN`: `/\b\d{3}-\d{2}-\d{4}\b/`
- `MONEY`: `/\$[\d,]+(?:\.\d{2})?/`
- `EMAIL`: standard email pattern
- `PHONE`: US phone pattern
- `ORG`: organization names ending in Corp, Inc, LLC, Ltd, GmbH, LLP, etc.
- `ADDRESS`: street addresses with numbered prefix

Masked payloads in offline fallback mode are marked `mode: 'offline-fallback'` in the audit log.

The decoder in offline fallback is deterministic find-and-replace only (no LLM cleanup pass).

---

## Key Store Format

Per-matter key stores are stored at:

```
layer/privacy-filter/keys/<matter-id>.json
```

Format:
```json
{
  "«ENT_ORG_001»": "ACME Corp",
  "«ENT_EIN_001»": "12-3456789",
  "«ENT_ADDRESS_001»": "100 Industrial Way, Wilmington DE",
  "«ENT_ORG_002»": "Beta Holdings LLC",
  "«ENT_CODENAME_001»": "Project Quetzal",
  "«ENT_MONEY_001»": "$2,500,000"
}
```

Key stores are append-only during a matter's lifecycle. Tokens are never recycled.

---

## Adversarial Test Set

| ID | Failure Mode | Description |
|---|---|---|
| test-001 | Detector miss | Entity reaches model in cleartext |
| test-002 | Entity ambiguity | Codename collides with common English word |
| test-003 | Rehydration failure | Placeholder leaks into signed deliverable |
| test-004 | Key-store concurrency | Two matters write to same key (structurally prevented) |
| test-005 | Profile misconfiguration | `off` profile on sensitive matter |
| test-006 | Rehydration failure | Token case variant (LLM altered token casing) |
| test-007 | Rehydration failure | Unknown hallucinated token passthrough |
| test-008 | Detector miss | Full offline NDA demo — all entities masked and restored |
