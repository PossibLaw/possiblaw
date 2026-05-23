# Privacy Encoder — Adversarial Tests

Eight Given/When/Then test cases the agent must pass before this skill is considered ready for a confidential matter. These are scenario specs, not unit tests — run them by walking the encode/decode procedures in `SKILL.md` against each input and inspecting the resulting key file and decoded text.

---

## Test 1 — Missed entity (no entity suffix), wordlist backstop

**Given** input text `Globex will indemnify the buyer.` and an operator wordlist containing the single line `PARTY=Globex`
**When** the agent runs the encode procedure
**Then** `Globex` is replaced with `[REDACTED:PARTY:01]`; the structured rules alone would have missed it (no `Inc.`/`LLC`/`Corp.` suffix and no anchor), and the wordlist rule (Rule 1, highest precedence) catches it. A new substitution entry is appended to the matter key file.

If the wordlist is empty, `Globex` is expected to slip through — this is the documented limitation that motivates the operator wordlist. The agent must NOT invent an entity rule for `Globex` on its own.

---

## Test 2 — Ambiguous replacement: "Apple"

**Given** input text `The defendant Apple Inc. claims its apple-juice product line is unrelated. CEO Tim Cook signed the declaration.` and an empty wordlist
**When** the agent runs the encode procedure
**Then** the entity rule (Rule 3) matches `Apple Inc.` → `[REDACTED:PARTY:01]` because of the `Inc.` suffix. The token `apple-juice` is NOT replaced because Rule 3 requires an entity suffix and Rule 1 (wordlist) is empty. `Tim Cook` is replaced with `[REDACTED:PERSON:01]` because the `CEO` anchor appears within 40 chars before the name (Rule 4).

If the operator instead provides wordlist `Apple` (no `PARTY=` prefix), Rule 1 will replace every case-insensitive whole-word `apple` — including `apple-juice` — with `[REDACTED:WORDLIST:01]`. This is documented as an over-flagging risk in `SKILL.md` and is why wordlist terms should be specific (e.g., `Apple Inc.`) or typed (e.g., `PARTY=Apple Inc.`).

**Documented threshold:** Rule 3 fires only on an explicit entity suffix; Rule 4 fires only with a contextual anchor within 40 characters. Bare capitalized common nouns are intentionally not flagged.

---

## Test 3 — Key store on synced cloud folder (warn during encode)

**Given** `POSSIBLAW_PRIVACY_KEY_DIR` is set to `$HOME/Library/Mobile Documents/com~apple~CloudDocs/possiblaw-keys` (iCloud-synced)
**When** the agent runs the encode procedure on any input
**Then** the encode shell snippet prints `[PRIVACY_WARNING] key store is on a cloud-synced path: ...` to stderr before writing the key file. The encode still proceeds (cloud-sync is a strong operator preference signal, not a hard block), and the audit log records that the warning fired. The agent surfaces the warning to the operator on the next turn so the operator can move the key store off the synced folder.

The same warning fires for paths under `Dropbox/`, `OneDrive*/`, or `Google Drive*/`.

---

## Test 4 — Rehydration failure: key file missing at decode

**Given** matter `m-deleted` whose key file `~/.possiblaw/privacy-keys/m-deleted.json` was deleted (or moved, or the operator switched machines without copying it), and a model output containing `[REDACTED:PARTY:01]`
**When** the agent runs the decode procedure
**Then** the decode shell snippet exits non-zero with `BLOCKED: privacy-decode-key-missing matter=m-deleted path=~/.possiblaw/privacy-keys/m-deleted.json` on stderr. The agent does NOT emit the model output containing raw `[REDACTED:...]` placeholders to the operator, does NOT persist the output, and does NOT call any notification skill. The agent surfaces the BLOCKED reason and tells the operator the matter must be re-encoded from source if the key file is unrecoverable.

---

## Test 5 — Hallucinated placeholder in cloud output

