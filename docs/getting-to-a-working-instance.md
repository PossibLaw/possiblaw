# Getting to a working instance

Step-by-step from a clean machine to an instance you can run benchmarks and the
C3 matter-access test against. Three paths — **local**, **Azure**, **Hostinger**
— sharing the same Parts 1–3.

The README's "Deployment and setup" section covers *architecture and security
posture* for each host. **This document is what you type.** Where they overlap,
the README is the authority on posture and this is the authority on sequence.

> **Two ports, one rule.** `3100` is Paperclip (the control plane); `3801` is the
> Gate Proxy. Never publish either to the internet. If an operator's own server
> is already on `3100`, use a disposable instance instead: `--port 3199
> --gate-port 3899 --data-dir "$(mktemp -d)"`.

---

## Part 1 — Prerequisites (all three paths)

**Node must be exactly 24.18.0.** `bin/verify` string-compares `node --version`
against `.nvmrc`, and every package declares `engines.node: ">=24.18.0 <25"`. A
newer Node fails before a single test runs.

```bash
# macOS
brew install fnm
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc && exec zsh

# Linux
curl -fsSL https://fnm.vercel.app/install | bash && exec $SHELL
```

```bash
git clone https://github.com/PossibLaw/possiblaw
cd possiblaw
git submodule update --init --recursive
fnm install && fnm use          # reads .nvmrc → 24.18.0
node --version                  # must print v24.18.0
```

**Install every package the verifier checks.** Missing one is the single most
common failure: the gate dies at startup with `ERR_MODULE_NOT_FOUND` while every
unit test still passes.

```bash
for p in paperclip gate-proxy trace-store deadline-engine eval-harness \
         learning-loop firm-overview orchestration-eval \
         mcp-servers/firm-facade mcp-servers/legal-data; do
  pnpm -C "$p" install
done
```

**Prove the checkout is sound before going further:**

```bash
./bin/verify        # expect: PASS: PossibLaw credential-free validation (50 checks)
```

Three checks SKIP by design (live launcher preview, two-lawyer wall test,
provider delivery). **If this is not 50/50, stop and fix it here** — every path
below assumes a green checkout.

---

## Part 2 — Pick and authenticate a model variant

```bash
./bin/possiblaw --list-variants
```

Pick one and authenticate it *before* launching. Per-variant steps are in
`docs/operator-test-checklist.md` §B. For a cloud lane you will export the
provider key; for `ollama`/`llamacpp` you need the local model running.

Nothing below works without this — the agents have no model otherwise.

---

## Part 3 — Launch and confirm the trust pipeline

```bash
./bin/possiblaw --variant <slug>
# three prompts: org name, mission, variant → dashboard opens
```

**Confirm the gate is real, not just running.** Drive a gated court filing:

```bash
curl -s -X POST http://127.0.0.1:3801/egress/file_court_document \
  -H 'content-type: application/json' \
  -d '{"payload":{"caption":"Acme v. Globex","court":"D. Del.",
       "documentText":"The parties request a scheduling conference."},
       "meta":{"confidentiality":"standard"}}'
# → 202 pending_approval
```

Approve it in the dashboard, re-run with `"approvalId":"<id>"` added to `meta`,
then:

```bash
curl -s http://127.0.0.1:3801/receipts/verify
# → {"ok":true,"length":N,"head":"..."}
```

If `receipts/verify` returns `ok:true` and you saw the approval, the pipeline is
working. **This is the "viable working instance" the benchmark plan refers to.**

---

## Part 4 — Turn on matter access (C3)

New, and not covered anywhere else. **Enforcement is off by default** — the
roster ships deny-all, and enforcing an unpopulated roster would refuse every
human-gated egress.

### 4.1 Collect the real ids

```bash
# Lawyers — you need their EMAIL exactly as Paperclip has it
curl -s "http://127.0.0.1:3100/api/companies/<companyId>/members" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  | python3 -c 'import json,sys; [print(m["user"]["email"], m["user"]["id"]) for m in json.load(sys.stdin)["members"] if m.get("user")]'

# Matters — you need the IDENTIFIER (e.g. LEG-142), not the uuid
curl -s "http://127.0.0.1:3100/api/companies/<companyId>/issues" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(i.get("identifier"), i["title"][:50]) for i in (d if isinstance(d,list) else d.get("issues",[]))]'
```

