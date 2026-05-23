# Privacy Encoder — Operator Setup

A one-page setup guide for operators running matters through cloud-capable models. Follow these steps once per workstation, then mark sensitive matters with the right tier and the agent will invoke the encoder automatically.

---

## 1. Attach the skill to an agent

Add `privacy-encoder` to the agent's `skills:` list in the company's `AGENTS.md` (or the equivalent agent definition file in the company package):

```yaml
- name: nda-drafter
  role: specialist
  skills:
    - privacy-encoder
    - legal-nda-playbook
    - missing-info-gate
    - output-local-markdown
```

Attach it to every agent that may call a cloud-capable adapter on confidential matters — at minimum your drafting, review, and dispatcher specialists.

---

## 2. Mark a matter as confidential

Set the privacy tier in the matter's metadata so the agent knows to invoke the encoder:

```yaml
matter:
  id: 61b1446b-b5e9-4f42-bed5-8355d32e1e37
  name: ACME / Beta NDA
  metadata:
    possiblaw:
      privacyTier: confidential
```

Tiers and what they trigger:

| Tier           | Cloud calls allowed? | Encoder invoked? |
|----------------|----------------------|------------------|
| `public`       | yes                  | no               |
| `internal`     | yes                  | no               |
| `confidential` | yes                  | YES              |
| `privileged`   | yes                  | YES              |

Default if the field is missing: treat as `internal`. If you are unsure, mark the matter `confidential` — over-encoding is safe, under-encoding is not.

---

## 3. Provide a custom wordlist (optional, recommended)

The encoder's structured rules catch emails, SSNs, EINs, IBANs, account numbers, money over `$10,000`, legal entity names with suffixes (`LLC`, `Inc.`, `Corp.`, `GmbH`, …), postal addresses, and person names that appear next to honorifics or titles. Anything else — codenames, internal product names, party names without an entity suffix (`Globex`, `Pied Piper`) — needs the operator wordlist.

Two ways to supply it.

### a) Environment variable (one-shot)

```zsh
export POSSIBLAW_PRIVACY_WORDLIST="$(cat <<'EOF'
# Operator wordlist — one term per line
# Prefix with TYPE= to force a category, e.g. PARTY=Globex
PARTY=Globex
PARTY=Pied Piper
CODENAME=Project Quetzal
ACME Industries
EOF
)"
```

### b) Persistent file (recommended)

```zsh
mkdir -p "$HOME/.possiblaw"
chmod 700 "$HOME/.possiblaw"
$EDITOR "$HOME/.possiblaw/wordlist.txt"
```

Override the path with `POSSIBLAW_PRIVACY_WORDLIST_FILE` if you keep your wordlist elsewhere. Lines starting with `#` are comments; blank lines are ignored. Bare terms are typed `WORDLIST`; typed terms (`PARTY=Globex`, `CODENAME=Quetzal`) are placed in the named category.

Other knobs:

- `POSSIBLAW_PRIVACY_MONEY_FLOOR` — minimum dollar amount before `MONEY` masking fires. Default `10000`.
- `POSSIBLAW_PRIVACY_KEY_DIR` — key store directory. Default `$HOME/.possiblaw/privacy-keys`.

---

## 4. Verify the key store has correct perms

After your first encoded matter, verify the key directory and files are not world-readable:

```zsh
stat -f '%Sp %N' "$HOME/.possiblaw/privacy-keys"
stat -f '%Sp %N' "$HOME/.possiblaw/privacy-keys"/*.json 2>/dev/null
```

Expected output:

```
drwx------ /Users/you/.possiblaw/privacy-keys
-rw------- /Users/you/.possiblaw/privacy-keys/<matter-id>.json
```

If perms are wrong, fix them:

```zsh
chmod 700 "$HOME/.possiblaw/privacy-keys"
chmod 600 "$HOME/.possiblaw/privacy-keys"/*.json
```

Also make sure the directory is not inside a synced cloud folder. The encoder warns on iCloud Drive, Dropbox, OneDrive, and Google Drive paths during every encode, but moving the directory off cloud sync is the real fix.

Recommended global gitignore entry (one time, all repos):

```zsh
git config --global core.excludesfile "$HOME/.gitignore_global"
printf '%s\n' '.possiblaw/privacy-keys/' '~/.possiblaw/privacy-keys/' >> "$HOME/.gitignore_global"
```

The default key directory is `$HOME/.possiblaw/privacy-keys/`, which sits outside any project repo — but if you override `POSSIBLAW_PRIVACY_KEY_DIR` to a path inside a repo, the gitignore line above will not save you. Don't do that.

---

## 5. Recover from a corrupted or lost key file

Without the key file you cannot decode the cloud model's output for that matter. There is no backup, no second copy on the cloud side (that's the point), and no way to reconstruct the placeholder → plaintext mapping from the placeholders alone.

If the key file is lost or corrupted:

1. Treat any cloud output for the affected matter that has not yet been decoded as unusable. Discard it.
2. Re-encode the matter from the original source content, which will create a fresh key file with fresh `[REDACTED:TYPE:NN]` numbering. Counter values will likely differ from the lost file — they were per-matter monotonic, not deterministic by content.
3. Re-run the cloud call against the new encoded payload.
4. Decode with the new key file.

To avoid this situation: back up `$HOME/.possiblaw/privacy-keys/` to a local encrypted volume (FileVault-protected disk, encrypted Time Machine, encrypted external drive). Do not back it up to an unencrypted cloud target — that re-exposes the plaintext you just spent effort to mask.

---

## 6. Privacy tier reference

| Tier           | Meaning                                                                         | Encoder | Examples                                                                 |
|----------------|---------------------------------------------------------------------------------|---------|--------------------------------------------------------------------------|
| `public`       | Content is already public or non-sensitive.                                     | no      | Marketing copy, public-record docket excerpts, published case citations. |
| `internal`     | Operator-internal, not for outside disclosure but not sensitive PII.            | no      | Internal memos with no third-party PII, drafting templates, checklists.  |
| `confidential` | Contains party PII, financial figures, account data, or third-party confidence. | YES     | NDAs, term sheets, due-diligence reports, client correspondence.         |
| `privileged`   | Attorney-client privileged or work product.                                     | YES     | Litigation strategy memos, settlement positions, privileged advice.      |

When in doubt, tier up. The encoder is fast, local, and idempotent — running it on a matter that did not strictly need it costs you a few milliseconds and one small JSON file.
