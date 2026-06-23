# Eval Harness + Finishing Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a terminal-runnable eval harness for PossibLaw agents/skills (all 10 variants, deterministic + all-pass rubric grading) and land the three finishing items (citation-gate enforcement, repo hygiene, doc drift), then merge to `main`.

**Architecture:** New standalone TypeScript component `eval-harness/` (sibling to `gate-proxy/`, same `tsx` + `node:test` stack, colocated `*.test.ts`). It sources model config from `companies/legal-operations/variants.yaml`, invokes models via four headless drivers (claude/codex/gemini/opencode) covering all ten variants, grades output, and writes md+json reports. Cases live in the package (`companies/legal-operations/evals/cases/`). The harness never imports paperclip internals. Items 1–3 are independent edits to `gate-proxy/`, the repo root, and docs.

**Tech Stack:** TypeScript, `tsx`, `node:test`, `node:assert/strict`, YAML (`yaml` package, already a paperclip/dep convention), bash launcher shim.

## Global Constraints

- Node test command per component: `node --import tsx --test "src/**/*.test.ts"` (matches `gate-proxy/package.json`). Tests are **colocated** as `src/**/*.test.ts`.
- `eval-harness/` is ESM TypeScript; imports use explicit `.ts` extensions (matches gate-proxy, e.g. `import {...} from "./types.ts"`).
- The paperclip submodule is **never modified** and **never imported**.
- Do not commit `.agent/*`, `.claude/history.md`, or `eval-harness/results/*` (gitignored).
- Receipts/payload invariant in gate-proxy is sacred: citation-gate receipts carry **counts + shas only, never payload text** (matches existing `citation-registry.ts`).
- Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- All work happens on branch `feat/eval-harness` (already created).

---

## File Structure

**Created:**
- `eval-harness/package.json`, `eval-harness/tsconfig.json`
- `eval-harness/src/types.ts` — core `Case`, `Grading` types
- `eval-harness/src/cases/parse.ts` (+ `parse.test.ts`) — markdown case parser
- `eval-harness/src/variants.ts` (+ `variants.test.ts`) — load `variants.yaml`, `resolveModel`
- `eval-harness/src/model-client/types.ts` — `ModelClient`, `ResolvedModel`, `ModelResult`
- `eval-harness/src/model-client/mock.ts` — test double
- `eval-harness/src/model-client/index.ts` — real client (4-driver dispatch)
- `eval-harness/src/model-client/drivers/{claude,codex,gemini,opencode}.ts`
- `eval-harness/src/grade/tokenf1.ts` (+ test) — similarity metric
- `eval-harness/src/grade/deterministic.ts` (+ test) — regex/contains/golden/schema
- `eval-harness/src/grade/rubric.ts` (+ test) — all-pass LLM-judge
- `eval-harness/src/grade/judge-prompt.ts` — judge prompt template
- `eval-harness/src/report/index.ts` (+ test) — md + json render/write
- `eval-harness/src/runner.ts` (+ test) — orchestration
- `eval-harness/src/adapters/cuad.ts` (+ test) — CUAD fixtures → Case[]
- `eval-harness/src/adapters/lab.ts` — Harvey LAB adapter stub (interface only)
- `eval-harness/src/coverage.ts` (+ test) — generate COVERAGE.md
- `eval-harness/src/index.ts` — CLI entry
- `bin/eval` — bash shim
- `companies/legal-operations/evals/cases/*.md` — ~8 seed cases
- `companies/legal-operations/evals/COVERAGE.md` — generated
- `gate-proxy/src/document-text.ts` (+ test) — tool→document-field extraction
- `gate-proxy/src/citation-gate.test.ts` — enforcement tests

**Modified:**
- `gate-proxy/src/server.ts:408-602` — add citation-gate enforcement + deps destructure
- `README.md` — flip citation "advisory → blocking" claim
- `CHANGELOG.md` — new entry
- `CLAUDE.md` — fix dry-run command, Code Map, test count
- `.gitignore` — cover `possiblaw/`, `.agents/`, `.pnpm-store/`, `eval-harness/results/`

---

# Workstream A — Phase 2 citation-gate enforcement

### Task A1: Document-text extraction helper

**Files:**
- Create: `gate-proxy/src/document-text.ts`
- Test: `gate-proxy/src/document-text.test.ts`

**Interfaces:**
- Produces: `extractDocumentText(tool: string, payload: Record<string, unknown>): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// gate-proxy/src/document-text.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDocumentText } from "./document-text.ts";

test("extracts the mapped field for each gated tool", () => {
  assert.equal(extractDocumentText("file_court_document", { documentText: "Brief re Roe v. Wade" }), "Brief re Roe v. Wade");
  assert.equal(extractDocumentText("upload_document", { content: "memo body" }), "memo body");
  assert.equal(extractDocumentText("send_email", { body: "email body" }), "email body");
});

test("returns null when the document field is absent or not a string", () => {
  assert.equal(extractDocumentText("file_court_document", {}), null);
  assert.equal(extractDocumentText("file_court_document", { documentText: 42 }), null);
  assert.equal(extractDocumentText("send_email", { subject: "no body here" }), null);
});

test("returns null for tools that carry no reviewable document", () => {
  assert.equal(extractDocumentText("send_payment", { amount: 100 }), null);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd gate-proxy && node --import tsx --test src/document-text.test.ts`
Expected: FAIL — `extractDocumentText is not a function`.

- [ ] **Step 3: Implement**

