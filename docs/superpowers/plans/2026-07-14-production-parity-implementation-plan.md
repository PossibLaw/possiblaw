# Production Firm + In-House Parity Implementation Plan

**Date:** 2026-07-14
**Status:** IN PROGRESS — Milestone 0 code baseline implemented; live isolation/operator gates remain
**Risk:** High (auth, privileged data, external connectors, deployment, and broad workflow behavior)
**Repository baseline:** `main` at `8615f93cde1f583efe48960f86b1be5ad313004f`
**Product thesis:** PossibLaw is an owned, self-hostable, configurable legal-agent template. It does not attempt to reproduce every vendor feature or hide the underlying model, skills, tools, policies, or deployment.

**Implementation checkpoint (2026-07-15):** The repository-pinned Node/runtime contract, one-command credential-free verifier, pinned CI actions, authenticated production launcher administration, launcher-owned Paperclip listener checks, HMAC-bound gate startup readiness, dedicated company/agent gate-key identity, authenticated company-scoped gate ingress, prebound fail-closed agent gate URLs, strict wall restore/binding checks, canonical per-company custody paths, company-bound receipts, durable one-shot dispatch reservations, fsync writes, bounded outbound fetch/shutdown, and single-writer leases are implemented. Gate ingress now uses a company-bound, immutable-agent-ID, exact-target, default-deny authorization map compiled from trusted import bindings and cross-checked against the live company; trusted Drive/OneDrive aliases are resolved server-side to exact provider roots, authorization denials are receipted, and the firm facade uses a separate wake-disabled service identity rather than a chief's key. The latest direct gate battery is 527/527 with typecheck green. The strict `possiblaw/config/v1` schema/validator foundation and firm, in-house, and hybrid examples are implemented; launcher precedence/rendering remains open. A customer-controlled, single-tenant Docker Compose reference topology has been selected and its static implementation is in validation; live Docker isolation remains operator-gated on a Docker-capable host. The complete `bin/verify` battery must be rerun after that deployment slice lands. Milestone 0 is **not closed**: the disposable two-lawyer test, live provider/readback tests, live sacrificial-agent isolation execution, full tool-version matrix, external/WORM receipt anchoring, and the pinned Paperclip failed-secret-request logging risk remain `OPERATOR-GATED`, `UNCONFIRMED`, or release-blocking. Same-UID unsandboxed agent execution remains an explicit production release blocker outside the hardened reference topology, not a passing claim.

## 1. Objective

Deliver a production-oriented reference implementation that a firm or in-house legal team can deploy, configure, operate, audit, and extend. The reference implementation must support the complete matter lifecycle:

1. A human or configured inbox creates a matter.
2. The matter is classified and routed without trusting inbound content as instructions.
3. A lead delegates bounded work to specialist agents.
4. Specialists produce a reconstituted draft with source and artifact lineage.
5. A legal professional reviews the exact draft version in PossibLaw, Google Drive, or OneDrive.
6. Any edit creates a new version and invalidates stale approval.
7. The gate proxy permits only the approved version to cross a configured boundary.
8. Delivery, review, and later learning are receipted and matter-scoped.
9. Operators can replace models, skills, tools, connectors, policies, budgets, and enabled workflow packs without forking the control plane.

Production parity means parity in this operating lifecycle and its governance. It does **not** mean duplicating every Anthropic agent, building academic/classroom agents, operating a hosted SaaS, or matching a vendor's proprietary user interface.

## 2. Non-negotiable architecture boundaries

