---
name: legal-oss-compliance
description: Run an open source license compliance check against a dependency list, a single library, or outbound code — classify by license family, map obligations to the deployment model, and route findings for attorney review.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: ip-legal/skills/oss-review/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/ip-legal/skills/oss-review/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# OSS License Compliance

Use this skill to run a first-pass open source license compliance check against a dependency list, a single library, or outbound code the operator is preparing to release. The output is a memo a responsible attorney (or an engineer with attorney access) can act on — comply, replace, remove, seek legal review, or seek a commercial license.

## Purpose

Tell the operator what licenses are in their dependency tree, what obligations those licenses trigger given how the code will be deployed, and what to do about each one.

This is a first-pass classification. Copyleft analysis depends on the deployment model, the degree of linking, the jurisdiction, and sometimes on legal questions that have not been tested in court (notably AGPL's "interacts over a network" and GPL-3.0's patent clause). For anything that classifies as strong copyleft or license-unknown, the responsible attorney evaluates before the dependency ships or the code is released. This skill reports what it found; the responsible attorney decides what to do.

## Precondition: Load the Operator Profile

Before scanning dependencies, read the operator's OSS policy (if one exists) and the operator's preferred attribution and approval routing. If the operator has not documented an OSS policy, this skill can still run but every finding tagged "strong copyleft" or "license-unknown" must escalate.

The operator profile should tell you:

- Who owns OSS review on the operator's team (often engineering with legal sign-off).
- Escalation routing for copyleft obligations.
- The work-product header to prepend to the memo.
- The list of accepted, review-required, and banned licenses (if maintained).

If the operator profile is missing, escalate before producing GREEN findings.

## Workflow

### Step 1: What's the Scope?

Ask, or infer from what the operator provided:

> What are we reviewing?
>
> 1. **A dependency list** — `package.json`, `requirements.txt`, `go.mod`, `Gemfile`, `Cargo.toml`, `pom.xml`, an SBOM (SPDX or CycloneDX), or a lockfile.
> 2. **A single library** — one specific package being considered.
> 3. **Operator code** — code the operator plans to open-source and needs to check for embedded licenses.

The analysis path differs:

- Dependency list → classify every entry, roll up obligations.
- Single library → classify one package and walk its transitive dependencies if available.
- Outbound code → check what is embedded (direct and transitive), check whether the chosen outbound license is compatible with all embedded licenses, and check that LICENSE and NOTICE files are correct.

### Step 2: What's the Deployment Model?

This is the single most important input after the license list — the same library carries different obligations depending on how the software is delivered. Ask:

> How will this be deployed?
>
> 1. **SaaS / hosted service** — users access over a network; nothing ships to the user.
> 2. **Distributed binary** — operator ships compiled code to users (desktop app, mobile app, on-prem server, CLI tool).
> 3. **Internal only** — used only inside the operator's organization, not distributed outside.
> 4. **Embedded / firmware** — shipped in hardware or as closed-system firmware.

| Deployment | Licenses that materially matter |
|---|---|
| SaaS | AGPL (network trigger), permissive attribution in any UI, SSPL / BUSL / Elastic License if repurposing as a competing service |
| Distributed binary | GPL, LGPL, MPL, EPL (all trigger on distribution), permissive attribution |
| Internal only | Most copyleft does not trigger — no distribution. Permissive attribution still good hygiene. AGPL still triggers if users outside the operator interact over the network. |
| Embedded / firmware | GPL is especially hard to comply with here (source disclosure, reproducible build, installation information in some cases). Plan for this before shipping, not after. |

Flag the deployment model in the output memo — the same dependency list reviewed against "SaaS" versus "distributed binary" yields different obligations.

### Step 3: Classify Each Dependency

For every package, determine the license. Read the actual license text, not just the metadata — LICENSE files can be wrong (the file says MIT but the headers say GPL; the README claims Apache but there is no license file), and package manager metadata can be stale.

Classify into:

| Bucket | Examples | Key obligations |
|---|---|---|
| **Permissive** | MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, Zlib, Unlicense | Attribution, preserve license text, Apache-2.0 adds patent grant and NOTICE requirement |
| **Weak copyleft** | LGPL-2.1, LGPL-3.0, MPL-2.0, EPL-1.0, EPL-2.0, CDDL | File-level or library-level source disclosure; linking rules vary |
| **Strong copyleft** | GPL-2.0, GPL-3.0, AGPL-3.0, OSL, EUPL (depending on version) | Broad source disclosure; AGPL extends to network use |
| **Public domain / dedication** | CC0, Unlicense, WTFPL | Typically no obligations, but some are contested in jurisdictions that do not recognize dedication to public domain |
| **Non-OSI source-available** | SSPL, BUSL, Commons Clause, Elastic License, Confluent Community, fair-source family | Not open source — restrict commercial use, competing-service use, or both. Read the specific license. |
| **Other / custom / unknown** | vendor-specific, proprietary, missing license file, license conflict between file and headers | Stop — do not treat as permissive by default |