```ts
// gate-proxy/src/document-text.ts
// Maps a citation-gated egress tool to the payload field that carries the
// reviewable document text the citation gate hashes. Field names mirror the
// payload shapes the corresponding performers in connectors.ts egress.
const DOCUMENT_TEXT_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  file_court_document: "documentText",
  upload_document: "content",
  send_email: "body",
  share_external: "content",
});

export function extractDocumentText(tool: string, payload: Record<string, unknown>): string | null {
  const field = DOCUMENT_TEXT_FIELDS[tool];
  if (field === undefined) return null;
  const value = payload[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd gate-proxy && node --import tsx --test src/document-text.test.ts`
Expected: PASS (3 tests).

> **Note for executor:** confirm the field names against the performer payload shapes in `gate-proxy/src/connectors.ts`; if a performer reads a different field (e.g. `send_email` uses `bodyText`), align both the map here and the test. The map must read the same field the performer egresses.

- [ ] **Step 5: Commit**

```bash
git add gate-proxy/src/document-text.ts gate-proxy/src/document-text.test.ts
git commit -m "feat(gate-proxy): document-text extraction for citation gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A2: Enforce citation gate in `handleEgress`

**Files:**
- Modify: `gate-proxy/src/server.ts` (destructure ~414; insert block after `decide()` ~596)
- Test: `gate-proxy/src/citation-gate.test.ts`

**Interfaces:**
- Consumes: `extractDocumentText` (A1), `CitationRegistry.has(docSha)`, `documentSha256` from `./citations.ts`, `policy.citationGate.boundaries`.

- [ ] **Step 1: Write the failing test** — model it on the existing `server.test.ts` harness (start a server with deps incl. a `CitationRegistry`, POST `/egress/file_court_document`).

```ts
// gate-proxy/src/citation-gate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, postEgress, registerCitation } from "./test-helpers.ts"; // reuse/extend existing server.test harness

test("gated boundary with no registered citation verification is blocked 403", async () => {
  const srv = await startTestServer();
  const res = await postEgress(srv, "file_court_document", { documentText: "Plaintiff cites 410 U. S. 113." });
  assert.equal(res.status, 403);
  assert.match(res.body.reason, /citation_gate/);
  await srv.close();
});

test("gated boundary with a registered, passing citation verification proceeds past the gate", async () => {
  const srv = await startTestServer();
  const doc = "Plaintiff cites 410 U. S. 113.";
  await registerCitation(srv, doc, [{ citation: "410 U.S. 113", match: "Yes" }]);
  const res = await postEgress(srv, "file_court_document", { documentText: doc });
  assert.notEqual(res.status, 403); // reaches human gate / allow, not citation-blocked
  await srv.close();
});

test("gated boundary with no reviewable document text fails closed 403", async () => {
  const srv = await startTestServer();
  const res = await postEgress(srv, "file_court_document", { caption: "no body" });
  assert.equal(res.status, 403);
  assert.match(res.body.reason, /citation_gate.*document/);
  await srv.close();
});