- Keep Paperclip pinned as a submodule. Do not modify `paperclip/`.
- Put PossibLaw-owned behavior in the launcher, package, gate proxy, facade, learning loop, firm overview, new configuration files, and new reference-deployment files.
- Treat the gate proxy as the enforcement point for external reads/writes and exact-version delivery.
- Treat Paperclip issues, approvals, agents, routines, costs, and heartbeat controls as control-plane primitives, accessed through supported APIs/configuration.
- Keep secrets out of tracked configuration. Configuration refers to environment-variable or secret-provider keys.
- Preserve company/matter boundaries on every new artifact and connector operation.
- Default new inbound automation to human-visible triage. Fully automatic assignment is opt-in and constrained by explicit rules.
- Keep artifact manifests hash/metadata only; do not duplicate privileged document text into custody records.
- Do not claim that artifact IDs solve access control or same-UID process isolation.
- Keep a single active writer per gate/receipt store until a separately tested multi-writer storage adapter exists.
- In a production profile, failure to start or reach the gate/custody path is fatal; the current warn-and-continue launcher behavior remains demo-only.

## 3. Verified starting point

The repository already provides the hard parts of the skeleton:

- 179 working agents, one service-only facade identity, and 178 skills across firm and in-house domains in `companies/legal-operations/`.
- Atomic delegation and reconstitution instructions, including `reconstitution-playbook`.
- Gate-proxy boundary classification, approval binding, DOCX/binary delivery, citation/provenance receipts, Google Drive/OneDrive/Notion upload paths, and a Matter Trust Report.
- A delivery manifest and Tier-2 learning-loop foundation keyed by provider file ID.
- Manual matter creation, a provisioned matter-intake routine, company-per-walled-client support, authenticated mode, and Firm Overview.
- Model variants, per-agent runtime model selection, local and cloud choices, and Paperclip cost tracking.
- Eval harnesses, Harvey LAB orchestration evaluation, deadline engine, legal-data MCP, and firm-facing MCP facade.

The production gaps that drive this plan are:

- No single firm configuration contract for enabled workflows, models, tools, connectors, policies, routines, budgets, and run limits.
- No unified logical artifact ID and version lineage spanning intake, drafting, approval, cloud editing, delivery, and learning.
- Only `matter-intake-sweep` is launcher-provisioned; the other declared routines are not operationally bound by import.
- Email and several research/notification/readback paths are skill descriptions or direct calls rather than consistently gated, receipted integrations.
- Google Drive/OneDrive delivery exists, but production readback, exact revision matching, DOCX/native-document diffing, and live connector validation remain incomplete.
- All package agents currently declare `budgetMonthlyCents: 0`; this disables Paperclip's positive-budget enforcement.
- Subscription variants do not provide meaningful per-run cost figures, so they need capacity controls in addition to dollar budgets.
- Current eval coverage is far below the catalog size and does not establish end-to-end workflow-pack parity.
- There is no PossibLaw production deployment reference; the README explicitly excludes a production-grade deployment system.
- Same-UID/local-trusted isolation, inherited agent secrets, and intra-company read scope remain documented trust floors.
- Gate startup is currently warn-only, the default policy does not hard-gate every `THIRD_PARTY_EGRESS` action, and Paperclip's default agent concurrency is not reduced by the package.

## 4. Target architecture

```mermaid
flowchart LR
    A["Manual entry or configured email inbox"] --> B["Intake adapter through gate proxy"]
    B --> C["Paperclip matter + inbound artifact versions"]
    C --> D["Lead agent delegates bounded child issues"]
    D --> E["Specialists draft and reconstitute"]
    E --> F["Artifact registry creates draft version"]
    F --> G["Lawyer reviews in OS, Drive, or OneDrive"]
    G --> H["Provider readback creates reviewed version"]
    H --> I["Paperclip approval binds exact version hash"]
    I --> J["Gate proxy delivers only approved version"]
    J --> K["Receipt + Matter Trust Report + optional learning"]
```

### 4.1 Configuration layer

Add a versioned, portable firm configuration, recommended shape:

```text
businesses/<slug>/possiblaw.yaml
```

It declares:

- identity and deployment mode;
- enabled personas and workflow packs;
- teams and optional agent overrides;
- model variant and per-lane overrides;
- allowed tools and connectors;
- boundary, confidentiality, approval, and delivery policy;
- routine schedules and concurrency policy;
- Paperclip monthly budgets for metered providers;
- heartbeat concurrency, adapter timeout, and max-turn settings;
- provider-specific references to secret names, folders, drives, and inbox rules.

