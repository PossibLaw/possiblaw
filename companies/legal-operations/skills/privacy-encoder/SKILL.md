---
name: privacy-encoder
description: Reversibly mask confidential / PII values in matter content before sending it to a cloud-capable model, store the substitution key locally, and decode the cloud-returned output back into the operator's plaintext.
metadata:
  sources:
    - path: docs/privacy-filter.md
      kind: local-file
      usage: adapted
      license: Apache-2.0
      attribution: PossibLaw
---

# Privacy Encoder / Decoder

Use this skill to make cloud LLM calls safe to perform on confidential matter content. The encoder substitutes confidential or PII values with stable opaque placeholders before the cloud call; the decoder restores the plaintext after the cloud call returns. Substitution mappings are written to a per-matter key file on the operator's local filesystem.

This skill is agent-side: it is a runtime instruction set the agent walks through, plus the shell snippets it executes. There is no PossibLaw-specific server, daemon, or runtime — only the operator's local shell, Python 3 (preinstalled on macOS), and a key file under `~/.possiblaw/privacy-keys/`.

---

## When To Invoke

Run the encoder before any cloud-capable adapter call (`anthropic/*`, `codex_local` with cloud Codex backing, or any other adapter whose tier is not strictly local) when EITHER of the following is true:

- The matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged`.
- The operator has explicitly tagged the current task with `privacy-encoder: required` in the task metadata.

If the adapter is strictly local (`ollama/*` on the operator's own machine) AND no operator override is present, the encoder is skipped.

Run the decoder after the cloud call returns, before the agent emits the output to the operator, before any persistence step (`output-local-docx`, `output-local-markdown`, `output-storage-config`), and before any downstream notification (`notify-slack`, `notify-teams`).

If the matter tier is `confidential` or `privileged` and the encoder was skipped for any reason, return `BLOCKED: privacy-encoder-required` and surface the matter id and adapter id.

---

## Placeholder Format

```
[REDACTED:<TYPE>:<NN>]
```

- `<TYPE>` is the detection category (see "Detection Rules" below).
- `<NN>` is a zero-padded, per-matter, monotonically increasing counter, starting at `01`, that is unique per `<TYPE>` within the matter.
- Same plaintext value within a matter MUST map to the same placeholder on every call (stable substitution). Look up the existing mapping in the key store before allocating a new counter.

Examples:

- `ACME Inc.` → `[REDACTED:PARTY:01]`
- `jane@acme.com` → `[REDACTED:EMAIL:01]`
- `123-45-6789` → `[REDACTED:SSN:01]`
- `$2,500,000` → `[REDACTED:MONEY:01]`

---

## Detection Rules

Walk the input text through the following rules in order. Earlier rules take precedence over later rules; once a span is replaced, do not re-scan it.

### Rule 1 — Operator wordlist (highest precedence)

Read `POSSIBLAW_PRIVACY_WORDLIST` (one term per line; lines beginning with `#` are comments; blank lines ignored). If the env var is unset, fall back to `${POSSIBLAW_PRIVACY_WORDLIST_FILE:-$HOME/.possiblaw/wordlist.txt}` when that file exists. For every term, perform a case-insensitive whole-word match and assign type `WORDLIST` unless the operator prefixed the term with `TYPE=` (for example `PARTY=Globex` forces type `PARTY`).

### Rule 2 — Structured identifiers (regex)

| Type      | Pattern                                                                          |
|-----------|----------------------------------------------------------------------------------|
| `EMAIL`   | `[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`                               |
| `PHONE`   | `(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}`                         |
| `SSN`     | `\b\d{3}-\d{2}-\d{4}\b`                                                          |
| `EIN`     | `\b\d{2}-\d{7}\b`                                                                |
| `IBAN`    | `\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b`                                               |
| `CC`      | `\b(?:\d[ \-]?){15,19}\d\b` (then Luhn-validate; reject if it fails)             |
| `ACCOUNT` | `\b(?:Acct|Account)[\s#:]*([A-Z0-9\-]{6,})\b` — capture group is the value       |
| `MONEY`   | `\$\d{1,3}(?:,\d{3})+(?:\.\d{2})?\|\$\d{4,}(?:\.\d{2})?` if amount ≥ `$10,000`  |

`MONEY` threshold defaults to `10000` and is overridable via `POSSIBLAW_PRIVACY_MONEY_FLOOR`.

### Rule 3 — Legal entity names

Match any contiguous run of capitalized tokens (1–6 words) immediately followed by one of these entity suffixes (case-sensitive on the suffix, optional trailing period):

`LLC`, `L.L.C.`, `Inc`, `Inc.`, `Corp`, `Corp.`, `Corporation`, `Ltd`, `Ltd.`, `Limited`, `Co`, `Co.`, `Company`, `GmbH`, `AG`, `B.V.`, `S.A.`, `S.A.S.`, `S.r.l.`, `LP`, `L.P.`, `LLP`, `L.L.P.`, `PLC`, `PLLC`, `PC`, `P.C.`, `N.V.`, `Holdings`, `Partners`

Assign type `PARTY`. The match includes the suffix.

### Rule 4 — Person names (contextual)

Match a capitalized first+last name (`[A-Z][a-z]+(?:\s[A-Z]\.?)?\s[A-Z][a-z]+`) ONLY when at least one of the following anchors appears within 40 characters before the candidate:

- Honorifics: `Mr.`, `Mrs.`, `Ms.`, `Mx.`, `Dr.`, `Prof.`
- Litigation roles: `Plaintiff`, `Defendant`, `Petitioner`, `Respondent`, `Claimant`, `Counsel for`, `Counsel:`, `Attorney for`
- Corporate roles: `CEO`, `CFO`, `COO`, `CTO`, `General Counsel`, `President`, `Chairman`, `Chairwoman`, `Director`, `Manager`, `Founder`
- Signature anchors: `By:`, `Name:`, `Signed:`, `Signature:`

Assign type `PERSON`. Without an anchor, do not flag — Rule 4 deliberately under-reaches to avoid masking unrelated capitalized phrases (city names, product names, defined terms). Rely on the operator wordlist to backstop missed names.

### Rule 5 — Postal addresses

Match `<digits> <street tokens> ,? <city tokens> ,? (<state-2-letter>)? <ZIP>` where `<ZIP>` is `\d{5}(?:-\d{4})?`. Assign type `ADDRESS`. If a non-US address is needed, fall back to operator wordlist.

### Rule 6 — Trade-secret / codename terms

Any term in the wordlist that is prefixed with `CODENAME=` is treated as type `CODENAME`. There is no automated detector for codenames; they MUST come from the operator wordlist.

### Things NOT to mask

Do not mask: defined terms in capitalized quotes (`"Agreement"`, `"Effective Date"`), section headings, jurisdiction names without a person/entity attached, currency amounts below the configured threshold, or generic role words (`Buyer`, `Seller`, `Disclosing Party`) when used as defined-term shorthand.

---

## Key Store

### Location

```
${POSSIBLAW_PRIVACY_KEY_DIR:-$HOME/.possiblaw/privacy-keys}/<matter-id>.json
```

The default location (`~/.possiblaw/privacy-keys/`) sits outside any repo. Do not place the key directory inside a synced cloud folder (iCloud Drive, Dropbox, OneDrive, Google Drive). See operator-setup.md.

### File shape

```json
{
  "matter_id": "61b1446b-b5e9-4f42-bed5-8355d32e1e37",
  "created_at": "2026-05-23T10:14:02-07:00",
  "updated_at": "2026-05-23T10:18:11-07:00",
  "substitutions": [
    { "placeholder": "[REDACTED:PARTY:01]", "plaintext": "ACME Inc.",       "type": "PARTY"   },
    { "placeholder": "[REDACTED:EMAIL:01]", "plaintext": "jane@acme.com",   "type": "EMAIL"   },
    { "placeholder": "[REDACTED:SSN:01]",   "plaintext": "123-45-6789",     "type": "SSN"     }
  ]
}
```

### File permissions

The key file MUST be `0600`. The parent directory MUST be `0700`. Enforce on every write.

### Append-only within a matter

Never recycle a placeholder. Never renumber. Never remove entries. If a substitution is no longer needed, leave it; new substitutions append.

---

## Encode Procedure

The agent runs this whenever it needs to send matter content to a cloud-capable model.

Inputs:

- `MATTER_ID` — UUID of the matter.
- `INPUT_PATH` — path to the matter content to encode (plain text or markdown).
- Optional: `POSSIBLAW_PRIVACY_KEY_DIR`, `POSSIBLAW_PRIVACY_WORDLIST`, `POSSIBLAW_PRIVACY_WORDLIST_FILE`, `POSSIBLAW_PRIVACY_MONEY_FLOOR`.

Steps:

1. Resolve the key directory and ensure it exists with the right perms.

   ```zsh
   key_dir="${POSSIBLAW_PRIVACY_KEY_DIR:-$HOME/.possiblaw/privacy-keys}"
   mkdir -p "$key_dir"
   chmod 700 "$key_dir"
   key_file="$key_dir/$MATTER_ID.json"
   if [ ! -w "$key_dir" ]; then
     printf 'BLOCKED: key store dir not writable: %s\n' "$key_dir" >&2
     exit 1
   fi
   ```

2. Warn (do not block) if the key dir resolves under a synced cloud folder.

   ```zsh
   case "$(cd "$key_dir" 2>/dev/null && pwd -P)" in
     */Library/Mobile\ Documents/*|*/Dropbox/*|*/OneDrive*/*|*/Google\ Drive*/*)
       printf '[PRIVACY_WARNING] key store is on a cloud-synced path: %s\n' "$key_dir" >&2
       ;;
   esac
   ```

3. If the key file does not exist, initialize it.

   ```zsh
   if [ ! -f "$key_file" ]; then
     now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
     python3 -c '
   import json, os, sys
   path, matter_id, now = sys.argv[1], sys.argv[2], sys.argv[3]
   data = {"matter_id": matter_id, "created_at": now, "updated_at": now, "substitutions": []}
   with open(path, "w") as f:
       json.dump(data, f, indent=2)
   os.chmod(path, 0o600)
   ' "$key_file" "$MATTER_ID" "$now"
   fi
   chmod 600 "$key_file"
   ```

4. Run the encoder. Pass the input and key file to a Python helper that applies the detection rules in order, looks up existing mappings for stable substitution, appends new mappings, and prints the masked text to stdout.

   ```zsh
   ENCODED="$(python3 - "$key_file" "$INPUT_PATH" <<'PY'
   import json, os, re, sys
   key_file, input_path = sys.argv[1], sys.argv[2]
   money_floor = int(os.environ.get("POSSIBLAW_PRIVACY_MONEY_FLOOR", "10000"))
   wordlist_env = os.environ.get("POSSIBLAW_PRIVACY_WORDLIST", "")
   wordlist_file = os.environ.get("POSSIBLAW_PRIVACY_WORDLIST_FILE", os.path.expanduser("~/.possiblaw/wordlist.txt"))

   def load_wordlist():
       terms = []
       if wordlist_env:
           terms += [ln for ln in wordlist_env.splitlines()]
       if os.path.isfile(wordlist_file):
           with open(wordlist_file) as f:
               terms += [ln for ln in f.read().splitlines()]
       cleaned = []
       for raw in terms:
           t = raw.strip()
           if not t or t.startswith("#"):
               continue
           if "=" in t:
               typ, val = t.split("=", 1)
               cleaned.append((typ.strip().upper(), val.strip()))
           else:
               cleaned.append(("WORDLIST", t))
       return cleaned

   with open(key_file) as f:
       store = json.load(f)
   subs = store["substitutions"]
   by_plain = { s["plaintext"]: s["placeholder"] for s in subs }
   counters = {}
   for s in subs:
       t = s["type"]
       n = int(s["placeholder"].rsplit(":", 1)[1].rstrip("]"))
       counters[t] = max(counters.get(t, 0), n)

   def luhn_ok(num):
       digits = [int(c) for c in num if c.isdigit()]
       if len(digits) < 13: return False
       s = 0
       for i, d in enumerate(reversed(digits)):
           if i % 2 == 1:
               d *= 2
               if d > 9: d -= 9
           s += d
       return s % 10 == 0

   def allocate(plaintext, typ):
       if plaintext in by_plain:
           return by_plain[plaintext]
       counters[typ] = counters.get(typ, 0) + 1
       ph = f"[REDACTED:{typ}:{counters[typ]:02d}]"
       subs.append({"placeholder": ph, "plaintext": plaintext, "type": typ})
       by_plain[plaintext] = ph
       return ph

   with open(input_path) as f:
       text = f.read()

   def replace_span(text, start, end, replacement):
       return text[:start] + replacement + text[end:]

   # Rule 1: wordlist (whole-word, case-insensitive)
   for typ, term in load_wordlist():
       pat = re.compile(r"\b" + re.escape(term) + r"\b", re.IGNORECASE)
       text = pat.sub(lambda m: allocate(m.group(0), typ), text)

   # Rule 2: structured identifiers
   patterns = [
       ("EMAIL",   re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")),
       ("SSN",     re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
       ("EIN",     re.compile(r"\b\d{2}-\d{7}\b")),
       ("IBAN",    re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b")),
       ("PHONE",   re.compile(r"(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}")),
   ]
   for typ, pat in patterns:
       text = pat.sub(lambda m: allocate(m.group(0), typ), text)

   # CC: regex + Luhn
   cc_pat = re.compile(r"\b(?:\d[ \-]?){15,19}\d\b")
   def cc_sub(m):
       raw = m.group(0)
       if luhn_ok(raw):
           return allocate(raw, "CC")
       return raw
   text = cc_pat.sub(cc_sub, text)

   # ACCOUNT
   acct_pat = re.compile(r"\b(?:Acct|Account)[\s#:]*([A-Z0-9\-]{6,})\b")
   def acct_sub(m):
       return m.group(0).replace(m.group(1), allocate(m.group(1), "ACCOUNT"))
   text = acct_pat.sub(acct_sub, text)

   # MONEY (threshold)
   money_pat = re.compile(r"\$\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\$\d{4,}(?:\.\d{2})?")
   def money_sub(m):
       raw = m.group(0)
       num = int(re.sub(r"[^\d]", "", raw.split(".")[0]))
       if num >= money_floor:
           return allocate(raw, "MONEY")
       return raw
   text = money_pat.sub(money_sub, text)

   # Rule 3: legal entity names
   ent_suffix = r"(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company|GmbH|AG|B\.V\.|S\.A\.|S\.A\.S\.|S\.r\.l\.|LP|L\.P\.|LLP|L\.L\.P\.|PLC|PLLC|PC|P\.C\.|N\.V\.|Holdings|Partners)"
   ent_pat = re.compile(r"\b(?:[A-Z][\w&'\-]*\s){0,5}[A-Z][\w&'\-]*\s" + ent_suffix + r"\b")
   text = ent_pat.sub(lambda m: allocate(m.group(0), "PARTY"), text)

   # Rule 4: person names with anchors (look 40 chars back)
   person_pat = re.compile(r"([A-Z][a-z]+(?:\s[A-Z]\.?)?\s[A-Z][a-z]+)")
   anchors = re.compile(r"(?:Mr\.|Mrs\.|Ms\.|Mx\.|Dr\.|Prof\.|Plaintiff|Defendant|Petitioner|Respondent|Claimant|Counsel for|Counsel:|Attorney for|CEO|CFO|COO|CTO|General Counsel|President|Chairman|Chairwoman|Director|Manager|Founder|By:|Name:|Signed:|Signature:)")
   out = []
   cursor = 0
   for m in person_pat.finditer(text):
       window = text[max(0, m.start()-40):m.start()]
       if anchors.search(window):
           out.append(text[cursor:m.start()])
           out.append(allocate(m.group(0), "PERSON"))
           cursor = m.end()
   out.append(text[cursor:])
   text = "".join(out)

   # Rule 5: postal addresses (US heuristic)
   addr_pat = re.compile(r"\b\d{1,6}\s+(?:[A-Z][\w\.]*\s){1,5}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Way|Court|Ct\.?|Plaza|Plz\.?|Parkway|Pkwy\.?),?\s+[A-Z][a-zA-Z\.\s]+,?\s+(?:[A-Z]{2}\s+)?\d{5}(?:-\d{4})?\b")
   text = addr_pat.sub(lambda m: allocate(m.group(0), "ADDRESS"), text)

   from datetime import datetime, timezone
   store["substitutions"] = subs
   store["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
   with open(key_file, "w") as f:
       json.dump(store, f, indent=2)
   os.chmod(key_file, 0o600)
   sys.stdout.write(text)
   PY
   )"
   printf '%s' "$ENCODED"
   ```

5. Send `$ENCODED` (not the original `$INPUT_PATH`) to the cloud-capable adapter.

6. Audit the encode: record `matter_id`, key file path, count of new substitutions added in this pass, and a SHA-256 of the encoded payload. Never log the plaintext or the key file contents.

### Mid-flight amendments

If the operator amends matter content after an earlier encode pass, re-run the encode procedure on the new or changed text. Because the key store is append-only and lookups are by plaintext, previously substituted values keep their placeholders and new values are appended. Do not regenerate placeholders for unchanged values.

---

## Decode Procedure

The agent runs this after the cloud model returns and before the output is shown to the operator or persisted.

Inputs:

- `MATTER_ID`
- `MODEL_OUTPUT_PATH` — file containing the model's raw response.

Steps:

1. Resolve the key file. If it is missing, return `BLOCKED: privacy-decode-key-missing matter=$MATTER_ID path=$key_file` and stop — do not emit text containing `[REDACTED:...]` placeholders to the operator.

   ```zsh
   key_dir="${POSSIBLAW_PRIVACY_KEY_DIR:-$HOME/.possiblaw/privacy-keys}"
   key_file="$key_dir/$MATTER_ID.json"
   if [ ! -f "$key_file" ]; then
     printf 'BLOCKED: privacy-decode-key-missing matter=%s path=%s\n' "$MATTER_ID" "$key_file" >&2
     exit 1
   fi
   ```

2. Replace every known placeholder with its plaintext, and flag any `[REDACTED:...]` tokens that do not appear in the key store.

   ```zsh
   DECODED="$(python3 - "$key_file" "$MODEL_OUTPUT_PATH" <<'PY'
   import json, re, sys
   key_file, output_path = sys.argv[1], sys.argv[2]
   with open(key_file) as f:
       store = json.load(f)
   table = { s["placeholder"]: s["plaintext"] for s in store["substitutions"] }
   with open(output_path) as f:
       text = f.read()
   placeholder_pat = re.compile(r"\[REDACTED:[A-Z]+:\d{2,}\]")
   unknown = []
   def sub(m):
       ph = m.group(0)
       if ph in table:
           return table[ph]
       unknown.append(ph)
       return ph
   decoded = placeholder_pat.sub(sub, text)
   if unknown:
       warn = "\n\n[PRIVACY_WARNING] cloud output contained placeholders not in key store: " + ", ".join(sorted(set(unknown))) + "\n"
       decoded = decoded + warn
   sys.stdout.write(decoded)
   PY
   )"
   printf '%s' "$DECODED"
   ```

3. Audit the decode: record `matter_id`, count of placeholders resolved, and list of unresolved placeholders (the placeholder strings only — they contain no plaintext).

---

## Failure Modes The Agent Must Handle

1. **Key store directory not writable.** During encode, if `$key_dir` cannot be created or is not writable, return `BLOCKED: key-store-dir-not-writable` with the resolved path and stop. Never fall back to a temp directory — that would leave key material outside the operator's intended location.

2. **Cloud output contains a placeholder not in the key store.** Do NOT silently strip or invent a plaintext. Leave the placeholder in the decoded text and append a `[PRIVACY_WARNING]` block listing the unknown placeholders (see decode step 2). The agent surfaces this to the operator and asks whether the model hallucinated the token or whether the key file is stale.

3. **Operator amends the matter mid-flight with new confidential terms.** Re-run encode on the delta (or the full updated input — the append-only key store handles both). Never reuse a stale substitution table snapshot from before the amendment; always read the key file fresh at the start of each encode pass.

4. **Key file missing at decode time.** Return `BLOCKED: privacy-decode-key-missing`. Do not emit a "best-effort" decode that contains raw placeholders to the operator.

5. **Placeholder collision attempt (model echoes a placeholder format inside a real value).** If a value in the input text already matches the `[REDACTED:TYPE:NN]` regex (extremely unlikely in real legal text but possible in adversarial input), allocate it under type `LITERAL` so its placeholder is distinguishable, and document the occurrence in the audit log.

6. **Cross-matter leakage.** The key file path is scoped by `<matter-id>`. Never use matter A's key file to decode matter B's output. If `$MATTER_ID` is unset or empty, return `BLOCKED: matter-id-required`.

---

## Security Note

- Key files are operator-owned plaintext and MUST NOT be committed to any repo. The default location (`~/.possiblaw/privacy-keys/`) is outside any project repo, but operators sometimes override `POSSIBLAW_PRIVACY_KEY_DIR`. Add `~/.possiblaw/privacy-keys/` (or the operator's override path) to global `.gitignore` (`git config --global core.excludesfile`) or keep it outside any tracked tree.
- Never log or echo the contents of a key file. Audit entries include placeholder strings only, never plaintext.
- Enforce `chmod 700` on the directory and `chmod 600` on each key file on every write — do not assume previous calls set perms correctly.
- Do not place the key directory inside iCloud Drive, Dropbox, OneDrive, or Google Drive — those services replicate plaintext mappings to remote storage and undo the point of local-only encoding. The encode step warns when the resolved path matches a known cloud-sync pattern.

---

## Evals

### Happy path

**Given** matter `m-001` with `metadata.possiblaw.privacyTier: confidential`, input text `Counterparty is ACME Inc. and the principal contact is jane@acme.com (SSN 123-45-6789).`, and an empty key store
**When** the agent runs the encode procedure, sends the encoded text to an `anthropic/*` adapter, and runs the decode procedure on the model's response (which echoes the placeholders back as `Confirmed [REDACTED:PARTY:01], [REDACTED:EMAIL:01], [REDACTED:SSN:01].`)
**Then** the encoded payload contains no `ACME Inc.`, `jane@acme.com`, or `123-45-6789`; `~/.possiblaw/privacy-keys/m-001.json` exists with 3 substitution entries and `0600` perms; the decoded output reads `Confirmed ACME Inc., jane@acme.com, 123-45-6789.`; no `[PRIVACY_WARNING]` is appended.

### Edge case — operator wordlist supplements detection

**Given** matter `m-002` with `metadata.possiblaw.privacyTier: confidential`, `POSSIBLAW_PRIVACY_WORDLIST` set to a string containing `PARTY=Globex\nProject Quetzal`, and input text `Globex is acquiring Project Quetzal from the seller.`
**When** the agent runs the encode procedure
**Then** `Globex` is replaced with `[REDACTED:PARTY:01]` (forced type via `PARTY=` prefix) and `Project Quetzal` is replaced with `[REDACTED:WORDLIST:01]`, even though neither matches a structured rule.

### Failure / security — hallucinated placeholder in cloud output

**Given** matter `m-003` whose key store contains only `[REDACTED:PARTY:01] → ACME Inc.`, and a cloud model response containing both `[REDACTED:PARTY:01]` and `[REDACTED:PARTY:99]`
**When** the agent runs the decode procedure
**Then** `[REDACTED:PARTY:01]` is replaced with `ACME Inc.`, `[REDACTED:PARTY:99]` is LEFT IN PLACE in the decoded text, and a `[PRIVACY_WARNING]` block is appended listing `[REDACTED:PARTY:99]` as an unknown placeholder. The agent surfaces the warning to the operator and does not silently strip or fabricate a value.
