# Bailey — by PossibLaw

**Build your own firm: run the business side of a legal practice with AI agents — and, when you're ready, the practice itself. Every action gated, receipted, and verifiable. Built on the [paperclip](https://github.com/paperclipai/paperclip) control plane.**

> **Why "Bailey"?** A bailey is the walled courtyard of a castle — where the work happens: inside the walls, behind the gate. Bailey is the project name; [PossibLaw](https://www.PossibLaw.com) is the brand behind it. Landing page and 90-second demo: [bailey.PossibLaw.com](https://bailey.PossibLaw.com). The CLI and package keep their `possiblaw` names.

> **Regulated-work note:** The practice of law is regulated. To the extent an operator is practicing law with PossibLaw, the operator needs to involve a lawyer. PossibLaw is open-source tooling, not a legal-services provider.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![PoC](https://img.shields.io/badge/status-proof--of--concept-orange.svg)](#whats-not-in-this-poc)
[![Node](https://img.shields.io/badge/node-24.18.0-brightgreen.svg)](https://nodejs.org)
[![paperclip layer](https://img.shields.io/badge/paperclip-layer%2C%20not%20a%20fork-lightgrey.svg)](FOUNDATION.md)

Agents do the legal and business work autonomously. The product is the path that work travels: egress writes cross hard-gated trust boundaries, every gate decision lands in a tamper-evident receipt chain, and humans decide at the boundaries that matter — not on every step. PossibLaw ships this as a *layer* on the paperclip control plane (wired as a pinned git submodule, never modified), not a fork. Run it as a law firm, or as an in-house legal team that handles first-pass work with its own agents and escalates to outside counsel only for the judgment it doesn't own.

## Two ways to run it

**The operator layer (start here).** The business side of a practice — intake and delegation, conflicts screening, engagement letters, billing and trust-accounting prep, spend reports, BD proposals, deliverable filing — run by an agent org chart with a chief of staff, six business-function teams, and a receipt for every action. It runs *next to* your practice-management system, not instead of it: if you're on Clio, MyCase, or similar, keep it — this layer takes the 10pm operations work off the lawyer's plate. The focused firm imports with one flag and works credential-free out of the box:

```bash
./bin/possiblaw --teams flagship   # 63 agents / 90 skills: business teams + two practice lanes
```

**The whole firm (the practice layer).** The same org chart carries practice teams. Two are flagship-deep today: **commercial contracts** (NDA/MSA review with clause-level evals, engagement-to-delivery with receipts) and **litigation integrity** — *verification, not drafting*: citations checked character-by-character with court egress blocked until verification is registered, filing deadlines computed by a deterministic FRCP engine that reports a BLOCKER rather than guessing, and a conflicts party-screen that fails closed to human review. Whatever drafts your motions — an associate, or a drafting tool — this layer is what makes the output defensible. The other 25 practice teams are the extensible skeleton: import what your firm practices (`--teams`), train the rest into your own.

How the trust features map to a lawyer's professional-responsibility duties — competence, confidentiality, conflicts, candor, supervision — is written up for firm evaluation committees in [docs/for-law-firms-model-rules.md](docs/for-law-firms-model-rules.md). The demo walkthrough of the operator layer is [docs/demos/operator-day-demo.md](docs/demos/operator-day-demo.md).

## The thesis: atomic units of work

A chat window that drafts a whole contract in one shot gives you one big, opaque output to trust or distrust. PossibLaw is built the other way: **work is decomposed into the smallest reviewable units — one agent, one skill, one gate decision, one receipt — because small units are where control and quality come from.**

- **More control.** You approve at the boundary that matters (a court filing, a signature, a payment), not on every keystroke and not on one monolithic "submit." Each atomic action is independently classified, gated, and logged — so you can allow the routine and stop the consequential.
- **Better work — an empirical claim we test rather than assert.** A focused agent doing one bounded task (NDA redline, citation check, diligence summary) is easier to make correct, easier to eval, and easier to swap than a generalist doing everything. Whether decomposition also yields measurably better end deliverables is under active measurement: our first pre-registered A/B against Harvey LAB came back honest — not supported at the tier tested, with a higher ceiling but equal median for orchestration ([the full findings, owned plainly](docs/builds/orchestration-ab-findings.md)). The 180 agents / 178 skills are atomic on purpose: composable parts, each with its own evals, each replaceable without touching the rest. One of those agents is a non-working service principal used only by the firm facade.
- **Provenance per unit.** Because the unit is small, its provenance is legible: this output, citing these authorities, approved by this human, recorded in this receipt. That is exactly the slice a regulator or insurer asks to see.

The catalog is the supporting cast. The atomic pipeline — decompose, gate, receipt — is the product.

## Where this sits in the market

Practice management (Clio, MyCase) owns the system of record; drafting platforms (Harvey, CoCounsel, and the specialist tools) own work-product generation. PossibLaw deliberately competes with neither — it is the **operations and verification layer that runs next to them**. Within legal AI's larger sorting, the layers are: a data layer (law as an API/MCP with provenance), a guardrails layer (the sign-off, audit trail, and hallucination control a regulator needs once AI did the work), and a **practice layer** — whoever runs the AI backend: a law firm, or an in-house legal team acting as its own AI-native practice, doing first-pass work with its own agents and escalating to outside counsel only for the judgment it doesn't own. **PossibLaw is the open-source guardrails + practice layer** — the audit trail, human gates, anonymization, and receipts wrapped around an atomic agent catalog — and the first slice of the **data layer** is now shipped: a trust-adapter that fronts CourtListener's official MCP (`mcp.courtlistener.com`) and **registers every retrieved authority with the gate**, so the gate can flag any authority an agent cites in an outbound filing that was never retrieved — an anti-hallucination check, not just a metadata wrapper ([`mcp-servers/legal-data/`](mcp-servers/legal-data/)). The guardrails layer is productized end-to-end — every gate decision is hash-chained and exportable as a regulator-readable [Matter Trust Report](#whats-enforced-vs-routed-vs-advisory). It competes on being *legible and open* where the rest of the market is opaque and closed. Build specs: [`docs/builds/`](docs/builds/).

## The trust pipeline

Pipeline spine: boundary classify → policy → anonymize → human gate → citation gate → deadline audit → receipt → Matter Trust Report.

What a firm actually gets:

- **Gate-enforced egress on the configured transport.** Every supported egress write — email send, document upload, e-signature, payment, court filing, external delete — routes through a Gate Proxy (`gate-proxy/`, loopback by default). The launcher removes egress credentials from Paperclip's server/adapter environment and gives them to the proxy process. Policy is the firm's to tune, per trust boundary, in [`companies/legal-operations/gate-policy.yaml`](companies/legal-operations/gate-policy.yaml): `allow` is pass-through + receipt; `anonymize` / `human` / `block` are hard gates. In `--production`, every protected request authenticates the caller's own Paperclip agent key, enforces the company, and authorizes the immutable agent ID against an exact default-deny capability map; only exact `GET /health` and `GET /ready` remain public. The shipped baseline grants email send to `correspondence-clerk`, trusted-root upload to `deliverables-courier`, citation/authority registration to `legal-citation-checker`, and deadline receipts to `deadline-calculator`. Drive/OneDrive roots are server-resolved aliases; callers cannot supply vendor folder/drive IDs. Ordinary third-party egress is human-gated, and unassigned capabilities stay denied. **Production status:** authorization is implemented and credential-free tested, but live multi-agent/provider validation and worker isolation remain release gates. Same-UID local execution can still read process/filesystem secrets or bypass the proxy; use the hardened reference topology and its sacrificial isolation eval before claiming multi-lawyer readiness.
- **Human gates are paperclip-native.** Six boundaries are classified (`THIRD_PARTY_EGRESS`, `CONFIDENTIAL_TO_CLOUD`, `COURT_FILING`, `SIGNATURE`, `MONEY_MOVEMENT`, `IRREVERSIBLE_EXTERNAL_OP`); court filings, signatures, payments, and irreversible external ops default to `human`. The gate opens an approval, the agent stands down, a human decides in the dashboard, and the agent is woken on approve. Approvals are payload-hash-bound — an approval for payload X never authorizes payload Y.
- **Receipts for everything.** Every gate decision — reserved, performed, pending, blocked, error — appends with fsync to a company-bound SHA-256 hash chain guarded by a single-writer lease. A durable reservation precedes dispatch, and a stable operation ID prevents an identical action from being silently replayed after response loss. `GET /receipts/verify` checks the chain; `POST /receipts/anchor` writes the chain head into a Paperclip comment. Payloads never appear in receipts — only their sha256. Strong tamper resistance still requires an anchor stored outside the same host/user trust domain.
- **The agents are the interchangeable parts.** 179 working agents plus one service-only facade recorder / 178 skills across 34 teams operate inside the pipeline, with eleven model variants that swap providers per lane without touching the package. The catalog is the supporting cast; the pipeline is the product.
- **Firm-facing MCP facade (Phase 3 — v1).** An outside assistant (Claude Desktop, Codex, or any MCP client) can connect to the firm over stdio as a client. The facade exposes the firm AS an MCP server behind a fixed five-noun allowlist: `create_matter`, `get_matter_status`, `list_work_products`, `fetch_work_product`, `request_approval`. Human-only approvals — the facade has no approve tool, and the company-scoped agent key 403s on board-decide endpoints on authenticated instances. Work-product text is default-closed and opt-in (`firmFacade.allowWorkProductText` in `gate-policy.yaml`). Every facade action is receipted through the gate proxy so it appears in the same hash-chained audit spine as internal egress. Start with `./bin/possiblaw --firm-facade`: the launcher mints a key only for the wake-disabled `firm-facade-recorder` service identity (never a chief or working specialist) and writes a ready-to-paste MCP config to `<data-dir>/firm-facade-mcp.json` (mode 600). Implementation: [`mcp-servers/firm-facade/`](mcp-servers/firm-facade/). Walkthrough: [docs/operator-walkthrough.md](docs/operator-walkthrough.md). Honest limits: [docs/known-limitations.md](docs/known-limitations.md) → "Firm-facing MCP facade (v1)".
- **Execution trace spine + matter access (M1–M4, C0–C3).** Receipts record *what left the building*; the trace spine records *how the decision was reached* — which model ran, when, what context and connectors were pulled, at what cost. Traces are the content-bearing half of a deliberate split: receipts stay hash-only and shareable, traces stay per-matter and inside the perimeter, and content capture is **default OFF** with every malformed config value closing the store entirely (`trace-store/`, `trace:` in `gate-policy.yaml`). Receipts bind to traces by `traceId` + `traceSha256`, and the chain head can be anchored to an RFC 3161 timestamp authority with a published verification spec and a zero-dependency standalone verifier ([docs/receipt-verification.md](docs/receipt-verification.md)). On top of that spine, **C3** adds a firm-authored user→matter roster ([`companies/legal-operations/matter-access.json`](companies/legal-operations/matter-access.json)): at approval resume the gate reads the human who actually approved and requires them to hold decision authority for that boundary **and** entitlement to every matter involved — filed and contributing. Two authorities, orthogonal and composed with AND: **decision authority does not imply matter entitlement**, so an owner may approve a wire on a matter they cannot read, and a screened partner stays screened. Enforcement is **opt-in** (`enforcement: "on"`); the roster ships deny-all, and switching it on before the roster is populated would refuse every human-gated egress. Honest limits: this is enforcement **at the outlet, not the source** — Paperclip has no per-matter read primitive, so an agent can still read a screened matter; C3 stops content reaching an unentitled human and makes the attempt visible. **A real conflicts screen still needs a wall** (`--add-wall`). Runbook: [docs/workflows/matter-access.md](docs/workflows/matter-access.md).
- **Deterministic deadline engine (Phase 4 — v1).** Court-filing deadlines are computed by code (FRCP Rule 6, `deadline-engine/`), never by an LLM. The `deadline-calculator` agent routes all deadline questions through the `legal-deadline-calculation` skill, which invokes the engine CLI and reports the exact date with a full rule-application trace. Every computed deadline is audited in the Matter Trust Report via a `deadline` receipt kind. Prerequisite: `pnpm -C deadline-engine install`. Honest limits: US-FED only (`jurisdiction: "US-FED"`); state/CPR courts return `UNCONFIRMED`; audit-only in v1 — the deadline is visible and recorded in the report but does not yet block a late filing. Agent + skill: `companies/legal-operations/`. Engine: [`deadline-engine/`](deadline-engine/). Walkthrough: [docs/operator-walkthrough.md](docs/operator-walkthrough.md) → "Compute a filing deadline." Honest limits: [docs/known-limitations.md](docs/known-limitations.md) → "Deadline engine (v1)".

## What's enforced vs routed vs advisory

| Surface | Status today | Mechanism |
|---|---|---|
| Egress writes (email, upload, signature, payment, court filing, external delete) | **Enforced on the configured gate transport; host isolation not yet production-approved** | Gate Proxy receives the egress credentials; the launcher overrides/scrubs them from the server/adapter env; per-boundary policy + durable reservation + hash-chained receipts on every path. Same-UID agents remain a documented bypass risk until the isolated-worker deployment/eval lands. |
| Privacy tier — confidential/privileged payloads sent through the gate | **Enforced at the gate** | Deterministic masker over caller-supplied matter entities + pattern classes, recall measured in the test suite (100% on its labeled fixture; gated at ≥95% with zero entity leaks; fail-closed to block when it cannot vouch, e.g. no entity list) — or routed to a local model when one is configured ([docs/privilege-and-confidentiality.md](docs/privilege-and-confidentiality.md)). Since 0.36.0 the tier itself is trustworthy: a matter registered via `POST /matters/classification` carries a **raise-only floor** (the gate applies `max(floor, per-request claim)` — an agent cannot downgrade a registered matter), and unlabeled secondary-model traffic defaults to `confidential` fail-closed. A `dataTerms`-aware tier-floor (ZDR / no-train / no-human-review / tenant-isolated classification, with a hard-block on training/consumer endpoints) exists in code but the live call site never passes `dataTerms` — **staged, not wired at runtime**: [docs/known-limitations.md](docs/known-limitations.md) → "dataTerms tier-floor is staged, not enforced at runtime" |
| Privacy tier — agents' own primary-lane model calls | **Routed, not proxied** | A routing choice: local-model variants per lane (`ollama`, `llamacpp` in `variants.yaml`) plus the advisory `privacy-encoder` skill. Primary-lane calls do not pass the proxy. |
| Citation verification | **Enforced at the gate (Phase 2)** | Court/third-party egress **carrying legal citations** is **blocked** until a registered, payload-bound, deterministically re-checked citation verification exists for the document being filed or sent. The `legal-citation-checker` agent executes `citation-verification-checklist` (character-by-character quote-fidelity, side-by-side discrepancy tables), then POSTs the result to `POST /quality/citation`; the gate detects citations in the outbound document and calls `CitationRegistry.has(docSha256)` before any dispatch — including the human gate. A document with no detectable citations has nothing to re-check and passes. Fail-closed: a gated payload with no reviewable document text at all is blocked. Caveat: citation verification itself is an agent step — the gate enforces that it was performed and passed, not that the cited authority is authoritative. |
| Matter access — who may receive a matter's content | **Enforced at approval resume, opt-in per firm** | A firm-authored roster ([`matter-access.json`](companies/legal-operations/matter-access.json)) names people by email and matters by `issues.identifier`, resolved to control-plane ids at startup and refused outright if either is ambiguous. At resume of a human-gated egress the gate reads `approvals.decidedByUserId` — the one principal an injected agent cannot forge, since Paperclip authenticated it — and requires decision authority for the boundary **plus** entitlement to every matter involved, including contributing matters (the contamination case). Effective access is the roster folded with receipted, time-bounded overrides where a **later revoke wins**, including over the roster. Overrides require separation of duties. Fail-closed on an unverifiable chain. **Opt-in:** `enforcement: "off"` by default, because the roster ships deny-all and enforcing it unpopulated would refuse every human-gated egress. Limits: outlet-not-source; a real conflicts screen still needs `--add-wall`. |
| Regulator sign-off bundle | **Exported on demand** | `GET /receipts/bundle?issueId=…[&format=md]` projects the hash-chained receipts for one matter into a **Matter Trust Report** (JSON or Markdown): ordered gate decisions, anonymization events, citation verifications, and an operator attestation block — payload **hashes only, never plaintext**. (No `dataTerms` tier-floor decision is emitted — that gate isn't reachable at runtime yet; see [docs/known-limitations.md](docs/known-limitations.md).) Fail-closed: a corrupt receipt chain refuses to emit a clean report (`503 receipts_corrupt`). This is the artifact an insurer / SRA / GC asks to see. |
| Legal data with provenance | **Proxied via MCP; provenance flagged at the gate (block is opt-in)** | [`mcp-servers/legal-data/`](mcp-servers/legal-data/) is a thin trust-adapter in front of CourtListener's **official** MCP (`mcp.courtlistener.com`, OAuth): it forwards each tool call and wraps the result in a provenance envelope (`source`, `source_url`, `decided_date`, `citation`, `sha256`). The `sha256` is the **same fingerprint the citation gate checks**. On a successful retrieval the adapter **registers the authority with the gate** (`POST /quality/authority`, best-effort); the gate then **flags any authority cited in an outbound filing that was never retrieved** (anti-hallucination), recording `unbackedCitations` on the egress receipt. Default is **flag/record, not block** — blocking is policy-opt-in via `citationGate.requireAuthorityProvenance`. Confidential-matter queries are sanitized before egress. We consume the data layer rather than reinvent it. |

## Confidentiality, privilege, and cloud models

PossibLaw helps a firm take the **reasonable steps** that Rule 1.6 and ABA Formal Opinion 512 (2024) require when AI touches client matter content:

- **Reversible local masking (`privacy-encoder` skill).** Confidential/PII values are substituted with stable opaque placeholders *before* any cloud-capable model call, the substitution key stays on the operator's local disk, and the output is decoded back to plaintext after the call — so confidential matter text need never reach a cloud model in cleartext.
- **Local-model tier-floor.** Matters tagged `metadata.possiblaw.privacyTier: confidential|privileged` route the sensitive step through a local model lane (`ollama` / `llamacpp`); the launcher warns at startup if no local lane is reachable.
- **Documented data terms, not marketing claims.** We frame this honestly. Sending matter data to a cloud model under genuine enterprise zero-retention / no-train terms **does not, by itself, waive attorney-client privilege** — and conversely, local-only is a confidentiality and risk-reduction choice, *not* a privilege guarantee. PossibLaw is engineered for "reasonable steps to protect confidentiality and privilege," never "privilege-safe." The full legal posture, the confidentiality-vs-privilege distinction, the 2026 case law, and the do/don't marketing language live in [docs/privilege-and-confidentiality.md](docs/privilege-and-confidentiality.md).

Sharp edges are documented, not hidden — see [docs/known-limitations.md](docs/known-limitations.md): `local_trusted` dev instances accept unauthenticated local board calls; the authenticated production-safety launcher now fails closed on gate/custody/identity errors, but same-UID agent isolation is still a release blocker; the receipt chain assumes a single writer, and same-user tampering is caught only against an externally anchored head; `share_external` writes (HubSpot, Linear, Clio, iManage, NetDocuments) are visibly refused in v1 rather than silently credentialed; Slack/Teams notification webhooks (operator-configured, no matter content) remain direct in v1. Which connector takes which path: [docs/connectors-inventory.md](docs/connectors-inventory.md).

## Validate the checkout

PossibLaw-owned packages are pinned to Node `24.18.0` (`.nvmrc`) and CI uses pnpm `9.15.4`. After installing the submodule and package dependencies, run the complete credential-free battery from any working directory:

```bash
/absolute/path/to/possiblaw/bin/verify
```

The command runs all owned package tests/typechecks, launcher and helper safety tests, package rendering, manifest checks, variants, and eval coverage. It explicitly reports authenticated two-lawyer, live launcher, and provider round-trip checks as `SKIP`; those are operator-gated and are never reported as passing without receipts. CI runs the same entrypoint in [`.github/workflows/verify.yml`](.github/workflows/verify.yml).

## Deployment and setup

Choose the path that matches the operator and the data involved:

| Path | Intended use | Security posture |
|---|---|---|
| **Local launcher** | One operator evaluating or developing PossibLaw on their own workstation | Loopback-only `local_trusted`; not a shared or remote production deployment |
| **Docker Compose** | The reference deployment for one firm or one in-house legal department | Authenticated control plane, distinct non-root workers, scoped networks/credentials, persistent volumes; live isolation and the release gates below are still required |
| **Azure tenant** | A firm or legal department deploying the Docker reference inside its own Azure tenant | Can add Entra/RBAC, private networking, Bastion, Key Vault, encrypted disks, monitoring, and immutable backups; those controls must be configured and attested |
| **Hostinger VPS** | A small firm or legal department operating the Docker reference on a dedicated VPS | Self-managed VPS controls plus the PossibLaw Compose topology; Hostinger's Paperclip one-click template installs upstream Paperclip, not PossibLaw |

Never publish Paperclip's port `3100` directly to the internet. The reference Compose file binds it to host loopback. Use a firm VPN or SSH tunnel for bootstrap, then a reviewed TLS reverse proxy/private ingress for users.

> **Step-by-step from a clean machine:** [docs/getting-to-a-working-instance.md](docs/getting-to-a-working-instance.md) — prerequisites, launch, matter-access setup, and the same three host paths, as commands to type. The sections below cover architecture and security posture; that document covers sequence.

### Local: clone → launch → see the receipt

Use this path for a single operator on a trusted workstation. Install Git, Python 3, `curl`, Node `24.18.0`, and pnpm `9.15.4`, then verify the versions:

```bash
node --version   # v24.18.0
pnpm --version   # 9.15.4
python3 --version
```

**Step 1 — clone and launch (2 min)**

```bash
git clone https://github.com/PossibLaw/bailey
cd bailey
git submodule update --init --recursive
pnpm -C paperclip install --frozen-lockfile
./bin/possiblaw
# answer three prompts (org name, mission, variant)
# → browser opens to your paperclip dashboard, agents loaded, gate proxy running
```

Add `--variant <slug>` to skip the interactive prompt, `--list-variants` to see the options, `--dry-run` to preview without writing.

**Step 2 — trigger a gated court filing and verify the receipt (3 min)**

```bash
# simulate an agent attempting a court filing:
curl -s -X POST http://127.0.0.1:3801/egress/file_court_document \
  -H 'content-type: application/json' \
  -d '{"payload":{"caption":"Acme v. Globex","court":"D. Del.","documentText":"The parties request a scheduling conference."},"meta":{"confidentiality":"standard"}}'
# → 202 pending_approval + an approval in the paperclip dashboard. Approve it
#   there, then re-run the same curl with "approvalId":"<id>" added to meta
#   → 200, action package written to ~/.possiblaw/action-packages/ for a
#   human to execute (no court API is called in v1).

curl -s http://127.0.0.1:3801/receipts/verify
# → {"ok":true,"length":N,"head":"..."} — the tamper-evident trail
```

Stop with `Ctrl-C`. Re-running the launcher reattaches to a healthy server on the selected port instead of starting a duplicate. Use `--port <port>` and `--gate-port <port>` for alternate loopback ports; use a different `--data-dir` for a separate disposable instance.

Full walkthrough: [docs/operator-walkthrough.md](docs/operator-walkthrough.md); package layout: [docs/paperclip-package.md](docs/paperclip-package.md); sharp edges: [docs/known-limitations.md](docs/known-limitations.md).

### Docker Compose: authenticated single-tenant reference

Use a dedicated, patched Linux host with Docker Engine and Compose v2. The bundled stack is intentionally fail-closed: its placeholder model gateways return `503` until the operator replaces them with reviewed, authenticated gateways.

1. Clone the complete repository and verify the container runtime:

   ```bash
   git clone https://github.com/PossibLaw/bailey
   cd bailey
   git submodule update --init --recursive
   docker version
   docker compose version
   ```

2. Create ignored deployment configuration and owner-only bootstrap material:

   ```bash
   cd deployments/firm-single-tenant
   cp .env.example .env
   ./scripts/init-secrets.sh
   ```

   Do not put board, model-provider, Drive, or OneDrive tokens in `.env`. The script creates private file-backed bootstrap secrets and deliberately leaves Gate keys unusable until identity provisioning succeeds.

3. Run the credential-free topology and staging checks:

   ```bash
   python3 -m venv /tmp/possiblaw-deploy-venv
   . /tmp/possiblaw-deploy-venv/bin/activate
   python -m pip install -r requirements-test.txt
   ./tests/run.sh
   deactivate
   ```

4. Start only PostgreSQL and authenticated Paperclip:

   ```bash
   docker compose up -d db paperclip
   docker compose ps
   ```

5. Open `http://127.0.0.1:3100` on the host, complete the board-claim/login flow, and keep the board token in an owner-only file or the operator shell—never in an argument, tracked file, or chat transcript.

6. Complete the [bootstrap sequence](deployments/firm-single-tenant/README.md#bootstrap-sequence): preview and import the PossibLaw company, persist immutable principal bindings, put the resulting non-secret company/agent IDs in `.env`, provision the two workers, then start the Gate and its relays.

7. Run the sacrificial isolation eval before enabling agent heartbeats:

   ```bash
   ./scripts/run-isolation-eval.sh
   ```

   Every boolean must be `true`; every string must be a lowercase 64-character SHA-256 value. A missing or false result is a deployment failure.

8. Confirm restart persistence without deleting named volumes:

   ```bash
   docker compose restart
   docker compose ps
   ```

   `docker compose down` preserves named volumes; `docker compose down --volumes` deletes deployment data and is intentionally not part of this setup guide.

The full topology, exact provisioning commands, threat boundaries, workspace staging rules, and release gates are in [`deployments/firm-single-tenant/README.md`](deployments/firm-single-tenant/README.md).

### Azure: deploy inside the firm's tenant

Azure is an infrastructure host for the same Docker Compose reference; PossibLaw does not yet ship an ARM/Bicep template or a **Deploy to Azure** button.

1. Have the firm's Azure administrator create a dedicated resource group, VNet/subnet, and Ubuntu 24.04 LTS VM in the firm's tenant. Use Trusted Launch with Secure Boot and vTPM, a system-assigned managed identity, encrypted OS/data disks, and organization-approved RBAC.
2. Give the VM no public IP. Apply an NSG that denies unsolicited inbound traffic and use Azure Bastion, the firm's VPN, or another approved private access path. Restrict outbound provider traffic with the firm's firewall or authenticated egress proxy; an NSG alone is not a domain-aware egress control.
3. Configure Key Vault for operator/provider secrets and a Recovery Services vault for VM backups. The current Compose reference consumes file-backed secrets, so any Key Vault-to-host retrieval procedure must write only owner-readable files on encrypted storage and must not place values in `.env`, cloud-init output, or process arguments.
4. Connect to the private VM through the approved administrative path. If that path provides SSH, add a local forward while bootstrapping:

   ```bash
   ssh -L 3100:127.0.0.1:3100 <approved-azure-vm-ssh-target>
   ```

5. Install Docker Engine with Compose v2 from Docker's [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/), then follow the Docker Compose steps above on the VM.
6. Keep Paperclip private. For staff access, place a reviewed TLS reverse proxy/private ingress in front of loopback Paperclip and integrate it with the firm's identity, Conditional Access, logging, and incident-response standards.
7. Run the isolation eval on the exact VM, enable backup immutability only after a restore test, and record the image digests, firewall policy, backup receipt, and deployment results.

Azure can supply the infrastructure controls the design requires, but tenancy alone is not an attestation. The deployment is not production-approved until the PossibLaw release gates and the firm's legal, security, privacy, retention, and provider reviews pass. Official references checked **2026-07-20**: [Azure VM Zero Trust](https://learn.microsoft.com/en-us/security/zero-trust/azure-infrastructure-virtual-machines), [Azure Bastion](https://learn.microsoft.com/en-us/azure/bastion/bastion-overview), [Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/general/overview), [VM Backup](https://learn.microsoft.com/en-us/azure/backup/backup-azure-vms-introduction), and [immutable backup vaults](https://learn.microsoft.com/en-us/azure/backup/backup-azure-immutable-vault-concept).

### Hostinger: deploy the custom stack on a VPS

Hostinger's [Paperclip application](https://www.hostinger.com/applications/paperclip) is a convenient one-click deployment of upstream Paperclip. It does **not** include PossibLaw's company package, Gate Proxy, capability map, isolated workers, receipt custody, or pinned layer. Do not select it when the intended result is a PossibLaw deployment.

1. Create a dedicated Hostinger VPS using its Ubuntu 24.04 Docker template. Choose capacity for the control plane, PostgreSQL, Gate, two workers, model gateways, builds, backups, and expected concurrency; do not select a size from this README without measuring the firm's workload.
2. In hPanel, restrict the VPS firewall to the firm's approved administrative sources and required TLS ingress. Do not open port `3100` publicly.
3. Connect with SSH and verify Compose v2:

   ```bash
   ssh <admin-user>@<vps-ip>
   docker version
   docker compose version
   ```

4. Clone the full repository on the VPS and follow the Docker Compose steps above. The current build uses repository-relative Docker contexts and private generated files, so pasting only `compose.yaml` into Docker Manager is not a complete PossibLaw install.
5. From the operator workstation, create an SSH tunnel for the board claim and bootstrap:

   ```bash
   ssh -L 3100:127.0.0.1:3100 <admin-user>@<vps-ip>
   ```

   Then open `http://127.0.0.1:3100` locally.

6. Configure a reviewed TLS reverse proxy/private access layer, encrypted off-host backups, monitoring, patching, and explicit provider egress restrictions. Hostinger infrastructure features do not replace the Compose isolation eval or the application release gates.
7. Run `./scripts/run-isolation-eval.sh`, test a restart, and perform a restore drill before using real matter data.

Hostinger Docker Manager supports custom Compose projects and a **Deploy on Hostinger** button, but PossibLaw does not yet publish the self-contained images, bootstrap automation, or Compose artifact that a truthful one-click button requires. One-click deployment remains future work. Official Hostinger references checked **2026-07-20**: [Docker VPS template](https://www.hostinger.com/support/8306612-how-to-use-the-docker-vps-template-at-hostinger/), [Docker Manager](https://www.hostinger.com/support/12040789-hostinger-docker-manager-for-vps-simplify-your-container-deployments/), [custom Compose deployment](https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/), and [Paperclip application guide](https://www.hostinger.com/support/how-to-get-started-with-the-paperclip-at-hostinger/).

### Release gates for any shared or hosted deployment

Do not use real client data or call a shared/hosted deployment production-ready until all applicable gates are recorded:

- The exact target host passes `docker compose config`, image builds, health checks, saved SSH-environment probes, and `run-isolation-eval.sh`.
- The blocked placeholder AI gateways are replaced with reviewed, authenticated, scoped gateways; provider egress is restricted outside Compose.
- TLS/private ingress, secret management, image digest pinning/scanning, SBOMs, monitoring, patching, incident response, backups, and a successful restore drill are in place.
- The authenticated two-lawyer/ethical-wall test passes on the target deployment.
- Drive or OneDrive upload, exact-version readback, approval, and delivery pass with disposable targets.
- Receipt heads are anchored outside the deployment's host/admin trust domain; retention and legal-hold requirements are configured.
- The pinned Paperclip failed-request secret-logging risk and invite-page query-shape defect are fixed, isolated, or explicitly accepted by the operator.

The canonical status is [docs/known-limitations.md](docs/known-limitations.md), the manual test sequence is [docs/operator-test-checklist.md](docs/operator-test-checklist.md), and the complete deployment gate is [deployments/firm-single-tenant/README.md#release-gates](deployments/firm-single-tenant/README.md#release-gates).

## The catalog (the interchangeable parts)

| Capability | Detail |
|---|---|
| **Org chart** | Chief of Staff + Chief Counsel + 34 leads — 28 legal practices (commercial, employment, IP, privacy, litigation, corporate, regulatory, research, tax, real estate, M&A, banking & finance, securities, restructuring, immigration, healthcare, antitrust, trade compliance, insurance, construction, government contracts, environmental/ESG, trusts & estates, family law, investigations, AI governance, advertising, benefits) and 6 business functions (BD, ops, finance, marketing, admin, legal ops) — + 143 working specialists (incl. meta-reviewers — risk-spotter, debate-judge, reconciler — and a Capability Builder, operator-review gated) + one non-working facade service principal — **180 agents total**; full roster in [docs/agent-catalog.md](docs/agent-catalog.md) |
| **Skills** | 173: contract drafting and review playbooks (NDA, MSA, SOW, amendments, SaaS, renewals, OSS compliance), per-practice playbooks and checklists across all 28 legal practices, firm-business skills (prebill review, trust accounting, conflicts screening, engagement letters, CLE tracking, client alerts, competitive intel), matter intake, missing-info gate, privacy encoder, Slack/Teams notifications, Markdown/DOCX output, capability authoring, connector descriptors (research, doc stores, e-signature, CRM, billing, practice management, email, drive), **firm-memory** (HOT firm preferences injected at import via `--business`) |
| **Firm learning loop** | `remember this:` comments on issues are sanitized (fail-closed ethical-wall), proposed as Paperclip approval cards, and accumulated in `businesses/<slug>/learnings/`. Approved lessons are injected into the `firm-memory` skill on the next `--business <slug>` launch. **Tier-2 edit-learning:** agents also learn from the lawyer's finalized edits made directly in OneDrive/Google Drive (external-destination capture) — a nightly sweep diffs each delivered file against its delivered draft, distills a sanitized skill-overlay proposal, and surfaces it in the morning digest for yes/no/edit review; approved overlays apply on the next `--business <slug>` launch. Tier-2 SkillOpt (eval-validated automatic refinement) and Box connector remain deferred. |
| **Projects & tasks** | NDA Matters, Commercial Reviews, Eval Results; starter issues + a recurring renewal scan |
| **Model lanes** | Per-agent `modelLane` metadata (primary / routing / drafting / review / extractive) — variants map each lane to the right model automatically |
| **Team subsets** | `--teams litigation,commercial` (or presets `boutique` / `inhouse`) — import only the practices your firm or in-house team runs; chiefs, meta-reviewers, and the skill closure come along automatically. The `inhouse` preset is a first-class operating model, not just a demo: an in-house legal team runs first-pass work with its own agents and escalates to outside counsel only for the judgment it doesn't own |
| **Demos** | `--demo law-firm` / `inhouse-legal` / `biglaw-practice-group` — synthetic demo matters for a boutique firm, an in-house department, and a BigLaw practice group |
| **Delivery** | `deliverables-courier` files finished work products to exact operator-configured OneDrive/SharePoint or Google Drive roots through server-resolved aliases — auto-file or on-request per work-product type, privacy-tier gated, local copy always retained. Authenticated-production Notion writes are an explicit human-placement handoff, not an agent write. |
| **Theme** | `--theme possiblaw` (default) — light-first dashboard with a warm launch palette; `light` / `dark` also available |
| **Firm-facing MCP facade** | Drive the firm from your own MCP assistant (Claude Desktop, Codex, or any MCP client) via a fixed five-noun allowlist; human-only approvals; work-product text default-closed; every facade action receipted through the gate proxy. `./bin/possiblaw --firm-facade`. Honest: stdio v1; human approves in the Paperclip dashboard. [`mcp-servers/firm-facade/`](mcp-servers/firm-facade/) |
| **Deterministic deadline engine** | Court-filing deadlines computed by code (FRCP Rule 6), never by an LLM; result audited in the Matter Trust Report. `deadline-calculator` agent + [`deadline-engine/`](deadline-engine/). Honest: US-FED only; audit-only (visible in the report, not yet blocking); `pnpm -C deadline-engine install` prerequisite. |
| **Ethical walls** | `./bin/possiblaw --add-wall "<Client>" --variant <name>` conflicts-screens a client into its own paperclip company — its own gate proxy, receipts chain, and (`--firm-facade`) facade config — so a hard 403 separates it from every other agent, and `--auth-mode authenticated` makes a screened lawyer's login invisible to it too. Opt-in; the main company is unaffected. Honest: isolates *between* companies, not per-matter *inside* one; see [docs/workflows/ethical-walls.md](docs/workflows/ethical-walls.md) and [docs/known-limitations.md](docs/known-limitations.md). |
| **Firm Overview** | A loopback dashboard (`pnpm -C firm-overview start`) merging issues in flight, pending approvals, and recent deliverables across every client the connected lawyer is authorized for, with deep links into Paperclip and approve/reject as that lawyer. Solo `local_trusted` operators get it with zero setup. Honest: loopback-only, no membership-management UI of its own, deliverables panel bounded to the 10 most-recent in-flight issues per client. |

## Model variants

The launcher picks the model-provider variant at import time — this sets the
*default* model per agent, not a lock-in (see "Changing models after import"
below). Eleven are shipped:

| Variant | Provider | When |
|---|---|---|
| `codex`      | Codex CLI subscription   | Default; works out of the box once `codex login` is done |
| `codex-api`  | Codex CLI + OpenAI API key | When the subscription tier rejects models; key stored as an encrypted paperclip secret |
| `claude`     | Claude CLI subscription  | If you prefer Anthropic models for legal work |
| `claude-api` | Claude CLI + Anthropic API key | Same as `claude`, billed against the API with the full model catalog |
| `ollama`     | Local Llama via OpenCode | Fully local — confidential matters, no cloud round-trips |
| `llamacpp`   | Local HF GGUF via llama.cpp + OpenCode | Fully local without the Ollama client — bring any GGUF |
| `opencode`   | OpenCode Zen gateway (`OPENCODE_API_KEY`) | One key for OpenCode's curated catalog, no vendor logins |
| `openrouter` | OpenRouter (`OPENROUTER_API_KEY`) | One key for the multi-vendor cloud catalog |
| `openrouter-cost` | OpenRouter (`OPENROUTER_API_KEY`), pins GLM 5.2 on cheap lanes | Cost-frontier measurement variant for the orchestration eval — experimental/measurement-only; GLM-5.2-vs-Opus quality is UNCONFIRMED, the thesis under test |
| `gemini`     | Gemini CLI subscription  | Google models via the gemini CLI's OAuth login |
| `gemini-api` | Gemini CLI + Gemini API key | Same as `gemini`, billed against the API (`GEMINI_API_KEY`) |

Live launches preflight-probe each lane model with a tiny CLI request (and
check OpenRouter pins against its public catalog), so "you don't have access
to this model" surfaces before import, not mid-matter (`--skip-model-probe`
to bypass).

**Changing models after import (no rebuild).** A variant just seeds defaults.
From the Paperclip dashboard you can change any single agent's model — or swap
its adapter type (e.g. one agent from `claude` to a local `ollama` or an
`openrouter` model) — without re-importing, and you can override the model for a
single matter from the issue's assignee dropdown (`primary` / `cheap` /
`custom`, within the same adapter type). **Honest limit:** `dataTerms` (declared
per variant in `variants.yaml`) is a data-handling posture asserted at
import/selection time, not yet a live runtime guardrail — the gate-proxy's
tier-floor never receives it (the `anonymize` branch of egress falls back to
the stricter binary local-vs-cloud decision), and model-inference traffic never
traverses the gate proxy at all. A runtime model switch to a weaker-terms lane
is invisible to every guard; the operator's own discipline in picking overrides
for confidential/privileged matters is the control today, not the gate. See
[docs/known-limitations.md](docs/known-limitations.md) → "dataTerms tier-floor
is staged, not enforced at runtime". To change the package-wide defaults
instead, re-run with a different `--variant`. Full steps:
[docs/operator-walkthrough.md](docs/operator-walkthrough.md#variant-setup).

### MCP registry — declare MCP servers once

Paperclip doesn't manage MCP; each variant's adapter wraps a CLI that reads MCP
from its own config file in its own schema. PossibLaw makes MCP an atomic,
declare-once unit: list each server once in
[`companies/legal-operations/mcp-servers.yaml`](companies/legal-operations/mcp-servers.yaml)
(`name`, `transport`, `command`/`url`, `auth`, `grantTo`, `privacy`), and the
launcher renders it into whichever runtime CLI config the chosen variant uses —
`opencode.json`, `~/.codex/config.toml`, `.mcp.json`, or `~/.gemini/settings.json`
— via the stdlib-only `bin/_possiblaw_mcp.py`. Only env var **names** pass
through, never secrets; `oauth` servers stay interactive on first run. Seeded
with the `legal-data` adapter and the official CourtListener MCP. `grantTo` is
advisory (CLI MCP configs are global per runtime, not per-subagent); `--skip-mcp`
bypasses. Build spec: [`docs/builds/mcp-registry.md`](docs/builds/mcp-registry.md).

---

## Architecture in 90 seconds

```
┌─────────────────────────────────────────────────────────┐
│  bin/possiblaw   (one-command launcher: onboard,         │
│                   variant select, package import,        │
│                   egress-credential scrub)               │
├─────────────────────────────────────────────────────────┤
│  gate-proxy/    (loopback egress gate: per-boundary      │
│                  policy, human approvals, anonymizer,    │
│                  tier-floor (confidentiality), hash-     │
│                  chained receipts + sign-off bundle      │
│                  export — holds the ONLY egress          │
│                  credentials)                            │
├─────────────────────────────────────────────────────────┤
│  mcp-servers/legal-data/  (data layer: trust-adapter in  │
│                  front of CourtListener's official MCP;  │
│                  registers retrieved authorities with    │
│                  the gate → flags unbacked citations)    │
├─────────────────────────────────────────────────────────┤
│  companies/legal-operations/   (the PossibLaw package)   │
│  ├── COMPANY.md + .paperclip.yaml + variants.yaml        │
│  ├── gate-policy.yaml (per-firm trust-boundary policy)   │
│  ├── agents/    (178 AGENTS.md — org chart + routing)    │
│  ├── skills/    (173 SKILL.md — playbooks, gates,        │
│  │               outputs, notifications, connectors)     │
│  ├── projects/  (NDA matters, commercial reviews,        │
│  │               eval results + starter tasks)           │
│  └── evals/     (eval convention + cases)                │
├─────────────────────────────────────────────────────────┤
│  paperclip/  (git submodule — never modified; owns UI,   │
│               auth, orchestration, budgets, adapters,    │
│               approvals)                                 │
└─────────────────────────────────────────────────────────┘
```

The standalone CLI runtime from Sprints 0-11 was removed in 0.4.0 — paperclip already provides everything it reimplemented. It remains available in git history (`git log --oneline -- cli/`). The `layer/` directory holds remaining unconverted source material (eval datasets, workflow shapes).

Deep dive: [FOUNDATION.md](FOUNDATION.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## What's NOT in this PoC

This is a proof-of-concept. It is explicitly **not**:

- A helm chart, Terraform module, or production-grade deployment system.
- A multi-tenant SaaS platform.
- A fork of paperclip — do not rename or patch paperclip internals.
- Legal advice or a legal-services provider.
- A finished product with SLAs, support contracts, or security guarantees.

From the plan: *"The goal is to show that the routing hierarchy, test layer, guardrail layer, and MCP connector framework can be composed into a coherent legal-business operating layer — not to ship a consumer product."*

---

## Posture

Open, public, Apache 2.0 from day 1. No SLAs. Fork-friendly. Contributions via pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for the security posture.

---

## Evals

> Which benchmarks we run, which we cannot, and what each actually measures about PossibLaw rather than about the model: [docs/benchmarks.md](docs/benchmarks.md). Short version — CUAD and Harvey LAB run today; LEDGAR, UNFAIR-ToS, MAUD and ACORD are staged without adapters; LegalBench needs a curated subset with per-task licence checks; **PrinzBench cannot be self-run** because its questions are permanently held out.


The Paperclip-native eval convention lives at [companies/legal-operations/evals/README.md](companies/legal-operations/evals/README.md): eval cases run as Paperclip issues, a judge agent scores results, and receipts land in the **Eval Results** project. Dataset source material (CUAD, MAUD, ACORD, UNFAIR-ToS, LEDGAR) remains under `layer/evals/`.

Historical receipt from the retired standalone harness (2026-05-21): CUAD × clause-extract × claude-cli/haiku scored mean **0.5788** over 15 samples on subscription auth.

---

## Documentation

| Guide | What it covers |
|---|---|
| [docs/operator-walkthrough.md](docs/operator-walkthrough.md) | Fresh Paperclip instance, package import, the gate demo, and starter NDA matter |
| [docs/for-law-firms-model-rules.md](docs/for-law-firms-model-rules.md) | For firm evaluation committees: how each trust feature maps to the Model Rules of Professional Conduct — with honest limits |
| [docs/agent-catalog.md](docs/agent-catalog.md) | The full catalog: every team, agent, and skill in the package |
| [docs/paperclip-package.md](docs/paperclip-package.md) | Current Paperclip-native package path and import instructions |
| [docs/known-limitations.md](docs/known-limitations.md) | Sharp edges: gate-proxy trust limits, importer non-atomicity, sidebar scale, Ollama quality caveat |
| [docs/connectors-inventory.md](docs/connectors-inventory.md) | Every connector and which egress path it takes through the gate |
| [docs/privacy-filter.md](docs/privacy-filter.md) | Threat model, token format, adversarial test index |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture decision log |
| [FOUNDATION.md](FOUNDATION.md) | How the paperclip submodule is wired; extension-point inventory |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow |
| [SECURITY.md](SECURITY.md) | Security posture, reporting, known threats |
| [CHANGELOG.md](CHANGELOG.md) | Sprint-by-sprint change log |

---

## License

PossibLaw is licensed under the **Apache License 2.0**. See [LICENSE](LICENSE).

paperclip's MIT license is preserved in [NOTICE](NOTICE) and in `paperclip/LICENSE`.

---

## Acknowledgements

- **paperclip** — the control-plane runtime this layer runs on.
- **lavern** — design-pattern inspiration for the escalation-as-success framing.
- **Anthropic's 12 practice-area plugins** — reference implementation patterns for legal domain coverage.
- **mike** — skill-extraction pattern (inspiration only; no AGPL code copied).