CLI flags remain useful for one-off overrides, but configuration becomes the reproducible source of truth. The launcher must print a redacted effective configuration during `--dry-run`.

### 4.2 Matter-artifact custody layer

Implement a lightweight matter-artifact registry within the gate-proxy service rather than a separate custody service. It extends the existing single-writer receipt architecture and avoids another privileged network hop.

Each logical artifact has:

- server-generated `artifactId` stable across revisions;
- server-generated `versionId` for each immutable version;
- `companyId` and `matterId` binding;
- canonical-text hash and optional raw-binary hash;
- kind and media type;
- origin (`manual`, `email`, `paperclip`, `gdrive`, `onedrive`, or another configured connector);
- provider object ID and provider revision/version token when available;
- `derivedFrom` artifact/version references;
- created-by principal or agent ID;
- review/approval references;
- delivery receipt references.

This is tracing and exact-version binding, not universal DRM. A later Boundary Custody Record extension may add classification, allowed destinations, signed risk acceptance, and expiry without changing the core identifiers.

### 4.3 Workflow packs

Create declarative workflow-pack manifests. A workflow pack specifies entry triggers, required inputs, lead and specialist agents, required skills/tools, output artifact types, approval boundaries, delivery destinations, routines, and eval IDs. Packs reuse the existing catalog; new agents are added only where a required atomic role is actually absent.

The reference distribution enables both persona families:

| Persona | Workflow pack | Reference lifecycle |
| --- | --- | --- |
| In-house | Commercial | NDA triage/review, amendment trace, renewal monitoring |
| In-house | Privacy | DSR intake/response, DPA review, DPIA escalation |
| In-house | Product | Launch review and marketing-claims check |
| In-house | AI + Regulatory | AI use-case triage/impact review and regulation-to-policy change tracking |
| Firm | Corporate | Diligence extraction, board consent/record, closing checklist |
| Firm | Litigation | Demand/subpoena intake, chronology/claim chart, docket monitoring |
| Firm | Employment | Termination risk review, classification, investigation intake |
| Firm | IP | Clearance triage, infringement/DMCA response, portfolio renewal |

## 5. Milestones and implementation order

### Milestone 0 — Lock the production baseline

**Purpose:** prevent new work from landing on an unrepeatable baseline.

Tasks:

1. [x] Add the supported Node version to `.nvmrc` and `engines` fields for PossibLaw-owned packages.
2. [x] Add CI for shell syntax/self-tests, package tests/typechecks, manifest validation, eval coverage generation, package rendering, and explicit live-check skips. Do not modify Paperclip CI.
3. [ ] PARTIAL: production port/collision and wall restore behavior are fail-closed; the remaining `--add-wall`/`--dry-run`/`--teams` combination matrix is not yet receipted.
4. [x] Represent two-lawyer authenticated wall, delivery, and Tier-2 tests as explicit operator-gated work in `.agent/TEST.md`; execution receipts remain pending.
5. [ ] PARTIAL: Node 24.18.0 and pnpm 9.15.4 are pinned; Python, pandoc, Docker/Compose, and provider CLI versions remain to be recorded with the deployment reference.
6. [x] Add a production-safety mode in which missing/unhealthy gate proxies, custody stores, invalid identities/policies, incomplete agent bindings, or wall bindings abort startup.
7. [ ] Add a sacrificial authenticated-agent security eval that tests access to `BETTER_AUTH_SECRET`, provider credentials, other-company data, and host files without printing secret values.
8. [ ] Verify a Paperclip-supported sandbox/remote execution target with an explicit environment allowlist and separate worker identity. If no supported configuration closes inherited-secret/same-UID access, multi-lawyer production readiness remains blocked pending an upstream isolation capability.

Primary paths: `.github/workflows/`, `.nvmrc`, package `package.json` files, `bin/possiblaw`, `bin/test-*`, `docs/operator-test-checklist.md`.