Flag separately:

- **Dual-licensed packages** — which license is the operator using? The choice may change obligations.
- **Deprecated packages** — the package is no longer maintained; is there a supported replacement?
- **Packages with a copyleft transitive dependency** — the top-level license is permissive but a transitive dependency is copyleft.
- **Packages that changed license recently** — Redis, MongoDB, Elastic, HashiCorp; verify the pinned version is under the license the operator believes.

### Step 4: Map Obligations to the Deployment Model

For each classified dependency, state what the deployment model triggers:

```markdown
### [package@version] — [License]

**Classification:** [Permissive / Weak copyleft / Strong copyleft / Public domain / Non-OSI / Unknown]

**Obligations for our deployment ([SaaS / binary / internal / embedded]):**

- [ ] [Specific obligation — e.g., "Include attribution in a NOTICES file shipped with the app"]
- [ ] [e.g., "If we modify and distribute, publish source of our modifications"]
- [ ] [e.g., "AGPL network trigger — if users access our modified version over a network, source must be offered to them"]

**Risk:** Critical | High | Medium | Low

**Recommendation:** [Comply with obligations | Replace with [alternative] | Remove | Attorney review before shipping | Seek commercial license from [vendor]]
```

#### How is the copyleft dependency consumed?

The linking relationship determines whether copyleft actually triggers. Ask or determine:

- **Static linking / compilation together:** The works are combined into one binary. Strong signal that copyleft triggers (LGPL "work based on the Library," GPL derivative work).
- **Dynamic linking / shared library:** The works remain separable at runtime. LGPL explicitly permits this ("work that uses the Library"). GPL's position is contested (FSF says derivative, others disagree).
- **Header inclusion / inline functions:** Can create a derivative work depending on how much is included.
- **Subprocess / IPC:** Separate processes communicating over well-defined interfaces. Generally not derivative.
- **Network API call:** For most licenses, no. For AGPL, the network-interaction clause means serving the software over a network IS distribution. In a microservices architecture, an AGPL component behind an API still triggers.
- **File-scope copyleft (MPL):** Only the modified files carry copyleft, not the whole work. Check whether any copyleft files were modified.

The severity rating depends on this. "LGPL — weak copyleft, linking rules vary" without the linking analysis is the answer that gets an engineer sued. Static-linked LGPL in a proprietary product is Critical. Dynamic-linked LGPL is Low. Same license, opposite rating.

#### Severity calibration

| Level | Means |
|---|---|
| Critical | Strong copyleft in a deployment that triggers it (for example GPL in a distributed binary, AGPL in a SaaS). Non-OSI license that the business model actually conflicts with (for example SSPL while the operator is building a managed service). License cannot be determined and the package is load-bearing. |
| High | Weak copyleft with obligations the operator has not set up for (file-level disclosure, NOTICE requirements). Dual-licensed where the chosen license is ambiguous. License file says one thing, headers say another. |
| Medium | Permissive with attribution requirements that have not been wired into the build (missing NOTICES file, missing LICENSE in distribution). Transitive copyleft in a position that may or may not trigger, depending on how the library is consumed. |
| Low | Permissive with obligations already satisfied. Copyleft in a deployment model that does not trigger it (for example GPL library used internally only, with no redistribution). |

### Step 5: Flag Failure Modes

Call out any of the following in a top-of-memo section:

- **License unknown** — classify as "needs review," not permissive. An unclassified dependency should stop a ship decision, not slip through.
- **License file conflicts with file headers** — read both and report the conflict.
- **Incompatible combinations** — GPL-2.0-only plus Apache-2.0 is a known historical incompatibility; check MPL, EPL, and GPL combinations carefully.
- **Non-OSI licenses posing as open source** — SSPL, BUSL, Commons Clause, Elastic License, Confluent Community. Read the license; do not rely on a "open source" badge in a repo description.
- **License changes** — if a prior version was permissive and the current version is source-available, the pin matters.

### Step 6: Outbound Check (If Reviewing Operator Code Before Open-Sourcing)

If the operator is preparing to open-source code:

- Confirm the chosen outbound license is compatible with every embedded dependency's license (for example you cannot release under MIT if you have embedded GPL code — the combined work must be GPL).
- Confirm LICENSE file is present and correct.
- Confirm NOTICE file is present and lists required attributions (Apache-2.0 and others).
- Confirm third-party license texts are bundled where required.
- Confirm no proprietary or confidential code, no customer data, and no embedded credentials in the repository history.
- Confirm trademark and brand policy for any project name (separate from the copyright license).

### Step 7: Assemble the Memo

