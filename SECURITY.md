# Security Policy

PossibLaw is a **proof-of-concept**. Security fixes are best-effort. There are no SLAs or support contracts.

---

## Supported versions

| Version | Status |
|---|---|
| 0.1.x | Best-effort security fixes |
| 0.0.x | No longer supported — upgrade to 0.1.x |

---

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

1. **Preferred:** Open a [GitHub Security Advisory](https://github.com/PossibLaw/possiblaw/security/advisories/new) in this repository. GitHub will keep it private until a fix is published.
2. **Email fallback:** `[security@possiblaw.example]` — replace this placeholder with your actual security contact before going live.

Please include:
- A description of the vulnerability and its potential impact.
- Steps to reproduce (or a minimal proof of concept).
- The version of PossibLaw you tested against.
- Whether you believe there is active exploitation.

We will acknowledge within 7 business days and aim for a fix within 30 days for confirmed vulnerabilities, depending on severity and PoC complexity.

---

## Scope

### In scope

- **Secret leakage** — env vars, `layer/privacy-filter/keys/*.json` key stores, or API credentials appearing in logs, audit trails, or CLI output.
- **Unauthorized cloud calls** — Privacy Filter bypass that causes raw entity data to reach the Anthropic API without masking when `--privacy-profile cloud-only` is set.
- **Privilege bypass** — running a workflow as a lower-privilege template that should only be available to a higher-privilege template.
- **Audit log tampering** — JSONL records under `layer/audit/` being writable or deletable without detection.
- **Launcher injection** — shell-injection or argument-injection vulnerabilities in the `bin/possiblaw` launcher or its Python helpers.

### Out of scope (PoC realities)

- **Denial of service** — the PoC has no rate limiting or resource isolation.
- **Social engineering** — phishing, pretexting, and similar attacks on users are out of scope.
- **Supply-chain attacks via third-party SDKs** — vulnerabilities in `stripe`, `docusign-esign`, `@hubspot/api-client`, `@linear/sdk`, `@notionhq/client`, `node-quickbooks`, or `@anthropic-ai/sdk` should be reported to those maintainers directly.
- **Missing hardening best practices** — the PoC intentionally omits production hardening (TLS termination, secret managers, WAF, etc.).

---

## Known threats

The following threats are documented in the codebase and are known PoC limitations, not bugs:

1. **Privacy Filter offline fallback** — when Ollama is unreachable, the filter falls back to a rule-based regex encoder. The regex encoder does not catch all entity types (e.g., codenames, internal project references). Sensitive matter data may reach the cloud partially unmasked.

2. **Cloud call without filter** — if `--privacy-profile off` is passed on a matter tagged `sensitive`, `privileged`, or `client-confidential`, the `privacy-filter-required` guardrail escalates but does **not** block the call in the current PoC implementation. A human must review the escalation card and not proceed.

3. **Key store plain-text persistence** — `layer/privacy-filter/keys/<matter-id>.json` stores substitution keys in plain text on disk. Anyone with filesystem access can reverse the masking for any matter.

4. **Audit log JSONL writability** — `layer/audit/*.jsonl` files are append-only by convention, not by filesystem enforcement. An attacker with local access can edit or delete audit entries.

5. **Connector credentials in environment** — all 14 connector credentials are read from environment variables at runtime. There is no secret-manager integration. Credentials in `.env` files or shell history are not protected by PossibLaw.

6. **UNCONFIRMED connector schemas** — the Westlaw and LexisNexis connector skills use placeholder base URLs and request shapes (documented as UNCONFIRMED in `companies/legal-operations/skills/connector-westlaw/SKILL.md` and `connector-lexis/SKILL.md`). Agents following them will fail against the real vendor APIs until the endpoints are verified.

7. **No token expiry on key stores** — Privacy Filter key stores do not expire. Keys for completed matters accumulate indefinitely under `layer/privacy-filter/keys/`.