Exit gate: a clean clone can run every non-credentialed check with one documented command; unresolved live-provider checks are labeled `OPERATOR-GATED`, not reported as passing.

### Milestone 1 — Firm configuration and customization contract

**Purpose:** make ownership/customization a first-class product capability.

Tasks:

1. [x] Define `possiblaw/config/v1` JSON Schema and example firm, in-house, and hybrid configs.
2. Add `--config`, `--print-effective-config`, and `doctor` behavior to the launcher/helper scripts.
3. Define precedence: schema defaults → selected profile → business config → explicit CLI override.
4. [ ] PARTIAL: the standalone validator checks team, agent, skill, tool, workflow, connector, variant, lane, routine, policy, and secret references; launcher pre-import integration remains open.
5. [x] Reject inline secret values and unknown keys; redact secret references in output.
6. Render/apply existing `.paperclip.yaml`, `variants.yaml`, MCP registry, gate policy, routine, budget, and heartbeat settings from the effective config without editing Paperclip.
7. Add a customization guide that walks through replacing a model, modifying a skill, disabling a tool, adding a connector, changing an approval boundary, and enabling a workflow pack.
8. [x] Ship production policy defaults that distinguish a trusted firm-workspace upload from a client/counterparty send and require a human gate for the latter; permissive `THIRD_PARTY_EGRESS` remains an explicit operator override.
9. [x] Define and enforce a fail-closed principal-to-route/tool capability matrix at gate ingress; authoring slugs compile to immutable company-bound agent IDs, and same-company authentication alone does not authorize a protected action.

Primary paths: new `config/` schema/helpers, `businesses/_template/possiblaw.yaml`, `companies/legal-operations/profiles/`, `bin/possiblaw`, `bin/_possiblaw_*.py`, `docs/customize-your-team.md`.

Exit gate: the same checkout can dry-run firm, in-house, and hybrid configurations; invalid or secret-bearing config fails before network calls or imports.

### Milestone 2 — Matter-artifact identity and exact-version approval

**Purpose:** join today’s disconnected hashes and provider IDs into one auditable lifecycle.

Tasks:

1. Add artifact/version types, validation, append-only storage, indexes, and recovery tests under `gate-proxy/src/artifacts/`.
2. Add company/matter-scoped register, version, resolve, and read APIs. Generate IDs server-side.
3. Register inbound attachments, Paperclip drafts, converted DOCX files, provider uploads, provider readbacks, and final deliveries.
4. Extend delivery approval binding from payload-only evidence to `artifactId + versionId + content hash`.
5. Fail closed when the current content hash differs from the approved version.
6. Preserve the Paperclip human decider ID and decision time in the artifact approval record and Matter Trust Report.
7. Project lineage, approval, provider link, and delivery references into the Matter Trust Report.
8. Bridge the existing learning-loop `vendorFileId` manifest to artifact IDs without breaking existing businesses.
9. Document what custody proves and what it does not prove.

Primary paths: `gate-proxy/src/artifacts/`, `gate-proxy/src/server.ts`, `gate-proxy/src/quality/signoff.ts`, `learning-loop/src/manifest.ts`, `learning-loop/src/types.ts`, `companies/legal-operations/skills/output-delivery-playbook/`.

Exit gate: an approved draft can be traced from origin through derived draft, reviewed revision, and delivery; mutation after approval blocks delivery and requires a new approval.

### Milestone 3 — Gated intake and routine framework

**Purpose:** turn manual and scheduled work into controlled, reproducible operations.

Tasks:

