# PossibLaw — a proof-of-concept layer on paperclip for operating a legal business with AI

PossibLaw is an open-source **proof-of-concept** (PoC) that shows how to wire AI agents into the day-to-day operations of a small legal practice. It is built as a *layer* on top of [paperclip](https://github.com/paperclipai/paperclip), not a fork of it. All net-new PossibLaw logic lives under `layer/`; the upstream paperclip control plane is wired in as a git submodule and is never modified.

> **DISCLAIMER: PossibLaw does not practice law. It is open-source tooling. Non-lawyer operators should consult a licensed lawyer before finalizing any work product. Treat all output as a starting point.**

---

## What this is / what this isn't

**This is:**
- A PoC. Proof of concept. Not production software.
- Public and open-source from day 1 (Apache 2.0).
- A thin layer on paperclip — agents, skills, workflows, guardrails, MCP integrations — all in `layer/`.
- A demonstration of how a legal AI routing hierarchy (Chief Counsel → Lead → Specialist) can work.

**This is NOT:**
- A productized legal-services platform.
- A helm chart, Terraform module, or multi-tenant deployment.
- A fork of paperclip. Do not rename or patch paperclip internals.
- Legal advice.

---

## Quick start

```bash
git clone --recurse-submodules <repo-url>
cd possiblaw
pnpm install
pnpm build
bin/possiblaw run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term"
```

> Note: the `bin/possiblaw` CLI is a thin shim. Run `bin/possiblaw.dev` for dev mode (uses tsx, no build step required).

---

## Status

Sprint 0 + Sprint 1a complete. See [CHANGELOG.md](CHANGELOG.md).

---

## Architecture

PossibLaw adds a `layer/` directory on top of paperclip's control-plane primitives. The `layer/` tree holds agents (routing hierarchy + specialists), skills, workflows, MCP server configs, guardrails, and evals. The `bin/possiblaw` CLI delegates to paperclip's runtime for infrastructure concerns and adds layer-specific commands. Sprint 1a runs standalone against `layer/` content; full paperclip integration is wired progressively from Sprint 2 onward. See [FOUNDATION.md](FOUNDATION.md) for the detailed wiring design and paperclip extension-point inventory.

---

## License

PossibLaw is licensed under the **Apache License 2.0**. See [LICENSE](LICENSE).

paperclip's MIT license is preserved in [NOTICE](NOTICE) and in `paperclip/LICENSE`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