test("non-gated boundary is unaffected by the citation gate", async () => {
  const srv = await startTestServer();
  const res = await postEgress(srv, "send_payment", { amount: 1 });
  assert.notMatch(JSON.stringify(res.body), /citation_gate/);
  await srv.close();
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd gate-proxy && node --import tsx --test src/citation-gate.test.ts`
Expected: FAIL — first test gets a non-403 (gate not enforced yet).

> If `test-helpers.ts` does not exist, extract the server-start/post helpers from the existing `server.test.ts` into `src/test-helpers.ts` first (pure refactor, no behavior change; re-run `node --import tsx --test "src/**/*.test.ts"` to confirm 207 still pass), then write this test.

- [ ] **Step 3: Implement — add to the destructure and insert the gate**

In `gate-proxy/src/server.ts`, line ~414 add `citationRegistry`:

```ts
const { policy, receipts, client, performers, localModelAvailable, citationRegistry, log } = deps;
```

Add import near the top (with the other `./` imports):

```ts
import { documentSha256 } from "./citations.ts";
import { extractDocumentText } from "./document-text.ts";
```

Insert immediately after `const decision = decide(boundary, policy);` (~line 596) and the `claimedConfidentiality` line, **before** `switch (decision)`:

```ts
  // 5b. Citation gate (OUTBOUND_QUALITY): on configured boundaries, require a
  // registered, passing citation verification bound to the document's sha
  // before any dispatch (including the human gate). Fail-closed: a gated
  // boundary whose payload carries no reviewable document text is blocked.
  if (boundary !== null && policy.citationGate.boundaries.includes(boundary)) {
    const documentText = extractDocumentText(tool, payload);
    if (documentText === null) {
      receipts.append({
        kind: "egress", tool, boundary, decision, outcome: "blocked",
        payloadSha256, agentId: meta.agentId, issueId: meta.issueId, approvalId: meta.approvalId,
        meta: { reason: "citation_gate_no_document", claimedConfidentiality },
      });
      sendJson(res, 403, { decision: "block", reason: "citation_gate: no reviewable document text on a citation-gated boundary" });
      return;
    }
    const docSha = documentSha256(documentText);
    if (!citationRegistry.has(docSha)) {
      receipts.append({
        kind: "egress", tool, boundary, decision, outcome: "blocked",
        payloadSha256, agentId: meta.agentId, issueId: meta.issueId, approvalId: meta.approvalId,
        meta: { reason: "citation_gate_unverified", documentSha256: docSha, claimedConfidentiality },
      });
      sendJson(res, 403, { decision: "block", reason: "citation_gate: no registered citation verification for this document" });
      return;
    }
  }
```

- [ ] **Step 4: Run the full suite**

Run: `cd gate-proxy && node --import tsx --test "src/**/*.test.ts"`
Expected: PASS — all prior tests (207) + 4 new citation-gate tests.

- [ ] **Step 5: Typecheck + commit**

Run: `cd gate-proxy && npx tsc --noEmit`
Expected: no errors.

```bash
git add gate-proxy/src/server.ts gate-proxy/src/citation-gate.test.ts gate-proxy/src/test-helpers.ts
git commit -m "feat(gate-proxy): enforce citation gate on court/third-party egress (Phase 2)

Blocks gated-boundary egress until a payload-bound citation verification is
registered; fails closed when no reviewable document text is present.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task A3: Flip the README/CHANGELOG claim

**Files:** Modify `README.md` (citation row ~line 30), `CHANGELOG.md` (new entry).

- [ ] **Step 1:** In `README.md`, change the citation verification row from "**Advisory today → blocking in Phase 2** … not yet a gate." to state it is now **enforced**: court/third-party egress is blocked until a registered, payload-bound, deterministically re-checked citation verification exists. Keep the honest caveat that verification itself is an agent step.
- [ ] **Step 2:** Add a `CHANGELOG.md` entry (next version, dated 2026-06-22) summarizing Phase 2 citation-gate enforcement.
- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: citation gate now enforced (Phase 2), not advisory

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Workstream B — Repo hygiene

### Task B1: Remove cruft, fix `.gitignore`

**Files:** Delete `possiblaw/` (nested clone), `.agents/`; modify `.gitignore`.

- [ ] **Step 1: Verify the nested clone is a stale duplicate (not unique work)**

Run: `git -C possiblaw rev-parse --show-toplevel && git -C possiblaw status --short && git -C possiblaw log --oneline -1`
Expected: toplevel is the nested path; confirm it is the same repo at an old commit (`67782d0`). If `git -C possiblaw status` shows **uncommitted unique changes**, STOP and report instead of deleting.

- [ ] **Step 2: Verify `.agents/` holds nothing unique**

Run: `find .agents -type f`
Expected: only stray `skills/` content already represented under the package. If anything unique, STOP and report.

- [ ] **Step 3: Confirm the paperclip submodule is dirty only with build artifacts**

Run: `git -C paperclip status --short | head`
Expected: only untracked build/overlay output (e.g. `ui/dist`), no tracked modifications. If tracked files are modified, STOP and report (submodule must stay unmodified).

- [ ] **Step 4: Remove cruft and ignore it**

```bash
rm -rf possiblaw .agents
```

Add to `.gitignore`:

```
# stray local clones / caches (never tracked)
/possiblaw/
/.agents/
/.pnpm-store/
# eval-harness run outputs
/eval-harness/results/
```

- [ ] **Step 5: Verify clean status + commit**

Run: `git status --short`
Expected: no `possiblaw/`, `.agents/`, `.pnpm-store/` entries; only intended changes.

```bash
git add .gitignore
git commit -m "chore: remove stale nested clone + stray .agents, ignore local caches

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Workstream C — Doc drift

### Task C1: Fix CLAUDE.md drift

**Files:** Modify `CLAUDE.md`.

- [ ] **Step 1:** In the Commands section, fix the dry-run command to include `--mission` (the launcher now requires it in `--non-interactive`):
  `./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "smoke test"`
- [ ] **Step 2:** In the Code Map, add `gate-proxy/` (egress trust proxy; `pnpm -C gate-proxy test`) and `eval-harness/` (eval CLI; `pnpm -C eval-harness test`).
- [ ] **Step 3:** Correct any stale gate-proxy test count references to the current count (run `cd gate-proxy && node --import tsx --test "src/**/*.test.ts" 2>&1 | tail -3` to get the number).
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): fix dry-run command, add gate-proxy + eval-harness to code map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Workstream D — Eval harness

### Task D1: Scaffold `eval-harness/` + core types + bin shim

**Files:** Create `eval-harness/package.json`, `eval-harness/tsconfig.json`, `eval-harness/src/types.ts`, `bin/eval`.

**Interfaces (Produces — used by all later D tasks):**

```ts
// eval-harness/src/types.ts
export type GradingMode = "deterministic" | "rubric";
export type CheckType = "regex" | "contains" | "golden" | "schema";

export interface DeterministicCheck {
  id: string; type: CheckType;
  pattern?: string;      // regex
  value?: string;        // contains | golden
  threshold?: number;    // golden similarity pass threshold (default 0.8)
}
export interface RubricCriterion { id: string; prompt: string; }
export interface Grading {
  mode: GradingMode;
  checks?: DeterministicCheck[];
  rubric?: { judge_model: string; pass_rule: "all"; criteria: RubricCriterion[] };
}
export interface Case {
  slug: string;
  target: string;
  targetType: "agent" | "skill";
  project?: string;
  lane?: string;
  input_brief: string;
  documents: string[];
  grading: Grading;
  source: { kind: "local" | "benchmark" | "external"; name?: string };
  metadata?: Record<string, unknown>;
  body?: string;
}
```

- [ ] **Step 1:** Create `eval-harness/package.json`:

```json
{
  "name": "@possiblaw/eval-harness",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --import tsx --test \"src/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "eval": "tsx src/index.ts"
  },
  "dependencies": { "yaml": "^2.4.0" },
  "devDependencies": { "tsx": "^4.0.0", "typescript": "^5.4.0", "@types/node": "^20.0.0" }
}
```

- [ ] **Step 2:** Create `eval-harness/tsconfig.json` (copy `gate-proxy/tsconfig.json`; keep `"module"/"moduleResolution"` and `allowImportingTsExtensions` settings identical).
- [ ] **Step 3:** Create `eval-harness/src/types.ts` with the block above.
- [ ] **Step 4:** Create `bin/eval`:

```bash
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec pnpm -C "$REPO_ROOT/eval-harness" exec tsx src/index.ts "$@"
```

Run: `chmod +x bin/eval && bash -n bin/eval` → Expected: no output (valid).

- [ ] **Step 5:** Install + smoke: `pnpm -C eval-harness install` then `pnpm -C eval-harness typecheck` → Expected: no errors.
- [ ] **Step 6: Commit**

```bash
git add eval-harness/package.json eval-harness/tsconfig.json eval-harness/src/types.ts bin/eval eval-harness/pnpm-lock.yaml
git commit -m "feat(eval-harness): scaffold component + core Case types + bin/eval shim

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task D2: Case parser

**Files:** Create `eval-harness/src/cases/parse.ts`, `eval-harness/src/cases/parse.test.ts`.

**Interfaces:**
- Consumes: `Case` (D1).
- Produces: `parseCase(markdown: string, slugFallback: string): Case` (throws `CaseParseError` on invalid frontmatter); `loadCasesForTarget(casesDir: string, target: string): Case[]`.

- [ ] **Step 1: Write the failing test**

```ts
// eval-harness/src/cases/parse.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCase, CaseParseError } from "./parse.ts";

const DET = `---
slug: nda-gov-law
target: nda-drafter
targetType: agent
lane: drafting
input_brief: Draft a mutual NDA, Delaware law.
grading:
  mode: deterministic
  checks:
    - id: gov-law
      type: regex
      pattern: "(?i)State of Delaware"
source: { kind: local }
---
free text`;

test("parses a deterministic case with defaults", () => {
  const c = parseCase(DET, "fallback");
  assert.equal(c.slug, "nda-gov-law");
  assert.equal(c.targetType, "agent");
  assert.equal(c.grading.mode, "deterministic");
  assert.equal(c.grading.checks?.[0].type, "regex");
  assert.deepEqual(c.documents, []); // default
});

test("rejects a case missing required fields", () => {
  assert.throws(() => parseCase("---\nslug: x\n---", "fb"), CaseParseError);
});

test("rejects an unknown grading mode", () => {
  const bad = DET.replace("mode: deterministic", "mode: vibes");
  assert.throws(() => parseCase(bad, "fb"), CaseParseError);
});
```

- [ ] **Step 2: Run, verify fail** — `cd eval-harness && node --import tsx --test src/cases/parse.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** — parse frontmatter with `yaml`, split on the first `---\n…\n---`, validate required fields (`slug`, `target`, `targetType ∈ {agent,skill}`, `input_brief`, `grading.mode ∈ {deterministic,rubric}`), default `documents=[]`, `source={kind:"local"}`, `lane` left undefined if absent. Throw `CaseParseError` (export a subclass of `Error`) on any violation. `loadCasesForTarget` reads `casesDir/*.md`, parses each, filters `c.target === target`.
- [ ] **Step 4: Run, verify pass** — Expected: PASS (3 tests).
- [ ] **Step 5: Commit** — `feat(eval-harness): markdown case parser`.

### Task D3: Variant resolution

**Files:** Create `eval-harness/src/variants.ts`, `eval-harness/src/variants.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export interface ResolvedModel { variant: string; adapterType: string; model: string; params: Record<string, unknown>; }
  export function loadVariants(path: string): { variants: Record<string, any> };
  export function resolveModel(variantsFile: { variants: Record<string, any> }, variant: string, lane: string): ResolvedModel;
  ```

- [ ] **Step 1: Write the failing test** (uses a small inline fixture mirroring the real `variants.yaml` shape):

```ts
// eval-harness/src/variants.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveModel } from "./variants.ts";

const FIXTURE = {
  variants: {
    claude: {
      default: { adapterType: "claude_local", adapterConfig: { model: "claude-sonnet", timeoutSec: 600 } },
      lanes: { drafting: { timeoutSec: 900 }, review: { timeoutSec: 900 } },
    },
    ollama: {
      default: { adapterType: "opencode_local", adapterConfig: { model: "llama3.1:70b" } },
      lanes: { drafting: {} },
    },
  },
};

test("resolves adapterType + model and merges lane overrides over default config", () => {
  const r = resolveModel(FIXTURE, "claude", "drafting");
  assert.equal(r.adapterType, "claude_local");
  assert.equal(r.model, "claude-sonnet");
  assert.equal(r.params.timeoutSec, 900); // lane override wins
});

test("resolves a different adapter family", () => {
  const r = resolveModel(FIXTURE, "ollama", "drafting");
  assert.equal(r.adapterType, "opencode_local");
  assert.equal(r.model, "llama3.1:70b");
});

test("throws on unknown variant", () => {
  assert.throws(() => resolveModel(FIXTURE, "nope", "drafting"));
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `loadVariants` reads + `yaml.parse`. `resolveModel`: look up `variants[variant]` (throw if absent); `adapterType = v.default.adapterType`; `merged = { ...v.default.adapterConfig, ...(v.lanes?.[lane] ?? {}) }`; `model = String(merged.model)`; `params = merged` with `model` deleted; return `{ variant, adapterType, model, params }`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): variants.yaml lane resolution`.

### Task D4: Model-client interface + mock + driver dispatch

**Files:** Create `eval-harness/src/model-client/{types.ts,mock.ts,index.ts}`, `eval-harness/src/model-client/drivers/{claude,codex,gemini,opencode}.ts`, `eval-harness/src/model-client/index.test.ts`.

**Interfaces:**
```ts
// eval-harness/src/model-client/types.ts
import type { ResolvedModel } from "../variants.ts";
export type ModelResult =
  | { ok: true; output: string; costUsd: number; ms: number }
  | { ok: false; skipped: true; reason: string };
export interface ModelClient { run(prompt: string, model: ResolvedModel): Promise<ModelResult>; }
export type { ResolvedModel };
```

- [ ] **Step 1: Write the failing test** (mock + dispatch shape only — real CLIs are not invoked in tests):

```ts
// eval-harness/src/model-client/index.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockModelClient } from "./mock.ts";
import { driverFor } from "./index.ts";

test("mock returns a scripted output", async () => {
  const mc = new MockModelClient({ "claude_local": "MOCK OUTPUT" });
  const r = await mc.run("hi", { variant: "claude", adapterType: "claude_local", model: "m", params: {} });
  assert.equal(r.ok && r.output, "MOCK OUTPUT");
});

test("driverFor returns a driver for each of the 4 adapter types", () => {
  for (const t of ["claude_local", "codex_local", "gemini_local", "opencode_local"]) {
    assert.equal(typeof driverFor(t), "function");
  }
});

test("driverFor throws on unknown adapter type", () => {
  assert.throws(() => driverFor("mystery_local"));
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - `mock.ts`: `MockModelClient` ctor takes a `Record<adapterType,string>`; `run` returns `{ok:true, output: map[model.adapterType] ?? "", costUsd:0, ms:0}`.
  - Each driver in `drivers/`: `export async function run(prompt, model): Promise<ModelResult>`. Spawn the headless CLI via `node:child_process` `execFile`, capture stdout, return it; on `ENOENT`/non-zero exit, return `{ ok:false, skipped:true, reason }`. Concrete commands:
    - `claude.ts` → `claude --print --model <model> [--dangerously-skip-permissions]`, prompt via stdin.
    - `codex.ts` → `codex exec --model <model>` (headless), prompt via stdin/arg.
    - `gemini.ts` → `gemini --model <model> --prompt <prompt>` (headless).
    - `opencode.ts` → `opencode run --model <model>` (or local HTTP if `OPENCODE_API_KEY` unset and an Ollama URL is configured); on missing binary, skip.
  - `index.ts`: `driverFor(adapterType)` returns the driver's `run`; throws on unknown. `createModelClient(): ModelClient` whose `run` dispatches `driverFor(model.adapterType)`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): model-client + 4 drivers + mock`.

> **Note:** drivers are exercised live only via `./bin/eval run` against an installed CLI; unit tests cover dispatch + skip logic with the mock. Keep driver bodies thin (≤40 lines each).

### Task D5: Deterministic graders + tokenF1

**Files:** Create `eval-harness/src/grade/tokenf1.ts` (+test), `eval-harness/src/grade/deterministic.ts` (+test).

**Interfaces:**
```ts
export function tokenF1(prediction: string, gold: string): number; // 0..1
export interface CheckResult { id: string; pass: boolean; score: number; detail: string; }
export function runDeterministic(output: string, checks: DeterministicCheck[]): { score: number; pass: boolean; results: CheckResult[] };
```

- [ ] **Step 1: Write the failing tests**

```ts
// tokenf1.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { tokenF1 } from "./tokenf1.ts";
test("identical strings score 1", () => { assert.equal(tokenF1("a b c", "a b c"), 1); });
test("disjoint strings score 0", () => { assert.equal(tokenF1("x", "y"), 0); });
test("partial overlap is between 0 and 1", () => { const s = tokenF1("thirty days notice", "thirty (30) days prior written notice"); assert.ok(s > 0 && s < 1); });
```

```ts
// deterministic.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { runDeterministic } from "./deterministic.ts";
test("regex + contains both pass", () => {
  const r = runDeterministic("laws of the State of Delaware, two (2) year term", [
    { id: "g", type: "regex", pattern: "(?i)State of Delaware" },
    { id: "t", type: "contains", value: "two (2) year" },
  ]);
  assert.equal(r.pass, true); assert.equal(r.score, 1);
});
test("a failing check makes the case fail", () => {
  const r = runDeterministic("nothing here", [{ id: "g", type: "regex", pattern: "Delaware" }]);
  assert.equal(r.pass, false);
});
test("golden uses tokenF1 with a threshold", () => {
  const r = runDeterministic("the laws of the State of Delaware", [
    { id: "gold", type: "golden", value: "laws of the State of Delaware", threshold: 0.6 },
  ]);
  assert.equal(r.results[0].pass, true);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - `tokenF1`: lowercase, split on `/\W+/`, drop empties; precision = |∩|/|pred|, recall = |∩|/|gold| over multisets (or sets — sets are fine for v1); F1 = 2PR/(P+R), 0 when either is 0.
  - `runDeterministic`: per check → `regex`: `new RegExp(pattern).test(output)` → score 1/0; `contains`: `output.includes(value)`; `golden`: `score = tokenF1(output, value)`, `pass = score >= (threshold ?? 0.8)`; `schema`: `JSON.parse(output)` succeeds and is an object → 1 else 0. Case `score = mean(result.score)`, `pass = results.every(r => r.pass)`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): deterministic graders + tokenF1`.

### Task D6: Rubric grader (all-pass LLM-judge)

**Files:** Create `eval-harness/src/grade/judge-prompt.ts`, `eval-harness/src/grade/rubric.ts` (+test).

**Interfaces:**
```ts
export interface CriterionVerdict { id: string; pass: boolean; raw: string; }
export function buildJudgePrompt(output: string, criterion: RubricCriterion): string;
export function parseVerdict(raw: string): boolean; // true=PASS
export async function runRubric(
  output: string,
  rubric: NonNullable<Grading["rubric"]>,
  judge: ModelClient,
  resolveJudge: (lane: string) => ResolvedModel,
  subjectModel: ResolvedModel,
): Promise<{ score: number; pass: boolean; verdicts: CriterionVerdict[]; judgeIsSubject: boolean }>;
```

- [ ] **Step 1: Write the failing test** (uses a mock judge keyed to return PASS/FAIL deterministically):

```ts
// rubric.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { parseVerdict, runRubric } from "./rubric.ts";
import type { ModelClient } from "../model-client/types.ts";

test("parseVerdict reads PASS/FAIL case-insensitively", () => {
  assert.equal(parseVerdict("Verdict: PASS"), true);
  assert.equal(parseVerdict("fail - missing term"), false);
});

const judgeAll = (verdict: string): ModelClient => ({ run: async () => ({ ok: true, output: verdict, costUsd: 0, ms: 1 }) });
const m = { variant: "claude", adapterType: "claude_local", model: "j", params: {} };

test("all-pass: one FAIL fails the case", async () => {
  const rubric = { judge_model: "review", pass_rule: "all" as const, criteria: [{ id: "a", prompt: "?" }, { id: "b", prompt: "?" }] };
  // judge returns PASS for a, FAIL for b → emulate by a counter client:
  let n = 0;
  const client: ModelClient = { run: async () => ({ ok: true, output: n++ === 0 ? "PASS" : "FAIL", costUsd: 0, ms: 1 }) };
  const r = await runRubric("out", rubric, client, () => m, m);
  assert.equal(r.pass, false);
  assert.equal(r.verdicts.filter(v => v.pass).length, 1);
});

test("flags judge==subject", async () => {
  const rubric = { judge_model: "review", pass_rule: "all" as const, criteria: [{ id: "a", prompt: "?" }] };
  const r = await runRubric("out", rubric, judgeAll("PASS"), () => m, m);
  assert.equal(r.judgeIsSubject, true);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - `judge-prompt.ts`: `buildJudgePrompt` returns a strict template: "You are grading a legal work product against ONE criterion. Answer with exactly `PASS` or `FAIL` on the first line, then a one-sentence reason. Criterion: <prompt>. Work product: <output>".
  - `parseVerdict`: `/\bpass\b/i.test(firstLine) && !/\bfail\b/i.test(firstLine)`.
  - `runRubric`: for each criterion, `judge.run(buildJudgePrompt(output, c), resolveJudge(rubric.judge_model))`; if skipped, treat verdict as fail with raw=reason. `pass = verdicts.every(v=>v.pass)` (pass_rule all). `score = passCount/total`. `judgeIsSubject = resolveJudge(rubric.judge_model).model === subjectModel.model`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): all-pass rubric grader with LLM-judge`.

### Task D7: Report writer

**Files:** Create `eval-harness/src/report/index.ts` (+test).

**Interfaces:**
```ts
export interface CaseRecord { slug: string; target: string; mode: GradingMode; pass: boolean; score: number; costUsd: number; ms: number; skipped: boolean; detail: string; }
export interface RunReport {
  target: string; variant: string; lane: string; modelMix: string;
  cases: CaseRecord[]; meanScore: number; medianScore: number; stddev: number;
  totalCost: number; budget: number | null; budgetAborted: boolean; timestamp: string;
}
export function summarize(target: string, variant: string, lane: string, modelMix: string, cases: CaseRecord[], budget: number | null, budgetAborted: boolean, timestamp: string): RunReport;
export function renderMarkdown(r: RunReport): string;
export function writeReport(dir: string, r: RunReport): { mdPath: string; jsonPath: string };
```

- [ ] **Step 1: Write the failing test**

```ts
// report/index.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { summarize, renderMarkdown } from "./index.ts";

const cases = [
  { slug: "a", target: "nda-drafter", mode: "deterministic" as const, pass: true, score: 1, costUsd: 0.01, ms: 100, skipped: false, detail: "" },
  { slug: "b", target: "nda-drafter", mode: "rubric" as const, pass: false, score: 0.5, costUsd: 0.02, ms: 200, skipped: false, detail: "missing term" },
];

test("summarize computes mean and total cost", () => {
  const r = summarize("nda-drafter", "claude", "drafting", "claude_local/claude-sonnet", cases, null, false, "2026-06-22T00:00:00Z");
  assert.equal(r.meanScore, 0.75);
  assert.equal(Number(r.totalCost.toFixed(2)), 0.03);
});

test("markdown shows header table and a failure row", () => {
  const r = summarize("nda-drafter", "claude", "drafting", "claude_local/claude-sonnet", cases, null, false, "2026-06-22T00:00:00Z");
  const md = renderMarkdown(r);
  assert.match(md, /# PossibLaw Eval Report/);
  assert.match(md, /nda-drafter/);
  assert.match(md, /missing term/);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `summarize` computes mean/median/stddev of `score`, sum of `costUsd`. `renderMarkdown` reproduces the old format (`layer/evals/results/*.md`): `# PossibLaw Eval Report`, a Field/Value header table (Target, Variant, Lane, Sample size, Mean/Median/Std dev, Total cost, Budget, Budget aborted, Model mix), a `## Top Failures` section (cases where `!pass`, sorted by score asc), and a `## Per-case Results` table. `writeReport` writes `<target>--<variant>--<timestamp>.md` and `.json` to `dir` (creating it), returns paths.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): md+json report writer (reuses prior format)`.

### Task D8: Runner orchestration

**Files:** Create `eval-harness/src/runner.ts` (+test).

**Interfaces:**
```ts
export interface RunOptions { variant: string; budget: number | null; client: ModelClient; variantsPath: string; paperclipYamlPath: string; casesDir: string; }
export async function runCase(c: Case, opts: RunOptions): Promise<CaseRecord>;
export async function runTarget(target: string, opts: RunOptions): Promise<RunReport>;
```

- [ ] **Step 1: Write the failing test** (mock client; deterministic case needs no model for grading but DOES need the agent output — so the runner first asks the model for the work product, then grades):

```ts
// runner.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { runCase } from "./runner.ts";
import { MockModelClient } from "./model-client/mock.ts";
import type { Case } from "./types.ts";

const c: Case = {
  slug: "nda-gov", target: "nda-drafter", targetType: "agent", lane: "drafting",
  input_brief: "Draft NDA, Delaware.", documents: [],
  grading: { mode: "deterministic", checks: [{ id: "g", type: "regex", pattern: "(?i)Delaware" }] },
  source: { kind: "local" },
};

test("runCase asks the model then grades deterministically", async () => {
  const client = new MockModelClient({ claude_local: "Governed by the laws of Delaware." });
  const rec = await runCase(c, { variant: "claude", budget: null, client,
    variantsPath: "fixtures/variants.yaml", paperclipYamlPath: "fixtures/.paperclip.yaml", casesDir: "x" });
  assert.equal(rec.pass, true);
});

test("a skipped model call yields a skipped record, not a throw", async () => {
  const client = { run: async () => ({ ok: false as const, skipped: true as const, reason: "claude not installed" }) };
  const rec = await runCase(c, { variant: "claude", budget: null, client,
    variantsPath: "fixtures/variants.yaml", paperclipYamlPath: "fixtures/.paperclip.yaml", casesDir: "x" });
  assert.equal(rec.skipped, true);
  assert.equal(rec.pass, false);
});
```

> Provide `eval-harness/fixtures/variants.yaml` (the 2-variant fixture from D3) and a minimal `fixtures/.paperclip.yaml` mapping `nda-drafter` → `metadata.possiblaw.modelLane: drafting`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — `runCase`: resolve lane = `c.lane ?? laneFromPaperclip(opts.paperclipYamlPath, c.target)`; `model = resolveModel(loadVariants(opts.variantsPath), opts.variant, lane)`; `res = await opts.client.run(buildAgentPrompt(c), model)`; if `!res.ok` → return skipped `CaseRecord`; grade: deterministic via `runDeterministic`, rubric via `runRubric` (judge resolved through the same `resolveModel`); build `CaseRecord`. `buildAgentPrompt(c)` = `input_brief` + appended document contents. `runTarget`: `loadCasesForTarget`, run sequentially honoring `budget` (stop when cumulative cost would exceed), `summarize`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): runner orchestration (resolve→invoke→grade)`.

### Task D9: CUAD adapter + LAB stub

**Files:** Create `eval-harness/src/adapters/cuad.ts` (+test), `eval-harness/src/adapters/lab.ts`.

**Interfaces:**
```ts
export function loadCuadCases(fixturesPath: string): Case[];
// lab.ts:
export interface BenchmarkAdapter { name: string; load(rootPath: string): Case[]; }
export const labAdapter: BenchmarkAdapter; // load() throws "not implemented (v1 stub)"
```

- [ ] **Step 1: Write the failing test** (use the real `layer/evals/datasets/cuad/fixtures.jsonl`, asserting shape only):

```ts
// adapters/cuad.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { loadCuadCases } from "./cuad.ts";
test("maps CUAD fixtures.jsonl into deterministic golden cases", () => {
  const cases = loadCuadCases("../layer/evals/datasets/cuad/fixtures.jsonl");
  assert.ok(cases.length > 0);
  assert.equal(cases[0].grading.mode, "deterministic");
  assert.equal(cases[0].grading.checks?.[0].type, "golden");
  assert.equal(cases[0].source.kind, "benchmark");
});
```

> Executor: open `layer/evals/datasets/cuad/fixtures.jsonl` first to confirm each line's field names (e.g. `id`, `question`/`prompt`, `answer`/`gold`); map gold → a `golden` check `value`, prompt → `input_brief`, `id` → slug. Adjust the test's field expectations to the real schema.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — read JSONL, one `Case` per line: `target` = a fixed CUAD target (e.g. `clause-extractor`), `targetType: "skill"`, `input_brief` from the line's prompt/question, one `golden` check with `value` = gold span and `threshold: 0.7`, `source: { kind: "benchmark", name: "cuad" }`. `lab.ts`: export `labAdapter` whose `load` throws `Error("lab adapter not implemented (v1 stub); see docs/superpowers/specs/2026-06-22-eval-harness-design.md §13")`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): CUAD benchmark adapter + LAB stub`.

### Task D10: Coverage tracker

**Files:** Create `eval-harness/src/coverage.ts` (+test).

**Interfaces:**
```ts
export function generateCoverage(agentsDir: string, skillsDir: string, casesDir: string): string; // markdown
```

- [ ] **Step 1: Write the failing test** (temp dirs):

```ts
// coverage.test.ts
import { test } from "node:test"; import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
import { generateCoverage } from "./coverage.ts";

test("marks targets with a case as done, others as TODO", () => {
  const root = mkdtempSync(join(tmpdir(), "cov-"));
  for (const d of ["agents/nda-drafter", "agents/bd-lead", "skills/quick-counsel", "cases"]) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, "cases/x.md"), "---\nslug: x\ntarget: nda-drafter\ntargetType: agent\ninput_brief: y\ngrading:\n  mode: deterministic\n  checks: []\nsource: { kind: local }\n---");
  const md = generateCoverage(join(root, "agents"), join(root, "skills"), join(root, "cases"));
  assert.match(md, /nda-drafter.*(done|✅)/);
  assert.match(md, /bd-lead.*(TODO|⬜)/);
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — list immediate subdirs of `agentsDir` and `skillsDir` (each is a target slug); parse all cases in `casesDir`, collect covered `target`s; render a markdown table `| target | type | status |` with `done` when covered else `TODO`, plus a summary count line.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(eval-harness): coverage tracker generator`.

### Task D11: CLI entry

**Files:** Create `eval-harness/src/index.ts`.

**Interfaces:** none exported (executable). Subcommands: `run`, `list`, `compare`, `report`, `coverage`.

- [ ] **Step 1:** Implement `src/index.ts` parsing `process.argv`:
  - `run --agent <slug> | --skill <slug> [--variant <v>=codex] [--budget <n>]` → `runTarget(slug, { client: createModelClient(), ... })`, then `writeReport("results", report)`, print the per-case table + score + report path.
  - `list` → `generateCoverage(...)` to stdout.
  - `coverage` → write `companies/legal-operations/evals/COVERAGE.md`.
  - `compare <runJsonA> <runJsonB>` → read both `.json`, print a per-case score delta table.
  - `report <runJson>` → re-print a saved report's markdown.
  - Paths: `variantsPath = companies/legal-operations/variants.yaml`, `paperclipYamlPath = companies/legal-operations/.paperclip.yaml`, `casesDir = companies/legal-operations/evals/cases`, `agentsDir/skillsDir` under the package.
- [ ] **Step 2:** Smoke without a model: `./bin/eval coverage` → writes `COVERAGE.md`; `./bin/eval list` prints the table. (No model call.)
- [ ] **Step 3:** `pnpm -C eval-harness typecheck` → no errors.
- [ ] **Step 4: Commit** — `feat(eval-harness): CLI (run/list/compare/report/coverage)`.

### Task D12: Seed cases + generate COVERAGE.md

**Files:** Create `companies/legal-operations/evals/cases/*.md` (~8 per spec §8); generate `COVERAGE.md`.

- [ ] **Step 1:** Author the 8 seed cases from spec §8. For each, confirm the `target` slug exists (`ls companies/legal-operations/agents/<slug>` / `skills/<slug>`) and set `lane` explicitly. Deterministic cases get `regex`/`contains`/`golden` checks; rubric cases get 2–3 all-pass criteria.
- [ ] **Step 2:** Validate each parses: `./bin/eval list` runs clean (no `CaseParseError`).
- [ ] **Step 3:** `./bin/eval coverage` → regenerate `COVERAGE.md`; confirm the 8 targets show `done`.
- [ ] **Step 4:** (If a CLI is installed/authed) smoke one live run: `./bin/eval run --skill clause-extractor --variant codex` → produces a report. If no CLI available, note the graceful skip in the report and move on.
- [ ] **Step 5: Commit** — `feat(eval-harness): seed eval cases + coverage tracker`.

---

# Workstream E — Integration, verification, merge

### Task E1: Full verification + continuity + merge

- [ ] **Step 1: Run every check**

```bash
cd gate-proxy && node --import tsx --test "src/**/*.test.ts" && npx tsc --noEmit && cd ..
cd eval-harness && node --import tsx --test "src/**/*.test.ts" && npx tsc --noEmit && cd ..
bash -n bin/possiblaw && bash -n bin/eval
python3 bin/_possiblaw_variants.py --self-test && python3 bin/_possiblaw_inline_source.py --self-test
./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "smoke test"
```

Expected: gate-proxy tests green (211+); eval-harness tests green; both typechecks clean; self-tests pass; dry-run `agents=175 skills=171 projects=3 issues=3 warnings=0 errors=0`. Stop the dry-run server afterward (`kill $(cat ~/.possiblaw/paperclip-data/possiblaw.pid)`).

- [ ] **Step 2: Refresh continuity** — update `.agent/PLAN.md` (Phase 2 → enforced; eval harness shipped), `.agent/HANDOFF.md`, append `.claude/history.md`. (Do NOT commit these.)
- [ ] **Step 3: Review the diff** — `git status --short && git diff --stat main...feat/eval-harness`.
- [ ] **Step 4: Merge to main** — fast-forward or PR per operator preference:

```bash
git checkout main && git merge --no-ff feat/eval-harness -m "feat: eval harness + Phase 2 citation gate + hygiene/doc fixes"
```

(Or open a PR if a remote exists: `gh pr create ...`.)

- [ ] **Step 5:** Confirm `main` is green (re-run Step 1's test commands on `main`).

---

## Self-Review (completed by author)

- **Spec coverage:** §4 components → D1–D11; §5 schema → D2; §6 variants/drivers → D3/D4; §7 grading → D5/D6; §8 seed → D12; §9 report → D7; §10 errors → skip paths in D4/D8; §11 testing → every D task; §12 items 1–3 → A/B/C; coverage tracker → D10. Covered.
- **Placeholders:** none — every step has test or impl code, exact commands, expected output. Two explicit executor-verification notes (A1 field names vs connectors.ts; D9 CUAD schema) point at concrete existing files, not gaps.
- **Type consistency:** `Case`/`Grading` (D1) used unchanged in D2/D8/D9/D10; `ResolvedModel` (D3) flows into D4/D6/D8; `ModelResult`/`ModelClient` (D4) consumed by D6/D8; `CaseRecord`/`RunReport` (D7) produced by D8. Consistent.

## Execution mapping (≤5 subagents)

- **SA1:** Workstream A (A1→A3). **SA2:** Workstreams B + C. **SA3:** Eval harness D1→D5. **SA4:** Eval harness D6→D12. **SA5:** Workstream E (after SA1–SA4 land). SA3 must finish before SA4 (shared types); A/B/C are independent of D.