### 4.2 Write the roster

Edit `companies/legal-operations/matter-access.json`:

```json
{
  "version": 1,
  "default": "deny",
  "enforcement": "off",
  "matterAccess": {
    "jane.doe@firm.com": ["LEG-142", "LEG-207"],
    "partner@firm.com": ["LEG-142"]
  },
  "decisionAuthority": {
    "MONEY_MOVEMENT": ["partner@firm.com"],
    "COURT_FILING": ["jane.doe@firm.com", "partner@firm.com"]
  }
}
```

**Two authorities, and they are independent.** `matterAccess` is *may this
person touch this matter's content*. `decisionAuthority` is *may this person
approve this class of decision*. A partner can hold `MONEY_MOVEMENT` without
being entitled to a matter — that is what keeps an ethical wall standing when
the partner is screened. The human gate shows only a hash, so they can approve a
wire on a matter they cannot read.

Valid boundaries: `THIRD_PARTY_EGRESS`, `CONFIDENTIAL_TO_CLOUD`, `COURT_FILING`,
`SIGNATURE`, `MONEY_MOVEMENT`, `IRREVERSIBLE_EXTERNAL_OP`.

### 4.3 Dry-run with enforcement off

Restart the launcher. Check the gate log:

```
matter_access loaded enforcement=off principals=2 document=450b1b4431f7
```

If instead the gate **refuses to start**, the roster did not resolve. That is
deliberate — it means an email or identifier matched zero or more than one
record, and guessing would bind an entitlement to someone you did not name. The
error names the offending value.

### 4.4 Turn it on

Only once every lawyer who needs a matter is listed for it. Set
`"enforcement": "on"` and restart.

> **Production requires authenticated mode.** An unauthenticated instance records
> the approver as `local-board` — a machine, not a person — and C3 rejects it.
> Launch with `--auth-mode authenticated`. See
> `docs/operator-test-checklist.md` §H for the two-lawyer setup.

### 4.5 Prove it works

Full procedure: `docs/operator-test-checklist.md` §I. The short version — an
entitled lawyer approves and the action performs; an unentitled one approves and
it is **refused at resume** with an `approver_not_entitled_to_matter` receipt.

The unentitled lawyer still sees "approved" in the dashboard. That is expected:
the gate cannot know who will approve until they have, so the check happens at
resume. The denial receipt and the issue comment are how they find out why.

---

## Part 5A — Local

Parts 1–4 are the whole local path. Stop with `Ctrl-C`; re-running reattaches to
a healthy server rather than starting a duplicate.

Local is for **one operator on a trusted workstation**. It is not multi-lawyer
safe: agents run as the same OS user and can read process and filesystem secrets.
Use it for development, benchmarks, and the C3 test — not for real client data.

---

## Part 5B — Azure

Azure is infrastructure for the same Docker Compose reference. There is no
ARM/Bicep template and no "Deploy to Azure" button.

**Firm's Azure administrator does this — not you:**

1. Dedicated resource group, VNet/subnet, **Ubuntu 24.04 LTS** VM in the firm's
   tenant. Trusted Launch with Secure Boot and vTPM, system-assigned managed
   identity, encrypted OS/data disks, approved RBAC.
2. **No public IP.** NSG denying unsolicited inbound. Access via Azure Bastion,
   firm VPN, or another approved private path. Restrict outbound provider traffic
   at the firm firewall or an authenticated egress proxy — an NSG is not a
   domain-aware egress control.
3. Key Vault for secrets, Recovery Services vault for backups. The Compose
   reference consumes **file-backed** secrets, so any Key Vault retrieval must
   write owner-readable files on encrypted storage and must never put values in
   `.env`, cloud-init output, or process arguments.

**Then you:**

4. Connect through the approved path. If it gives you SSH, forward the port for
   bootstrap only:
   ```bash
   ssh -L 3100:127.0.0.1:3100 <approved-azure-vm-ssh-target>
   ```