1. Generalize routine provisioning in `bin/possiblaw` so declared routines can be bound, scheduled, disabled, and assigned idempotently.
2. Provision intake, delivery, learning, skill-improvement, renewal, docket, and regulatory routines only when enabled by firm config.
3. Apply routine `coalesce_if_active`/`skip_if_active` controls and agent heartbeat run limits before any watcher is enabled.
4. Add provider adapters for configured email ingestion through the gate proxy. The target provider set is an open decision below.
5. Extract the Harvey-specific parsing bridge into a PossibLaw-owned `document-ingest/` package. Parse DOCX, PDF, EML, TXT, and XLSX into normalized text plus page/section/sheet provenance, size limits, and deterministic hashes.
6. Convert each email and attachment to matter-scoped artifacts; deduplicate with immutable provider message/attachment IDs.
7. Wrap inbound subjects, bodies, attachments, filenames, parsed text, and metadata in the existing untrusted-data envelope.
8. Support three configured modes: `manual`, `triage` (default recommendation), and rule-constrained `auto_assign`.
9. Quarantine unsupported/encrypted/malformed/oversized attachments and surface an operator action rather than dropping them.
10. Route connector reads, research queries, and content-bearing notifications through the gate/receipt boundary or explicitly disable them in production profiles.
11. Receipt all connector reads and issue creation decisions without storing email/document text in the receipt chain.
12. Add durable provider cursors, idempotency keys, bounded retry/backoff, dead-letter records, and operator-visible last-success/failure state for automatic watchers.

Primary paths: `bin/possiblaw`, `companies/legal-operations/.paperclip.yaml`, connector skills, `gate-proxy/src/connectors.ts`, new provider adapter modules, new `document-ingest/`, `orchestration-eval/src/extract.ts`, `companies/legal-operations/skills/matter-intake-sweep/`.

Exit gate: one inbound message creates exactly one matter and registered attachment set; re-polling is idempotent; prompt-injection text cannot silently activate tools or bypass human review policy.

### Milestone 4 — Lawyer review, cloud readback, and delivery

**Purpose:** make the draft lawyers edit the same artifact the system approves and sends.

Tasks:

1. Finish production OAuth/token-refresh configuration for Google and Microsoft connectors without persisting plaintext tokens in tracked files.
2. Create/reuse per-matter folders and write real DOCX or configured native documents.
3. Record provider file IDs, revision tokens, links, and hashes as artifact versions.
4. Add readback for edited Drive/OneDrive files and DOCX/native-document text extraction.
5. Produce a human-readable diff and a new review version; never treat “edited in cloud” as “approved.”
6. Surface drafts, current version, diff, approval state, and provider link in Paperclip issue conventions and Firm Overview.
7. Require re-approval whenever readback changes the approved hash.
8. Deliver only through the gate proxy and append provider delivery metadata to the receipt/Trust Report.
9. Run live Google and Microsoft round trips with separate disposable test tenants/accounts; store only redacted receipts.
10. Implement Microsoft Graph email delivery or correct the Outlook connector contract; the current gate performer is Gmail-specific and cannot substantiate a gated Outlook-send claim.

Primary paths: `gate-proxy/src/connectors.ts`, new connector adapter modules, `learning-loop/src/diff.ts`, `firm-overview/src/`, delivery/readback skills, `docs/operator-test-checklist.md`.

Exit gate: a lawyer can edit a draft in either supported cloud suite, see the revision in PossibLaw, approve that exact version, and prove the same version was delivered.

### Milestone 5 — Production workflow packs for both personas

**Purpose:** establish workflow parity through runnable, evaluated lifecycles rather than catalog size.

Tasks:

1. Define and lint the workflow-pack manifest schema.
2. Map each reference pack to existing agents/skills and identify only true missing atomic roles.
3. Implement both persona families in parallel after Milestones 1–4 stabilize.
4. Give every pack a manual trigger, optional intake/routine trigger, required artifacts, delegated child shape, reconstitution step, review boundary, delivery destination, and Trust Report expectation.
5. Add deterministic fixture checks plus happy, edge, and failure/security agent evals.
6. Add Harvey LAB tasks where a relevant public fixture exists; do not invent success claims when no fixture exists.
7. Publish a capability matrix with `ready`, `partial`, `example`, and `deferred` statuses.