**Given** matter `m-005` whose key store has exactly one entry `[REDACTED:PARTY:01] → "ACME Inc."`, and a cloud model response that reads `Confirmed [REDACTED:PARTY:01] and [REDACTED:PARTY:99] are aligned on [REDACTED:DATE:01].`
**When** the agent runs the decode procedure
**Then** `[REDACTED:PARTY:01]` is replaced with `ACME Inc.`; `[REDACTED:PARTY:99]` and `[REDACTED:DATE:01]` are LEFT IN PLACE; a `[PRIVACY_WARNING]` block is appended to the decoded text reading `cloud output contained placeholders not in key store: [REDACTED:DATE:01], [REDACTED:PARTY:99]`. The agent surfaces the warning to the operator and asks whether the model hallucinated or whether the key file is stale. The agent does NOT invent plaintext for the unknown placeholders.

---

## Test 6 — Stable substitution across multiple calls

**Given** matter `m-006` and two sequential encode calls within the same matter:
  - Call 1 input: `ACME Inc. and Beta LLC are negotiating.`
  - Call 2 input: `ACME Inc. agreed to the term sheet from Beta LLC.`
**When** the agent runs the encode procedure on both inputs in order
**Then** after Call 1 the key file contains `[REDACTED:PARTY:01] → ACME Inc.` and `[REDACTED:PARTY:02] → Beta LLC`. After Call 2 the key file is UNCHANGED in count — `ACME Inc.` resolves to `[REDACTED:PARTY:01]` again (not `:03`) and `Beta LLC` resolves to `[REDACTED:PARTY:02]` again. The stable-substitution invariant: same plaintext within a matter → same placeholder, forever.

---

## Test 7 — Regex / bracket injection in a confidential value

**Given** matter `m-007` and an input containing a codename with regex-meaningful characters: `The deal is internally called Project [Quetzal+]. CEO Jane Doe signed.` with wordlist `CODENAME=Project [Quetzal+]`
**When** the agent runs the encode procedure
**Then** Rule 1 escapes the wordlist term before compiling it into a regex (using `re.escape`), so the term matches literally — not as the regex `[Quetzal+]` (which would otherwise mean a character class with a quantifier). The substitution entry stored in the key file is `{"placeholder": "[REDACTED:CODENAME:01]", "plaintext": "Project [Quetzal+]", "type": "CODENAME"}`.

On decode, the placeholder pattern `\[REDACTED:[A-Z]+:\d{2,}\]` matches only the literal placeholder tokens. The stored plaintext `Project [Quetzal+]` is substituted in as a literal string (no re-interpretation), so brackets in the plaintext do not cause a double-replacement or a placeholder-format collision. If the decoded plaintext itself contains a `[REDACTED:TYPE:NN]`-shaped substring, the decoder still treats it as plaintext (the regex pass is a single sweep over the model output, not iterative).

---

## Test 8 — Cross-matter leakage prevention

**Given** matter A `m-A` with key file containing `[REDACTED:PARTY:01] → ACME Inc.`, and matter B `m-B` with key file containing `[REDACTED:PARTY:01] → Beta LLC`, and a model output from matter B containing `[REDACTED:PARTY:01]`
**When** the agent runs the decode procedure with `MATTER_ID=m-B`
**Then** the decoder loads `$key_dir/m-B.json` (NOT `m-A.json`) and `[REDACTED:PARTY:01]` resolves to `Beta LLC`. If the agent were to mistakenly invoke decode with `MATTER_ID=m-A` on matter B's output, `[REDACTED:PARTY:01]` would resolve to `ACME Inc.` — which is exactly the cross-matter leak we're preventing. Matter scoping is therefore enforced by:

1. The key file path always being `<matter-id>.json` (no shared lookup path).
2. The agent passing the correct `MATTER_ID` for the current matter on every encode/decode call.
3. The encoder restarting counters at `01` per type per matter, so `[REDACTED:PARTY:01]` is structurally a per-matter identifier with no global meaning.

If `MATTER_ID` is unset, empty, or does not match the matter currently being processed, the agent must return `BLOCKED: matter-id-required` (encode) or `BLOCKED: privacy-decode-key-missing` (decode) rather than silently fall back to a default key file.