Prepend the operator's work-product header. This memo and any dependency list reviewed may be privileged, confidential, or both. The output inherits that status from the source. Distribute only within the privilege circle; strip the work-product header before any external delivery (including before attaching the memo to an engineering ticket outside the privilege circle).

#### No silent supplement

If a research query to the operator's configured legal research tool returns few or no results for a rule the memo needs (enforceability of AGPL's network trigger in a given jurisdiction, scope of GPL-3.0's patent grant, latest license text for a recently-relicensed package), report what was found and stop. Do not fill the gap from web search or model knowledge without asking. Say:

> The search returned [N] results from [tool]. Coverage appears thin for [rule / license / jurisdiction]. Options: (1) broaden the search query, (2) try a different research tool, (3) search the web — results will be tagged `[web search — verify]` and should be checked against a primary source before relying, or (4) flag as unverified and stop. Which would you like?

The responsible attorney decides whether to accept lower-confidence sources.

#### Source attribution

Where the memo cites a license text, a court decision interpreting a license, or guidance from a steward (FSF, OSI, SPDX, SFLC), tag the citation: `[OSI]`, `[SPDX]`, `[FSF]`, `[SFC/SFLC]`, `[Westlaw]`, or the connector name for citations retrieved from a connector; `[web search — verify]` for web-search citations; `[model knowledge — verify]` for citations recalled from training data; `[user provided]` for license text read directly from the repo. Citations tagged `verify` carry higher fabrication risk. Never strip or collapse the tags.

```markdown
[WORK-PRODUCT HEADER — per operator output convention]

# OSS Review: [Project / Dependency List / Package]

**Reviewed:** [date]
**Scope:** [Dependency list / Single library / Outbound code]
**Deployment model:** [SaaS / Binary / Internal / Embedded]

---

## Bottom line

[Two sentences. Can this ship? What has to happen first?]

**Packages reviewed:** [N]
**By classification:** [N permissive, N weak copyleft, N strong copyleft, N public domain, N non-OSI, N unknown]
**Issues:** [N Critical] [N High] [N Medium] [N Low]

**Approval needed from:** [name, per operator profile]

---

## Top-of-memo flags

[License-unknown list, license-conflict list, non-OSI-posing-as-OSS list, incompatible combinations]

---

## By package

[Blocks from Step 4, grouped by severity]

---

## Jurisdiction note

OSS license enforceability varies — AGPL's network trigger has not been broadly tested in court, GPL-3.0's patent clause reads differently under US versus EU patent law, and dedications to public domain are not universally recognized. State the governing-law choice for any downstream distribution (for example vendor agreements incorporating the code) and flag jurisdictions the operator profile marks as escalate.

---

## Outbound check (if applicable)

[From Step 6]

---

## Approval routing

[From operator profile — who approves, what triggers automatic escalation]
```

## Decision Posture

When a license cannot be confidently classified, flag it as "needs review" — do not call it permissive. Under-classifying license risk is a one-way door: a ship decision made on a permissive-by-default assumption becomes a source-disclosure obligation or an injunction months later. Over-flagging is a two-way door — the attorney narrows the list in review.

Likewise, when the copyleft-trigger analysis turns on a contested question (AGPL's "interacts over a network," GPL-3.0's "conveying," the scope of LGPL linking), flag for attorney review and surface the factors cutting both ways.

## Quality Checks Before Delivering

- [ ] Operator profile and any OSS policy were loaded.
- [ ] Deployment model was established before classifying obligations.
- [ ] Every dependency has a classification, including transitives where available.
- [ ] License-unknown packages are flagged, not defaulted to permissive.
- [ ] License text was read (not just metadata) for any copyleft or non-OSI finding.
- [ ] Source tags applied to citations; no stripped `verify` tags.
- [ ] Approver named per operator profile.
- [ ] Output marked with the work-product header.

## Evals

**Given** a Node.js `package.json` with one direct AGPL-3.0 dependency, a deployment model of "SaaS / hosted service," and an operator profile with AGPL on the "needs review" list,
**When** the skill runs,
**Then** the AGPL package is flagged Critical, the memo states that the AGPL network trigger applies in a SaaS deployment, and the recommendation is "Attorney review before shipping" rather than "Comply with obligations."

**Given** a Python `requirements.txt` that pins a package whose current published version is under the SSPL but whose prior version was under the Apache-2.0 license,
**When** the skill runs,
**Then** the memo classifies the package as non-OSI source-available, flags the license-change risk in the top-of-memo section, and asks whether the operator intends to remain on the older Apache-2.0 version or accept the SSPL.

**Given** an outbound check on operator code that the operator plans to release under MIT but that statically links an LGPL-2.1 library,
**When** the skill runs Step 6,
**Then** the memo flags the incompatibility, names "static linking" as the consumption mode, marks the finding Critical, and recommends either dynamic linking with the LGPL library or selecting a license-compatible outbound license — and does not silently approve the MIT release.