Known pack gaps to resolve or label honestly include: a substantive DPA reviewer and DSR response builder; a product-launch coordinator; AI use-case triage and impact assessment; data-room ingestion; general litigation chronology/claim-chart/deposition-prep roles; termination-risk review; and verified trademark-search infrastructure. Detailed prompts alone do not count as a runnable pack.

Primary paths: new `companies/legal-operations/workflows/`, existing agent/skill files, `companies/legal-operations/evals/cases/`, `eval-harness/`, `orchestration-eval/`, `docs/agent-catalog.md`.

Exit gate: all eight reference packs complete an end-to-end synthetic run; at least one firm and one in-house pack complete a live provider round trip with human approval.

### Milestone 6 — Budgets, capacity, and operational observability

**Purpose:** make autonomous and recurring work bounded before calling it production-ready.

Tasks:

1. Add named budget/run-limit profiles to firm config; do not hard-code arbitrary dollar values.
2. Apply positive Paperclip company/agent budgets for metered variants when the operator supplies them.
3. For subscription variants, label cost as unmetered/unknown and enforce `heartbeat.maxConcurrentRuns`, adapter `timeoutSec`, `maxTurnsPerRun`, and routine concurrency/schedule limits.
4. Wire the configured `dataTerms` tier floor into gate-proxy runtime enforcement; until that test passes, production docs must describe it as staged configuration only.
5. Add per-workflow and per-routine run summaries: started, completed, failed, skipped/coalesced, model/lane, measured cost where available, and artifact/delivery result.
6. Alert at configured soft thresholds and pause/fail closed at hard limits that the underlying platform can enforce.
7. Add health/doctor checks for Paperclip, gate proxies, wall registry, connector credentials, routine bindings, receipt-chain integrity, and backup age.
8. Require explicit production concurrency values rather than inheriting Paperclip's current high default; monetary amounts and capacity values remain operator-defined inputs.

Primary paths: firm config/schema, `bin/possiblaw`, package manifest generation, `firm-overview/src/`, gate health endpoints, operator docs.

Exit gate: metered runs stop at a configured positive budget; subscription runs remain bounded by capacity/time/turn limits; routine overlap behaves as configured.

### Milestone 7 — Reference production deployment and operator documentation

**Purpose:** let a technically competent team deploy and operate the template without reverse-engineering the repo.

Approved baseline: a customer-controlled, single-tenant Docker Compose deployment with authenticated Paperclip, one gate proxy per company/wall, isolated worker identities, persistent volumes, TLS termination, health checks, backups, and explicit provider credentials. Kubernetes/Terraform remain out of scope for the first reference deployment.

Tasks:

1. Add a PossibLaw-owned deployment layout outside `paperclip/`, with pinned images/builds and no edits to the submodule.
2. Add a service supervisor/container entrypoint that starts Paperclip, each company/wall gate proxy, required facade/overview services, routine support, and health checks without relying on the laptop-shaped launcher lifecycle.
3. Run services as non-root where supported; use read-only filesystems and explicit writable volumes where practical. Isolate agent execution from server and egress secrets using the verified Milestone 0 execution target.
4. Add health checks, restart policy, dependency ordering, log rotation guidance, TLS/reverse-proxy example, stable public URL, and authenticated mode.
5. Document secret generation/storage, key rotation, least-privilege Google/Microsoft scopes, and agent-environment exposure limits.
6. Add backup, restore, upgrade, rollback, receipt-head anchoring, and disaster-recovery drills.
7. Add a production security checklist that calls out same-UID isolation and company-per-wall limitations honestly.
8. Rewrite the README as the front door and link focused guides for installation, deployment, configuration, connectors, first matter, review/approval, delivery, routine operations, customization, evals, and troubleshooting.
9. Add a fresh-clone smoke script that executes every documentation command that can run without external credentials.

Primary paths: new `deploy/`, `README.md`, new `docs/deploy/`, focused use/configuration guides, `.env.example`, smoke scripts.