5. Install Docker Engine + Compose v2 from Docker's official Ubuntu
   instructions.
6. Run **Parts 1–4 on the VM** (clone, fnm, installs, `./bin/verify`, variant,
   launch, roster). The prerequisites do not change because the host did.
7. Reviewed TLS reverse proxy / private ingress in front of loopback Paperclip,
   integrated with the firm's identity, Conditional Access, logging and IR
   standards.
8. Run the isolation eval **on that exact VM**, enable backup immutability only
   after a restore test, and record image digests, firewall policy, backup
   receipt and results.

**Tenancy is not an attestation.** Not production-approved until the release
gates and the firm's legal, security, privacy, retention and provider reviews
pass. See README → "Release gates".

---

## Part 5C — Hostinger

> **Do not use Hostinger's one-click Paperclip application.** It deploys
> *upstream* Paperclip with none of PossibLaw's company package, Gate Proxy,
> capability map, receipt custody or pinned layer. Selecting it produces
> something that looks right and enforces nothing.

1. Dedicated VPS on Hostinger's **Ubuntu 24.04 Docker** template. Size it for the
   control plane, PostgreSQL, gate, two workers, model gateways, builds, backups
   and expected concurrency — measure the firm's workload rather than guessing.
2. In hPanel, restrict the VPS firewall to approved administrative sources and
   required TLS ingress. **Port 3100 stays closed.**
3. Connect and confirm Compose:
   ```bash
   ssh <admin-user>@<vps-ip>
   docker version && docker compose version
   ```
4. **Clone the full repository on the VPS** and run Parts 1–4 there. Pasting only
   `compose.yaml` into Docker Manager is *not* a complete install — the build uses
   repository-relative contexts and generated files.
5. Tunnel from your workstation for the board claim and bootstrap:
   ```bash
   ssh -L 3100:127.0.0.1:3100 <admin-user>@<vps-ip>
   # then open http://127.0.0.1:3100
   ```
6. Reviewed TLS reverse proxy, encrypted off-host backups, monitoring, patching,
   explicit provider egress restrictions.
7. `./scripts/run-isolation-eval.sh`, a restart test, and a **restore drill**
   before any real matter data.

Hostinger's Docker Manager supports custom Compose projects, but PossibLaw does
not publish the self-contained images or bootstrap automation a truthful
one-click button needs. One-click remains future work.

---

## Part 6 — Run benchmarks

Once `receipts/verify` returns `ok:true`:

```bash
./bin/eval run --benchmark cuad     # works today
./bin/eval run --benchmark lab      # Harvey LAB
```

Only `cuad` and `lab` are registered. LEDGAR, UNFAIR-ToS, MAUD and ACORD are
staged but have no adapter; LegalBench is not staged; PrinzBench cannot be
self-run. Plan and rationale: `docs/benchmarks.md`.

For the orchestration A/B — the eval that actually tests our thesis rather than
the model's — you additionally need `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
`uv`, `pandoc`, and a **disposable** instance. Runbook:
`docs/operator-test-checklist.md` §G.

---

## When something breaks

| Symptom | Cause |
|---|---|
| `bin/verify` fails on the first check | Node is not exactly 24.18.0. `fnm use`. |
| Gate dies at startup, `ERR_MODULE_NOT_FOUND` | A package is missing `node_modules` — usually `trace-store`, which the gate links. Re-run the Part 1 install loop. |
| Gate refuses to start, matter-access error | An email or matter identifier matched zero or several records. Deliberate: fix the roster. |
| Approval shows approved but nothing happens | C3 refused at resume. Read the denial receipt and the issue comment. |
| Everything approves regardless of the roster | `enforcement` is still `"off"`. |
| Approver rejected as `local-board` | Instance is not authenticated. Relaunch `--auth-mode authenticated`. |
| Duplicate servers / port already in use | Something already holds the port. Use `--port`/`--gate-port` and a fresh `--data-dir`. Kill by recorded PID or port — **never `pkill -f`**, which matches your own shell. |