Exit gate: a fresh VM can deploy the authenticated reference stack from the documented steps, survive restart, restore from backup, and run a synthetic matter without undocumented commands.

### Milestone 8 — Release and demo readiness

**Purpose:** demonstrate validated behavior, not aspirational behavior.

Tasks:

1. Run the full TEST → REVIEW → HANDOFF contract and close all S0/S1 findings.
2. Reconcile README, agent catalog, known limitations, connector inventory, operator walkthrough, and capability matrix against executed receipts.
3. Create deterministic synthetic demo tenants/data for a firm story and an in-house story.
4. Re-cut `docs/demo-video-scripts.md` around the same lifecycle: intake → delegation → review/edit → exact-version approval → gated delivery → Trust Report → customization.
5. Produce a short technical deployment demo and two workflow demos only after their scripts pass as written.

Exit gate: every shown command and claim has a current test or operator receipt; demo fixtures contain no real client or employee data.

## 6. Eval contract proposed before implementation

These IDs feed `.agent/TEST.md`. Each behavior starts with a failing automated or manual eval before implementation.

| Eval IDs | Area | Happy path | Edge/boundary | Failure/security |
| --- | --- | --- | --- | --- |
| `BASE-001..003` | Production baseline | One command runs all credential-free checks on the pinned runtime | Command is cwd-independent and skips live-provider work without credentials | Production mode rejects local-trusted auth or a disabled/unhealthy gate before agent startup and never prints secrets |
| `AUTH-001..003` | Gate ingress identity | Valid same-company callers are authenticated and every protected-write receipt derives their identity | Malformed encoded tool paths return 400 without crashing the gate | Missing, invalid, cross-company, and spoofed identities fail before dispatch with sanitized 401/403 responses |
| `AUTHZ-001..003` | Gate authorization | An exact immutable specialist grant reaches its route and an authorized firm root may auto-file | Unconfigured/raw destination selectors fail before approval or dispatch | Same-company privilege escalation, mutable-name impersonation, unmapped routes, and unreceiptable denials fail closed |
| `CFG-001..003` | Configuration | Hybrid config renders/imports | Empty optional pack set remains valid | Unknown key, inline secret, or invalid reference fails before network calls |
| `ISOLATION-001..003` | Worker isolation | Two sacrificial agents run through distinct non-root identities and scoped boundaries | Unsafe workspace staging input leaves no output | Host/control/provider/peer/foreign-company probes fail closed and emit only booleans/hashes |
| `CUS-001..004` | Custody | Intake → draft → review → delivery lineage | Identical content from a new provider revision remains a distinct version event | Cross-company/matter access or changed approved hash is rejected |
| `INT-001..004` | Intake | One allowed email creates one triage matter | Re-poll and duplicate attachment are idempotent | Prompt injection or malformed attachment is contained/quarantined |
| `DEL-001..004` | Review/delivery | Edited cloud draft is read back, approved, and delivered | No-change readback creates no false revision | Expired auth, revoked scope, or post-approval edit fails closed |
| `WF-COM-001..003` | Commercial | NDA reaches reviewed artifact | Missing business position produces questions, not fabricated terms | External send without approval is blocked |
| `WF-PRI-001..003` | Privacy | DSR/DPA/DPIA route correctly | Identity/jurisdiction ambiguity pauses substantive response | Personal data cannot cross a disallowed model/destination boundary |
| `WF-PRO-001..003` | Product | Launch/claims review yields decision packet | Incomplete launch facts produce scoped gaps | Agent cannot publish claims or approve its own launch |
| `WF-AIR-001..003` | AI/regulatory | Use-case and policy-diff work are delegated | No relevant regulatory change produces a receipted no-op | Unverified regulatory source cannot drive a policy update |
| `WF-COR-001..003` | Corporate | Diligence/consent/closing artifacts link | Missing entity/deal facts remain open items | No signature, filing, or final consent leaves without approval |
| `WF-LIT-001..003` | Litigation | Intake/chronology/docket outputs reconstitute | Conflicting dates are flagged, not normalized silently | Unverified citation/privileged material blocks filing/external delivery |
| `WF-EMP-001..003` | Employment | Termination/classification/investigation routes correctly | Jurisdiction ambiguity triggers escalation | Sensitive employment data is matter-scoped and external send is blocked |
| `WF-IP-001..003` | IP | Clearance/infringement/portfolio work completes | Similar mark or uncertain ownership is escalated | Agent cannot file, send a demand, or claim clearance autonomously |
| `OPS-001..004` | Operations | Metered budget and routine controls apply | Subscription cost is shown as unknown while capacity remains bounded | Budget exhaustion, overlapping routine, or unhealthy gate pauses work |
| `DEP-001..004` | Deployment | Fresh authenticated deployment reaches first synthetic matter | Restart preserves companies, walls, artifacts, and receipts | Missing secret, failed integrity check, or unauthorized remote request fails closed |
| `DOC-001..003` | Documentation | All non-secret commands smoke successfully | Alternate firm/in-house config paths are documented | Docs do not claim unexecuted live-provider validation |
| `DEMO-001..003` | Demo | Firm and in-house scripts execute end to end | Demo can run offline with visibly reduced connector behavior | Fixture/recording scan finds no real confidential data or secrets |

LLM outputs are not accepted on a single holistic score. Each workflow eval separates routing/tool retrieval, artifact correctness, legal-source fidelity where applicable, and boundary/approval behavior. Human-labeled trace sets are required before relying on an LLM judge.

## 7. Parallel execution model

Use parallel agents for bounded, non-overlapping work only:

- Configuration/schema and launcher changes.
- Artifact registry/gate-proxy work.
- Workflow manifests/evals in `companies/legal-operations/`.
- Deployment scaffolding and documentation.
- Independent correctness and security review.

The root engineer owns integration and edits to shared files (`bin/possiblaw`, `README.md`, gate server wiring, contract artifacts). Two agents must not edit the same shared file concurrently. Each milestone closes with tests, security review, and a continuity checkpoint before the next milestone starts.

## 8. Explicit deferrals

- Academic/classroom agents and a clone of Anthropic's entire catalog.
- Hosted multi-tenant SaaS, billing, customer support, or marketplace operation.
- Kubernetes, Helm, and Terraform in the first reference deployment unless the deployment decision changes.
- Replacing Paperclip or forking/modifying its submodule.
- Full cryptographically signed Boundary Custody Records, content DRM, or remote attestation. The artifact registry keeps an extension point for these.
- Autonomous legal advice, signatures, filings, settlement authority, final HR decisions, or unsupervised external communications.
- Claiming intra-company/matter isolation stronger than the actual Paperclip/company and OS-process boundaries.
- Every connector in the current inventory. Production support is limited to connectors with implemented auth, read/write paths, receipts, tests, and runbooks.

## 9. Resolved production-baseline decisions

**RESOLVED (operator, 2026-07-15) — reference deployment target.** The first production baseline is single-tenant Docker Compose on a customer-controlled VM or private cloud, with authenticated Paperclip, isolated worker identities/mounts/environment/network, and TLS. Kubernetes, a managed PaaS, and desktop-only deployment are outside this reference slice.

**RESOLVED (operator) — provider scope.** Google Drive and Microsoft OneDrive are parallel first-class review/delivery targets. Both share the same custody/version/approval contract; provider-specific live round trips remain separate operator-gated receipts.

## 10. Definition of done

This program is done only when:

- the configuration, custody, intake, review, delivery, budget/capacity, and deployment evals have recorded receipts;
- all eight reference workflow packs satisfy their happy, edge, and failure/security evals;
- at least one firm and one in-house workflow complete live human-approved cloud round trips;
- the reference deployment survives restart and tested restore;
- S0/S1 review findings are closed and remaining limitations are explicit;
- the README and guides let a fresh operator deploy, configure, run, review, and customize the template;
- demo scripts execute exactly as documented using synthetic data.
