# Harvey LAB Orchestration Eval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run real (MIT) Harvey LAB legal tasks through the live PossibLaw app — monolithic (Arm A) vs orchestrated (Arm B) — scored by Harvey's own all-pass judge, with a smart cost-routing experiment, producing a defensible quality-and-cost A/B number.

**Architecture:** Two TS packages by determinism. `eval-harness/` (existing) gets the LAB **adapter** (task.json → `Case`). A new `orchestration-eval/` package owns the flaky live parts: a paperclip REST client, a document extractor (shells to Harvey's `parse_doc.py`), a completion poller, the Arm-A/Arm-B runner, a judge bridge (shells to Harvey's `run_eval`), and the A/B matrix report. Harvey LAB is a **pinned git submodule** (`harvey-lab/`, never modified). The "smart router" is a cost-tuned `variants.yaml` lane-map + paperclip budgets.

**Tech Stack:** TypeScript (NodeNext, ES2022, strict), `node:test` + `tsx`, `yaml`. Python (via `uv`) only as a pinned-submodule subprocess for Harvey's `parse_doc.py` + `run_eval.py`. `pandoc` CLI (docx parsing). paperclip REST (disposable instance). OpenRouter for the metered cost sweep.

## Global Constraints

- **Layer-not-fork:** `harvey-lab/` and `paperclip/` are pinned submodules; **never modify** their source. Cite `file:line` only.
- **NEVER touch port 3100** (operator's live server). Disposable instances only: `--port 3199 --gate-port 3899 --data-dir "$(mktemp -d)"`.
- **Never commit** `.agent/*` or `.claude/history.md`.
- TS: `"type": "module"`, NodeNext, `strict: true`, import local TS with explicit `.ts` extension (matches eval-harness). Tests co-located `src/**/*.test.ts`, run via `node --import tsx --test "src/**/*.test.ts"`.
- Harvey judge default model: `claude-sonnet-4-6` (unchanged). Judge needs `ANTHROPIC_API_KEY`.
- Honest scope: v1 = curated single-parent-issue subset; non-fitting tasks SKIPPED with a logged reason. Say "a curated subset of Harvey LAB (N tasks)", never "we ran Harvey LAB".
- TDD: failing test → minimal code → green → commit. Frequent commits. DRY, YAGNI.

---

## Spike Receipts (resolved 2026-06-27 — all `file:line`-verified)

Reuse these facts; do not re-derive. (Harvey LAB clone inspected at a scratchpad checkout; paths below are within the `harvey-lab/` submodule once added.)

**Harvey LAB dataset** — MIT; 1,749 tasks / 25 practice areas; real committed `.docx/.xlsx/.eml/.pptx`.
- Task: `harvey-lab/tasks/<practice-area>/<task>/[<scenario>]/task.json` + `documents/`.
- `task.json`: `title`, `work_type` (`analyze|draft|review|research`), `tags[]`, `instructions`, `deliverables` (map: filename→canonical), `criteria[]` (`id`, `title`, `match_criteria`, `deliverables[]`, optional `sources[]`, `evaluation_options`).

**Harvey scoring (decoupled from execution)** —
- Judge reads agent output from **`harvey-lab/results/<run-id>/output/`** (`evaluation/scoring.py:320`).
- `score_rubric` matches each criterion's `deliverables` to filenames in `output/` (exact → fuzzy → LLM match; `scoring.py:325-347`).
- **Any non-binary file is read as plain UTF-8** (`scoring.py:70`) — a `.txt`/`.md` with the matching basename scores; **no `.docx` needed.**
- `run_eval` writes **`harvey-lab/results/<run-id>/scores.json`** (`run_eval.py:155-156`). Shape (13 keys): `score, max_score, summary, all_pass, n_criteria, n_passed, criteria_results[{id,title,verdict,reasoning}], run_id, task, judge_model, scored_at`, optional `cost{input_tokens,output_tokens,wall_clock_seconds}` + `doc_coverage{...}` (present iff `results/<run-id>/metrics.json` exists).
- Run: `uv run python -m evaluation.run_eval --run-id <id> --task <area/slug> --judge-model claude-sonnet-4-6` (cwd = `harvey-lab/`). Needs `ANTHROPIC_API_KEY`.

**Harvey parser** — `harvey-lab/sandbox/parsers/parse_doc.py`. CLI: `uv run python sandbox/parsers/parse_doc.py {docx|pdf|pptx|xlsx} <path>` → text on stdout, exit 0 (err → stderr, exit 1). Deps: `pdfplumber`, `openpyxl`, `markitdown`, **`pandoc` CLI** (docx → markdown via pandoc).

**Paperclip REST** (within `paperclip/` submodule) —
- Create+assign issue: `POST /api/companies/:companyId/issues` body `{title, description?, assigneeAgentId?, requestDepth?, projectId?}` → 201 issue (`routes/issues.ts:3143-3232`).
- Attach doc to issue bank: `PUT /api/issues/:id/documents/:key` (the read side `GET …/documents/:key` is `routes/issues.ts:2433`).
- Get issue: `GET /api/issues/:id` → `{status, workProducts[], documentPayload}` (`routes/issues.ts:2142-2217`).
- Done-detection: status in `{"done","cancelled"}` (`isClosedIssueStatus`, `routes/issues.ts:612`). Statuses: `backlog,todo,in_progress,in_review,done,blocked,cancelled` (`packages/shared/src/constants.ts:127-135`).
- Work products: `GET /api/issues/:id/work-products` → `IssueWorkProduct[]` (`routes/issues.ts:2407`). Document body: `GET /api/issues/:id/documents/:key` → `{body}`.
- **Arm A vs Arm B is BEHAVIORAL** (no flag): `requestDepth` is tracked, not hard-enforced. Arm A = assign to a single capable doer agent (a practice lead) that completes directly; Arm B = assign to the `chief-of-staff` delegator that decomposes via `POST /api/issues/:id/children` (`services/issues.ts:3993`).
- Budgets: `PATCH /api/companies/:companyId/budgets` `{budgetMonthlyCents}`; `PATCH /api/agents/:agentId/budgets` `{budgetMonthlyCents}` (`routes/costs.ts:280-355`).
- Spend readback: **`GET /api/issues/:id/cost-summary`** (per-issue spend — the per-run cost; `routes/costs.ts:140-150`); also `GET /api/companies/:companyId/costs/by-agent`.
- Client to mirror: `mcp-servers/firm-facade/src/paperclip-client.ts` (`createIssue`, `getIssue`, `listWorkProducts`, `getDocument`; Bearer `apiKey` + `companyId`). Agent-key mint: `POST /api/agents/:id/keys {name}` → `{token}` (once). List agents (resolve slug→id): `GET /api/companies/:companyId/agents`.

**Cost routing** (`companies/legal-operations/variants.yaml`) — `_possiblaw_variants.py` merges base → `lanes[modelLane]` → `per_agent[slug]` into `adapterOverrides`. Adding `openrouter-cost` is purely additive YAML. OpenRouter IDs use dots: `openrouter/anthropic/claude-opus-4.7`. **GLM 5.2 = `openrouter/z-ai/glm-5.2`** (catalog-confirmed; quality-vs-Opus claim UNCONFIRMED → measured by Experiment 2). Variant selected via `bin/possiblaw --variant <slug>`.

---

## File Structure

- `.gitmodules` (modify) + `harvey-lab/` (new pinned submodule)
- `layer/evals/datasets/lab/lab-manifest.yaml` (new — curated `included`/`excluded` task list)
- `eval-harness/src/adapters/lab.ts` (modify — fill stub) ; `eval-harness/src/adapters/lab.test.ts` (new)
- `eval-harness/src/benchmarks.ts` (modify — register `lab`)
- `orchestration-eval/` (new package): `package.json`, `tsconfig.json`, `bin/orchestration-eval`, and `src/{paperclip-client,extract,await-completion,runner,judge,report,index}.ts` each with a co-located `*.test.ts`
- `companies/legal-operations/variants.yaml` (modify — add `openrouter-cost`)
- `docs/operator-test-checklist.md`, `docs/known-limitations.md`, `docs/operator-walkthrough.md`, `CHANGELOG.md` (modify)

---

## Task 1: Pin Harvey LAB submodule + scaffold `orchestration-eval`

**Files:**
- Modify: `.gitmodules`
- Create: `harvey-lab/` (submodule), `orchestration-eval/package.json`, `orchestration-eval/tsconfig.json`, `orchestration-eval/src/smoke.test.ts`

**Interfaces:**
- Produces: a buildable `orchestration-eval` package (node:test + tsx) and a pinned `harvey-lab/` tree at a known SHA.

- [ ] **Step 1: Add the pinned submodule**

```bash
cd /Users/salvadorcarranza/possiblaw
git submodule add https://github.com/harveyai/harvey-labs.git harvey-lab
git -C harvey-lab rev-parse HEAD   # record this SHA in the manifest (Task 2)
```
Expected: `.gitmodules` gains a `[submodule "harvey-lab"]` block; `harvey-lab/tasks/`, `harvey-lab/evaluation/`, `harvey-lab/sandbox/` exist.

- [ ] **Step 2: Scaffold the package** — create `orchestration-eval/package.json`:

```json
{
  "name": "@possiblaw/orchestration-eval",
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

and `orchestration-eval/tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the smoke test** — `orchestration-eval/src/smoke.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("orchestration-eval package builds and runs node:test", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Install + run**

```bash
pnpm -C orchestration-eval install
pnpm -C orchestration-eval test
```
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add .gitmodules harvey-lab orchestration-eval/package.json orchestration-eval/tsconfig.json orchestration-eval/src/smoke.test.ts
git commit -m "feat(orchestration-eval): pin harvey-lab submodule + scaffold package"
```

---

## Task 2: LAB adapter + manifest + register benchmark

**Files:**
- Create: `layer/evals/datasets/lab/lab-manifest.yaml`
- Modify: `eval-harness/src/adapters/lab.ts` (fill stub), `eval-harness/src/benchmarks.ts`
- Create: `eval-harness/src/adapters/lab.test.ts`

**Interfaces:**
- Consumes: `Case` (`eval-harness/src/types.ts`).
- Produces: `loadLabCases(repoRoot: string): Case[]`; `lab` registered in the benchmark registry so `--list` shows it.

- [ ] **Step 1: Write the manifest** — `layer/evals/datasets/lab/lab-manifest.yaml` (curate real single-issue tasks; verify each path exists under `harvey-lab/tasks/`):

```yaml
schema: possiblaw/lab-manifest/v1
# Harvey LAB pinned SHA (from Task 1 Step 1):
submodule_sha: "REPLACE_WITH_harvey-lab_HEAD_SHA"
# Inclusion rule is PURELY STRUCTURAL: the task must map to one parent issue
# (a fixed document set in, one reconstituted deliverable out). Curated blind to results.
included:
  - task: immigration/compare-draft-eb
    work_type: review
    arm_a_agent: immigration-lead     # capable single doer for Arm A (must be non-delegating)
    note: "4 docs (docx/eml/xlsx) → one gap-analysis memo; clean single-issue fit"
# Add ~10-15 more single-issue-fit tasks here, one per practice area where possible.
excluded:
  - task: EXAMPLE/long-horizon-multistep
    reason: "needs iterative multi-turn sandbox state beyond one parent issue (S5 out-of-scope v1)"
```

- [ ] **Step 2: Write the failing test** — `eval-harness/src/adapters/lab.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLabCases } from "./lab.ts";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "lab-"));
  // a fixture LAB task under harvey-lab/tasks/<area>/<slug>/task.json
  const taskDir = join(root, "harvey-lab/tasks/contracts/redflag-memo");
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, "task.json"), JSON.stringify({
    title: "Red-flag memo",
    work_type: "review",
    instructions: "Review the contract and produce red-flag-memo.docx.",
    deliverables: { "red-flag-memo.docx": "red-flag-memo.docx" },
    criteria: [
      { id: "C-001", title: "Flags change-of-control", match_criteria: "PASS if it flags the change-of-control consent.", deliverables: ["red-flag-memo.docx"] },
    ],
  }));
  // manifest
  const manifestDir = join(root, "layer/evals/datasets/lab");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(join(manifestDir, "lab-manifest.yaml"),
    "schema: possiblaw/lab-manifest/v1\nincluded:\n  - task: contracts/redflag-memo\n    work_type: review\n    arm_a_agent: commercial-lead\nexcluded: []\n");
  return root;
}

test("loadLabCases maps a manifest task.json into a rubric Case", () => {
  const root = fixtureRoot();
  const cases = loadLabCases(root);
  assert.equal(cases.length, 1);
  const c = cases[0];
  assert.equal(c.slug, "contracts/redflag-memo");
  assert.equal(c.input_brief.includes("red-flag-memo.docx"), true);
  assert.equal(c.grading.mode, "rubric");
  assert.equal(c.grading.rubric?.pass_rule, "all");
  assert.equal(c.grading.rubric?.judge_model, "claude-sonnet-4-6");
  assert.equal(c.grading.rubric?.criteria.length, 1);
  assert.equal(c.metadata?.work_type, "review");
  assert.equal((c.metadata as any)?.arm_a_agent, "commercial-lead");
  assert.deepEqual((c.metadata as any)?.deliverables, { "red-flag-memo.docx": "red-flag-memo.docx" });
  assert.equal(c.source.name, "lab");
});
```

- [ ] **Step 3: Run test — verify it fails**

Run: `pnpm -C eval-harness test`
Expected: FAIL — `loadLabCases` not exported / still the stub throw.

- [ ] **Step 4: Implement** — replace `eval-harness/src/adapters/lab.ts`:

```typescript
// eval-harness/src/adapters/lab.ts
// Maps the curated Harvey LAB manifest → Case[]. Tasks + rubric come from the
// pinned harvey-lab/ submodule, UNMODIFIED. See spec §4 / plan Spike Receipts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Case } from "../types.ts";

interface LabCriterion {
  id: string; title: string; match_criteria: string;
  deliverables?: string[]; sources?: string[];
}
interface LabTaskJson {
  title: string; work_type: string; instructions: string;
  deliverables: Record<string, string>; criteria: LabCriterion[]; tags?: string[];
}
interface ManifestEntry { task: string; work_type?: string; arm_a_agent?: string; note?: string; }
interface LabManifest { included: ManifestEntry[]; excluded?: Array<{ task: string; reason: string }>; }

const JUDGE_MODEL = "claude-sonnet-4-6";

export function loadLabCases(repoRoot: string): Case[] {
  const manifestPath = join(repoRoot, "layer/evals/datasets/lab/lab-manifest.yaml");
  const manifest = parseYaml(readFileSync(manifestPath, "utf-8")) as LabManifest;
  return (manifest.included ?? []).map((entry): Case => {
    const taskJsonPath = join(repoRoot, "harvey-lab/tasks", entry.task, "task.json");
    const t = JSON.parse(readFileSync(taskJsonPath, "utf-8")) as LabTaskJson;
    return {
      slug: entry.task,
      target: entry.arm_a_agent ?? "chief-counsel",
      targetType: "agent",
      input_brief: t.instructions,
      documents: [], // populated at run time by the extractor (orchestration-eval)
      grading: {
        mode: "rubric",
        rubric: {
          judge_model: JUDGE_MODEL,
          pass_rule: "all",
          criteria: t.criteria.map(c => ({ id: c.id, prompt: c.match_criteria })),
        },
      },
      source: { kind: "benchmark", name: "lab" },
      metadata: {
        work_type: entry.work_type ?? t.work_type,
        arm_a_agent: entry.arm_a_agent ?? null,
        deliverables: t.deliverables,
        criteria_raw: t.criteria, // keep deliverables[] per criterion for the runner/judge
        task_path: entry.task,
      },
    };
  });
}
```

- [ ] **Step 5: Register the benchmark** — modify `eval-harness/src/benchmarks.ts`: add the import and registry entry.

```typescript
import { loadLabCases } from "./adapters/lab.ts";
// ...inside BENCHMARKS object, add:
  lab: {
    name: "lab",
    load: (repoRoot: string): Case[] => loadLabCases(repoRoot),
  },
```

- [ ] **Step 6: Run — verify pass + `lab` listed**

Run: `pnpm -C eval-harness test`
Expected: PASS. Then confirm registry: `node --import tsx -e "import('./eval-harness/src/benchmarks.ts').then(m=>console.log(m.knownBenchmarks()))"` → includes `lab`.

- [ ] **Step 7: Commit**

```bash
git add layer/evals/datasets/lab/lab-manifest.yaml eval-harness/src/adapters/lab.ts eval-harness/src/adapters/lab.test.ts eval-harness/src/benchmarks.ts
git commit -m "feat(eval-harness): LAB adapter + curated manifest + register lab benchmark"
```

---

## Task 3: Paperclip eval-client

**Files:**
- Create: `orchestration-eval/src/paperclip-client.ts`, `orchestration-eval/src/paperclip-client.test.ts`

**Interfaces:**
- Produces:
  - `interface EvalClientConfig { baseUrl: string; companyId: string; apiKey: string; fetchImpl?: typeof fetch }`
  - `class PaperclipEvalClient` with:
    - `createIssue(body: { title: string; description?: string; assigneeAgentId?: string; requestDepth?: number }): Promise<{ id: string; status: string }>`
    - `putDocument(issueId: string, key: string, body: string): Promise<void>`
    - `getIssue(issueId: string): Promise<{ id: string; status: string; workProducts?: unknown[] }>`
    - `listWorkProducts(issueId: string): Promise<Array<{ id: string; type?: string; title?: string; isPrimary?: boolean; metadata?: Record<string, unknown> }>>`
    - `getDocument(issueId: string, key: string): Promise<{ id: string; body?: string }>`
    - `listAgents(): Promise<Array<{ id: string; slug?: string; name?: string }>>`
    - `patchCompanyBudget(cents: number): Promise<void>`
    - `patchAgentBudget(agentId: string, cents: number): Promise<void>`
    - `getIssueCostSummary(issueId: string): Promise<{ totalCents?: number; [k: string]: unknown }>`

- [ ] **Step 1: Write the failing test** — `orchestration-eval/src/paperclip-client.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { PaperclipEvalClient } from "./paperclip-client.ts";

function fakeFetch(calls: Array<{ url: string; init?: RequestInit }>, body: unknown) {
  return async (url: any, init?: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("createIssue posts to the company issues endpoint with Bearer auth", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, { id: "iss-9", status: "todo" }) as any,
  });
  const issue = await client.createIssue({ title: "T", assigneeAgentId: "ag-7" });
  assert.equal(issue.id, "iss-9");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/companies/co-1/issues");
  assert.equal((calls[0].init?.headers as any).Authorization, "Bearer k");
});

test("putDocument PUTs to the issue document key (url-encoded)", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.putDocument("iss-9", "brief", "hello");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/issues/iss-9/documents/brief");
  assert.equal((calls[0].init?.method), "PUT");
});

test("patchCompanyBudget PATCHes the budgets endpoint", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.patchCompanyBudget(5000);
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/companies/co-1/budgets");
  assert.equal(calls[0].init?.method, "PATCH");
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `orchestration-eval/src/paperclip-client.ts`:

```typescript
// orchestration-eval/src/paperclip-client.ts
// Mirrors mcp-servers/firm-facade/src/paperclip-client.ts; adds putDocument,
// listAgents, budgets, and per-issue cost readback. Bearer-authed, company-scoped.
export interface EvalClientConfig {
  baseUrl: string; companyId: string; apiKey: string; fetchImpl?: typeof fetch;
}
export class EvalApiError extends Error {
  constructor(public status: number, public urlPath: string) {
    super(`paperclip ${status} at ${urlPath}`); // never include the token
  }
}
export class PaperclipEvalClient {
  private fetchImpl: typeof fetch;
  constructor(private cfg: EvalClientConfig) { this.fetchImpl = cfg.fetchImpl ?? fetch; }

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new EvalApiError(res.status, path);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  createIssue(body: { title: string; description?: string; assigneeAgentId?: string; requestDepth?: number }) {
    return this.req("POST", `/api/companies/${this.cfg.companyId}/issues`, body) as Promise<{ id: string; status: string }>;
  }
  putDocument(issueId: string, key: string, body: string): Promise<void> {
    return this.req("PUT", `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`, { body }).then(() => undefined);
  }
  getIssue(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}`) as Promise<{ id: string; status: string; workProducts?: unknown[] }>;
  }
  listWorkProducts(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/work-products`) as Promise<Array<{ id: string; type?: string; title?: string; isPrimary?: boolean; metadata?: Record<string, unknown> }>>;
  }
  getDocument(issueId: string, key: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`) as Promise<{ id: string; body?: string }>;
  }
  listAgents() {
    return this.req("GET", `/api/companies/${this.cfg.companyId}/agents`) as Promise<Array<{ id: string; slug?: string; name?: string }>>;
  }
  patchCompanyBudget(cents: number): Promise<void> {
    return this.req("PATCH", `/api/companies/${this.cfg.companyId}/budgets`, { budgetMonthlyCents: cents }).then(() => undefined);
  }
  patchAgentBudget(agentId: string, cents: number): Promise<void> {
    return this.req("PATCH", `/api/agents/${encodeURIComponent(agentId)}/budgets`, { budgetMonthlyCents: cents }).then(() => undefined);
  }
  getIssueCostSummary(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/cost-summary`) as Promise<{ totalCents?: number; [k: string]: unknown }>;
  }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm -C orchestration-eval test`
Expected: PASS (3 client tests).

- [ ] **Step 5: Commit**

```bash
git add orchestration-eval/src/paperclip-client.ts orchestration-eval/src/paperclip-client.test.ts
git commit -m "feat(orchestration-eval): paperclip eval-client (issues, docs, budgets, cost)"
```

---

## Task 4: Document extractor (Harvey `parse_doc.py` bridge)

**Files:**
- Create: `orchestration-eval/src/extract.ts`, `orchestration-eval/src/extract.test.ts`

**Interfaces:**
- Produces:
  - `type DocFormat = "docx" | "pdf" | "pptx" | "xlsx"`
  - `function parseArgvFor(harveyLabDir: string, format: DocFormat, file: string): { cmd: string; args: string[] }`
  - `async function extractDocText(harveyLabDir: string, file: string, run?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>): Promise<{ text: string; skipped: boolean; reason?: string }>`
  - `async function extractTaskDocuments(harveyLabDir: string, taskPath: string, run?: ...): Promise<Array<{ name: string; text: string; skipped: boolean }>>`

- [ ] **Step 1: Write the failing test** — `orchestration-eval/src/extract.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgvFor, extractDocText } from "./extract.ts";

test("parseArgvFor builds the uv parse_doc invocation", () => {
  const { cmd, args } = parseArgvFor("/repo/harvey-lab", "docx", "/repo/harvey-lab/tasks/x/documents/a.docx");
  assert.equal(cmd, "uv");
  assert.deepEqual(args, ["run", "python", "sandbox/parsers/parse_doc.py", "docx", "/repo/harvey-lab/tasks/x/documents/a.docx"]);
});

test("extractDocText returns stdout text on success", async () => {
  const fakeRun = async () => ({ stdout: "Parsed text.", code: 0, stderr: "" });
  const r = await extractDocText("/repo/harvey-lab", "/x/a.docx", fakeRun);
  assert.equal(r.text, "Parsed text.");
  assert.equal(r.skipped, false);
});

test("extractDocText skips an unsupported extension with a reason", async () => {
  const r = await extractDocText("/repo/harvey-lab", "/x/notes.rtf", async () => ({ stdout: "", code: 0, stderr: "" }));
  assert.equal(r.skipped, true);
  assert.match(r.reason!, /unsupported/i);
});

test("extractDocText skips (not throws) on parser failure", async () => {
  const fakeRun = async () => ({ stdout: "", code: 1, stderr: "pandoc failed" });
  const r = await extractDocText("/repo/harvey-lab", "/x/a.docx", fakeRun);
  assert.equal(r.skipped, true);
  assert.match(r.reason!, /pandoc failed/);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `orchestration-eval/src/extract.ts`:

```typescript
// orchestration-eval/src/extract.ts
// Shells to harvey-lab/sandbox/parsers/parse_doc.py (UNMODIFIED) via uv.
// .eml/.txt are read directly; binary formats go through parse_doc.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { spawn } from "node:child_process";

export type DocFormat = "docx" | "pdf" | "pptx" | "xlsx";
const FORMAT_BY_EXT: Record<string, DocFormat> = { ".docx": "docx", ".pdf": "pdf", ".pptx": "pptx", ".xlsx": "xlsx" };

export function parseArgvFor(harveyLabDir: string, format: DocFormat, file: string): { cmd: string; args: string[] } {
  return { cmd: "uv", args: ["run", "python", "sandbox/parsers/parse_doc.py", format, file] };
}

type Runner = (cmd: string, args: string[], cwd: string) => Promise<{ stdout: string; code: number; stderr: string }>;

const defaultRun: Runner = (cmd, args, cwd) => new Promise((resolve) => {
  const p = spawn(cmd, args, { cwd });
  let stdout = "", stderr = "";
  p.stdout.on("data", d => (stdout += d));
  p.stderr.on("data", d => (stderr += d));
  p.on("close", code => resolve({ stdout, code: code ?? 1, stderr }));
  p.on("error", err => resolve({ stdout: "", code: 1, stderr: String(err) }));
});

export async function extractDocText(
  harveyLabDir: string, file: string,
  run?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>,
): Promise<{ text: string; skipped: boolean; reason?: string }> {
  const ext = extname(file).toLowerCase();
  if (ext === ".eml" || ext === ".txt") {
    try { return { text: readFileSync(file, "utf-8"), skipped: false }; }
    catch (e) { return { text: "", skipped: true, reason: `read failed: ${String(e)}` }; }
  }
  const format = FORMAT_BY_EXT[ext];
  if (!format) return { text: "", skipped: true, reason: `unsupported extension: ${ext}` };
  const { cmd, args } = parseArgvFor(harveyLabDir, format, file);
  const exec = run ? (c: string, a: string[]) => run(c, a) : (c: string, a: string[]) => defaultRun(c, a, harveyLabDir);
  const { stdout, code, stderr } = await exec(cmd, args);
  if (code !== 0) return { text: "", skipped: true, reason: stderr.trim() || `parse_doc exit ${code}` };
  return { text: stdout, skipped: false };
}

export async function extractTaskDocuments(
  harveyLabDir: string, taskPath: string,
  run?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>,
): Promise<Array<{ name: string; text: string; skipped: boolean }>> {
  const dir = join(harveyLabDir, "tasks", taskPath, "documents");
  if (!existsSync(dir)) return [];
  const out: Array<{ name: string; text: string; skipped: boolean }> = [];
  for (const name of readdirSync(dir)) {
    const r = await extractDocText(harveyLabDir, join(dir, name), run);
    out.push({ name, text: r.text, skipped: r.skipped });
  }
  return out;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm -C orchestration-eval test`
Expected: PASS.

- [ ] **Step 5: Gated live check (manual, documented — needs `uv` + `pandoc`)**

```bash
cd harvey-lab && uv run python sandbox/parsers/parse_doc.py docx \
  tasks/immigration/compare-draft-eb/documents/draft-petition-letter.docx | head -5
```
Expected: extracted markdown text (not an error). If `uv`/`pandoc` missing, this is an operator-checklist item (Task 9), not a code failure.

- [ ] **Step 6: Commit**

```bash
git add orchestration-eval/src/extract.ts orchestration-eval/src/extract.test.ts
git commit -m "feat(orchestration-eval): document extractor via harvey parse_doc.py"
```

---

## Task 5: Completion poller + deliverable extractor

**Files:**
- Create: `orchestration-eval/src/await-completion.ts`, `orchestration-eval/src/await-completion.test.ts`

**Interfaces:**
- Consumes: `PaperclipEvalClient` (Task 3) — uses `getIssue`, `listWorkProducts`, `getDocument`.
- Produces:
  - `const CLOSED_STATUSES = ["done", "cancelled"] as const`
  - `async function awaitIssueClosed(client, issueId, opts?: { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms:number)=>Promise<void> }): Promise<{ status: string; timedOut: boolean }>`
  - `async function extractDeliverable(client, issueId): Promise<{ text: string; source: "work-product" | "document" | "none" }>`

- [ ] **Step 1: Write the failing test** — `orchestration-eval/src/await-completion.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitIssueClosed, extractDeliverable } from "./await-completion.ts";

function clientWithStatuses(statuses: string[]) {
  let i = 0;
  return {
    async getIssue() { return { id: "iss", status: statuses[Math.min(i++, statuses.length - 1)] }; },
    async listWorkProducts() { return [{ id: "wp1", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument(_id: string, key: string) { return { id: key, body: `BODY:${key}` }; },
  } as any;
}

test("awaitIssueClosed resolves when status reaches done", async () => {
  const client = clientWithStatuses(["in_progress", "in_progress", "done"]);
  const r = await awaitIssueClosed(client, "iss", { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} });
  assert.equal(r.status, "done");
  assert.equal(r.timedOut, false);
});

test("awaitIssueClosed reports timeout without throwing", async () => {
  const client = clientWithStatuses(["in_progress"]);
  let t = 0;
  const r = await awaitIssueClosed(client, "iss", { intervalMs: 10, timeoutMs: 25, now: () => (t += 10), sleep: async () => {} });
  assert.equal(r.timedOut, true);
});

test("extractDeliverable reads the primary work product's document", async () => {
  const client = clientWithStatuses(["done"]);
  const r = await extractDeliverable(client, "iss");
  assert.equal(r.text, "BODY:memo");
  assert.equal(r.source, "work-product");
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `orchestration-eval/src/await-completion.ts`:

```typescript
// orchestration-eval/src/await-completion.ts
import type { PaperclipEvalClient } from "./paperclip-client.ts";

export const CLOSED_STATUSES = ["done", "cancelled"] as const;

interface AwaitOpts { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; }

export async function awaitIssueClosed(
  client: Pick<PaperclipEvalClient, "getIssue">, issueId: string, opts: AwaitOpts = {},
): Promise<{ status: string; timedOut: boolean }> {
  const intervalMs = opts.intervalMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const start = now();
  for (;;) {
    const issue = await client.getIssue(issueId);
    if ((CLOSED_STATUSES as readonly string[]).includes(issue.status)) return { status: issue.status, timedOut: false };
    if (now() - start >= timeoutMs) return { status: issue.status, timedOut: true };
    await sleep(intervalMs);
  }
}

export async function extractDeliverable(
  client: Pick<PaperclipEvalClient, "listWorkProducts" | "getDocument" | "getIssue">, issueId: string,
): Promise<{ text: string; source: "work-product" | "document" | "none" }> {
  const wps = await client.listWorkProducts(issueId).catch(() => []);
  const primary = wps.find(w => w.isPrimary) ?? wps[0];
  const key = (primary?.metadata?.["documentKey"] as string | undefined) ?? undefined;
  if (key) {
    const doc = await client.getDocument(issueId, key).catch(() => ({ body: undefined }));
    if (doc.body) return { text: doc.body, source: "work-product" };
  }
  // Fallback: any document summary on the issue.
  const issue: any = await client.getIssue(issueId).catch(() => ({}));
  const firstKey = issue?.documentPayload?.[0]?.key ?? issue?.documentSummaries?.[0]?.key;
  if (firstKey) {
    const doc = await client.getDocument(issueId, firstKey).catch(() => ({ body: undefined }));
    if (doc.body) return { text: doc.body, source: "document" };
  }
  return { text: "", source: "none" };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm -C orchestration-eval test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestration-eval/src/await-completion.ts orchestration-eval/src/await-completion.test.ts
git commit -m "feat(orchestration-eval): completion poller + deliverable extractor"
```

---

## Task 6: The runner (Arm A monolithic / Arm B orchestrated)

**Files:**
- Create: `orchestration-eval/src/runner.ts`, `orchestration-eval/src/runner.test.ts`

**Interfaces:**
- Consumes: `Case` (eval-harness types), `PaperclipEvalClient`, `extractTaskDocuments`, `awaitIssueClosed`, `extractDeliverable`.
- Produces:
  - `type Arm = "A" | "B"`
  - `interface RunArmInput { caseRec: Case; harveyLabDir: string; resultsDir: string; runId: string; arm: Arm; chiefOfStaffAgentId: string; client: PaperclipEvalClient; runDoc?: (cmd:string,args:string[])=>Promise<{stdout:string;code:number;stderr:string}>; awaitOpts?: object }`
  - `async function runArm(input: RunArmInput): Promise<{ runId: string; arm: Arm; deliverablePath: string; status: string; timedOut: boolean; issueId: string; costCents?: number }>`
  - Writes the deliverable to `<resultsDir>/<runId>/output/<deliverable-filename>` and a `metrics.json` sibling.

- [ ] **Step 1: Write the failing test** — `orchestration-eval/src/runner.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArm } from "./runner.ts";

function fakeClient(record: any) {
  return {
    async createIssue(body: any) { record.created = body; return { id: "iss-1", status: "todo" }; },
    async putDocument(_id: string, key: string) { (record.docs ||= []).push(key); },
    async getIssue() { return { id: "iss-1", status: "done" }; },
    async listWorkProducts() { return [{ id: "wp", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument() { return { id: "memo", body: "FINAL DELIVERABLE TEXT" }; },
    async getIssueCostSummary() { return { totalCents: 1234 }; },
  } as any;
}

const baseCase: any = {
  slug: "contracts/redflag-memo", target: "commercial-lead", targetType: "agent",
  input_brief: "Review and produce red-flag-memo.docx.", documents: [],
  grading: { mode: "rubric", rubric: { judge_model: "claude-sonnet-4-6", pass_rule: "all", criteria: [{ id: "C-001", prompt: "x" }] } },
  source: { kind: "benchmark", name: "lab" },
  metadata: { deliverables: { "red-flag-memo.docx": "red-flag-memo.docx" }, arm_a_agent: "commercial-lead", task_path: "contracts/redflag-memo" },
};

test("Arm A assigns the single doer agent and writes the deliverable to output/", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  const r = await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runA",
    arm: "A", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, "commercial-lead"); // Arm A → single doer
  assert.equal(r.status, "done");
  const out = join(resultsDir, "runA", "output", "red-flag-memo.docx");
  assert.equal(existsSync(out), true);
  assert.equal(readFileSync(out, "utf-8"), "FINAL DELIVERABLE TEXT");
  assert.equal(r.costCents, 1234);
});

test("Arm B assigns the chief-of-staff delegator", async () => {
  const record: any = {};
  const resultsDir = mkdtempSync(join(tmpdir(), "res-"));
  await runArm({
    caseRec: baseCase, harveyLabDir: "/nonexistent", resultsDir, runId: "runB",
    arm: "B", chiefOfStaffAgentId: "ag-cos", client: fakeClient(record),
    runDoc: async () => ({ stdout: "", code: 0, stderr: "" }),
    awaitOpts: { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} },
  });
  assert.equal(record.created.assigneeAgentId, "ag-cos"); // Arm B → delegator
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `orchestration-eval/src/runner.ts`:

```typescript
// orchestration-eval/src/runner.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Case } from "../../eval-harness/src/types.ts";
import type { PaperclipEvalClient } from "./paperclip-client.ts";
import { extractTaskDocuments } from "./extract.ts";
import { awaitIssueClosed, extractDeliverable } from "./await-completion.ts";

export type Arm = "A" | "B";

export interface RunArmInput {
  caseRec: Case; harveyLabDir: string; resultsDir: string; runId: string; arm: Arm;
  chiefOfStaffAgentId: string; client: PaperclipEvalClient;
  runDoc?: (cmd: string, args: string[]) => Promise<{ stdout: string; code: number; stderr: string }>;
  awaitOpts?: { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> };
}

export interface RunArmResult {
  runId: string; arm: Arm; deliverablePath: string; status: string; timedOut: boolean; issueId: string; costCents?: number;
}

function firstDeliverableName(caseRec: Case): string {
  const map = (caseRec.metadata?.["deliverables"] ?? {}) as Record<string, string>;
  const keys = Object.keys(map);
  return keys[0] ?? "output.txt";
}

export async function runArm(input: RunArmInput): Promise<RunArmResult> {
  const { caseRec, harveyLabDir, resultsDir, runId, arm, chiefOfStaffAgentId, client } = input;
  const taskPath = (caseRec.metadata?.["task_path"] as string) ?? caseRec.slug;

  // Arm A = single capable doer (manifest arm_a_agent / case.target); Arm B = chief-of-staff delegator.
  const assigneeAgentId = arm === "B" ? chiefOfStaffAgentId : ((caseRec.metadata?.["arm_a_agent"] as string) ?? caseRec.target);

  const issue = await client.createIssue({ title: `LAB ${taskPath} [${arm}/${runId}]`, description: caseRec.input_brief, assigneeAgentId });

  // Attach extracted documents into the issue bank.
  const docs = await extractTaskDocuments(harveyLabDir, taskPath, input.runDoc);
  for (const d of docs) {
    if (!d.skipped && d.text) await client.putDocument(issue.id, d.name.replace(/[^a-zA-Z0-9_.-]/g, "_"), d.text);
  }

  const closed = await awaitIssueClosed(client, issue.id, input.awaitOpts);
  const deliverable = await extractDeliverable(client, issue.id);

  // Write to Harvey's expected layout: <resultsDir>/<runId>/output/<deliverable>
  const outDir = join(resultsDir, runId, "output");
  mkdirSync(outDir, { recursive: true });
  const deliverableName = firstDeliverableName(caseRec);
  const deliverablePath = join(outDir, deliverableName);
  writeFileSync(deliverablePath, deliverable.text, "utf-8");

  let costCents: number | undefined;
  try { costCents = (await client.getIssueCostSummary(issue.id)).totalCents; } catch { /* spend optional */ }
  // metrics.json drives the judge's optional cost field.
  writeFileSync(join(resultsDir, runId, "metrics.json"), JSON.stringify({ wall_clock_seconds: 0, cost_cents: costCents ?? null }, null, 2));

  return { runId, arm, deliverablePath, status: closed.status, timedOut: closed.timedOut, issueId: issue.id, costCents };
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm -C orchestration-eval test`
Expected: PASS (both arm tests).

- [ ] **Step 5: Commit**

```bash
git add orchestration-eval/src/runner.ts orchestration-eval/src/runner.test.ts
git commit -m "feat(orchestration-eval): Arm A / Arm B paperclip execution runner"
```

---

## Task 7: Judge bridge (Harvey `run_eval`)

**Files:**
- Create: `orchestration-eval/src/judge.ts`, `orchestration-eval/src/judge.test.ts`

**Interfaces:**
- Produces:
  - `function judgeArgvFor(runId: string, task: string, judgeModel: string): { cmd: string; args: string[] }`
  - `interface JudgeScores { score: number; all_pass: boolean; n_criteria: number; n_passed: number; criteria_results: Array<{ id: string; title: string; verdict: "pass" | "fail"; reasoning: string }>; run_id: string; task: string; judge_model: string; cost?: { input_tokens: number; output_tokens: number; wall_clock_seconds: number } }`
  - `async function scoreRun(harveyLabDir: string, runId: string, task: string, opts?: { judgeModel?: string; run?: (cmd:string,args:string[],cwd:string)=>Promise<{code:number;stderr:string}>; readScores?: (p:string)=>string }): Promise<JudgeScores>`

- [ ] **Step 1: Write the failing test** — `orchestration-eval/src/judge.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeArgvFor, scoreRun } from "./judge.ts";

test("judgeArgvFor builds the run_eval invocation with the default model", () => {
  const { cmd, args } = judgeArgvFor("run-1", "contracts/redflag-memo", "claude-sonnet-4-6");
  assert.equal(cmd, "uv");
  assert.deepEqual(args, ["run", "python", "-m", "evaluation.run_eval", "--run-id", "run-1", "--task", "contracts/redflag-memo", "--judge-model", "claude-sonnet-4-6"]);
});

test("scoreRun runs the judge then parses results/<run-id>/scores.json", async () => {
  const scores = { score: 1.0, all_pass: true, n_criteria: 2, n_passed: 2,
    criteria_results: [{ id: "C-001", title: "x", verdict: "pass", reasoning: "ok" }],
    run_id: "run-1", task: "contracts/redflag-memo", judge_model: "claude-sonnet-4-6" };
  const r = await scoreRun("/repo/harvey-lab", "run-1", "contracts/redflag-memo", {
    run: async () => ({ code: 0, stderr: "" }),
    readScores: () => JSON.stringify(scores),
  });
  assert.equal(r.all_pass, true);
  assert.equal(r.n_passed, 2);
  assert.equal(r.criteria_results[0].verdict, "pass");
});

test("scoreRun throws a clear error when the judge process fails", async () => {
  await assert.rejects(
    scoreRun("/repo/harvey-lab", "run-1", "t", { run: async () => ({ code: 1, stderr: "ANTHROPIC_API_KEY missing" }) }),
    /run_eval failed.*ANTHROPIC_API_KEY/s,
  );
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `orchestration-eval/src/judge.ts`:

```typescript
// orchestration-eval/src/judge.ts
// Shells to harvey-lab/evaluation/run_eval.py (UNMODIFIED). Judge needs ANTHROPIC_API_KEY.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface JudgeScores {
  score: number; all_pass: boolean; n_criteria: number; n_passed: number;
  criteria_results: Array<{ id: string; title: string; verdict: "pass" | "fail"; reasoning: string }>;
  run_id: string; task: string; judge_model: string;
  cost?: { input_tokens: number; output_tokens: number; wall_clock_seconds: number };
}

export function judgeArgvFor(runId: string, task: string, judgeModel: string): { cmd: string; args: string[] } {
  return { cmd: "uv", args: ["run", "python", "-m", "evaluation.run_eval", "--run-id", runId, "--task", task, "--judge-model", judgeModel] };
}

const defaultRun = (cmd: string, args: string[], cwd: string) => new Promise<{ code: number; stderr: string }>((resolve) => {
  const p = spawn(cmd, args, { cwd, stdio: ["ignore", "inherit", "pipe"] });
  let stderr = "";
  p.stderr.on("data", d => (stderr += d));
  p.on("close", code => resolve({ code: code ?? 1, stderr }));
  p.on("error", err => resolve({ code: 1, stderr: String(err) }));
});

export async function scoreRun(
  harveyLabDir: string, runId: string, task: string,
  opts: { judgeModel?: string; run?: (cmd: string, args: string[], cwd: string) => Promise<{ code: number; stderr: string }>; readScores?: (p: string) => string } = {},
): Promise<JudgeScores> {
  const judgeModel = opts.judgeModel ?? "claude-sonnet-4-6";
  const { cmd, args } = judgeArgvFor(runId, task, judgeModel);
  const run = opts.run ?? defaultRun;
  const { code, stderr } = await run(cmd, args, harveyLabDir);
  if (code !== 0) throw new Error(`run_eval failed (exit ${code}): ${stderr.trim()}`);
  const scoresPath = join(harveyLabDir, "results", runId, "scores.json");
  const read = opts.readScores ?? ((p: string) => readFileSync(p, "utf-8"));
  return JSON.parse(read(scoresPath)) as JudgeScores;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm -C orchestration-eval test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestration-eval/src/judge.ts orchestration-eval/src/judge.test.ts
git commit -m "feat(orchestration-eval): Harvey run_eval judge bridge"
```

---

## Task 8: A/B matrix report

**Files:**
- Create: `orchestration-eval/src/report.ts`, `orchestration-eval/src/report.test.ts`

**Interfaces:**
- Consumes: `JudgeScores` (Task 7), `RunArmResult` (Task 6).
- Produces:
  - `interface CellResult { task: string; arm: Arm; config: string; allPassRuns: number; totalRuns: number; allPassRate: number; meanCostCents: number | null }`
  - `interface RunRecord { task: string; arm: Arm; config: string; allPass: boolean; costCents?: number | null }`
  - `function aggregate(records: RunRecord[]): CellResult[]`
  - `function renderReport(cells: CellResult[], meta: { runsPerCell: number; skipped: Array<{ task: string; reason: string }> }): string`

- [ ] **Step 1: Write the failing test** — `orchestration-eval/src/report.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, renderReport } from "./report.ts";

test("aggregate computes all-pass rate + mean cost per (task,arm,config) cell", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: false, costCents: 100 },
    { task: "t1", arm: "A", config: "sota", allPass: true, costCents: 200 },
    { task: "t1", arm: "B", config: "sota", allPass: true, costCents: 300 },
    { task: "t1", arm: "B", config: "sota", allPass: true, costCents: 500 },
  ]);
  const a = cells.find(c => c.arm === "A")!;
  const b = cells.find(c => c.arm === "B")!;
  assert.equal(a.allPassRate, 0.5);
  assert.equal(a.meanCostCents, 150);
  assert.equal(b.allPassRate, 1.0);
  assert.equal(b.meanCostCents, 400);
});

test("renderReport surfaces the A-vs-B delta and the skipped list", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: false },
    { task: "t1", arm: "B", config: "sota", allPass: true },
  ]);
  const md = renderReport(cells, { runsPerCell: 1, skipped: [{ task: "t9", reason: "multi-step sandbox" }] });
  assert.match(md, /Arm A/);
  assert.match(md, /Arm B/);
  assert.match(md, /SKIPPED/i);
  assert.match(md, /t9/);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `orchestration-eval/src/report.ts`:

```typescript
// orchestration-eval/src/report.ts
import type { Arm } from "./runner.ts";

export interface RunRecord { task: string; arm: Arm; config: string; allPass: boolean; costCents?: number | null; }
export interface CellResult {
  task: string; arm: Arm; config: string;
  allPassRuns: number; totalRuns: number; allPassRate: number; meanCostCents: number | null;
}

export function aggregate(records: RunRecord[]): CellResult[] {
  const byCell = new Map<string, RunRecord[]>();
  for (const r of records) {
    const key = `${r.task}|${r.arm}|${r.config}`;
    (byCell.get(key) ?? byCell.set(key, []).get(key)!).push(r);
  }
  const cells: CellResult[] = [];
  for (const [key, rs] of byCell) {
    const [task, arm, config] = key.split("|");
    const allPassRuns = rs.filter(r => r.allPass).length;
    const costs = rs.map(r => r.costCents).filter((c): c is number => typeof c === "number");
    cells.push({
      task, arm: arm as Arm, config,
      allPassRuns, totalRuns: rs.length,
      allPassRate: rs.length ? allPassRuns / rs.length : 0,
      meanCostCents: costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : null,
    });
  }
  return cells;
}

export function renderReport(cells: CellResult[], meta: { runsPerCell: number; skipped: Array<{ task: string; reason: string }> }): string {
  const lines: string[] = [];
  lines.push(`# Harvey LAB Orchestration A/B — Report`);
  lines.push(``, `Runs per cell (K): ${meta.runsPerCell}. Curated subset only — see SKIPPED below.`, ``);
  lines.push(`| Task | Config | Arm A all-pass | Arm B all-pass | Δ (B−A) | A cost¢ | B cost¢ |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const tasks = [...new Set(cells.map(c => c.task))];
  const configs = [...new Set(cells.map(c => c.config))];
  for (const task of tasks) for (const config of configs) {
    const a = cells.find(c => c.task === task && c.config === config && c.arm === "A");
    const b = cells.find(c => c.task === task && c.config === config && c.arm === "B");
    if (!a && !b) continue;
    const ar = a ? a.allPassRate : 0, br = b ? b.allPassRate : 0;
    lines.push(`| ${task} | ${config} | ${(ar * 100).toFixed(0)}% | ${(br * 100).toFixed(0)}% | ${((br - ar) * 100).toFixed(0)}pp | ${a?.meanCostCents ?? "—"} | ${b?.meanCostCents ?? "—"} |`);
  }
  lines.push(``, `## SKIPPED (out-of-scope v1 — honest coverage)`, ``);
  if (meta.skipped.length === 0) lines.push(`(none)`);
  for (const s of meta.skipped) lines.push(`- \`${s.task}\` — ${s.reason}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm -C orchestration-eval test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add orchestration-eval/src/report.ts orchestration-eval/src/report.test.ts
git commit -m "feat(orchestration-eval): A/B matrix aggregation + report"
```

---

## Task 9: CLI wiring + cost-tuned variant + budgets

**Files:**
- Create: `orchestration-eval/src/index.ts`, `orchestration-eval/bin/orchestration-eval`, `orchestration-eval/src/index.test.ts`
- Modify: `companies/legal-operations/variants.yaml` (add `openrouter-cost`)

**Interfaces:**
- Consumes: `loadBenchmark("lab", repoRoot)` (eval-harness), `runArm`, `scoreRun`, `aggregate`, `renderReport`, `PaperclipEvalClient`.
- Produces: `function parseArgs(argv: string[]): { command: "run" | "list"; benchmark: string; limit?: number; runs: number; config: string; arms: Arm[]; budgetCents?: number }`; a CLI that runs the matrix against a disposable instance and prints the report.

- [ ] **Step 1: Add the cost-tuned variant** — append to `companies/legal-operations/variants.yaml` (mirror the `openrouter` block; cheap lanes use GLM 5.2 / haiku, reasoning lanes stay strong):

```yaml
  openrouter-cost:
    label: "OpenRouter cost-tuned (GLM 5.2 cheap lanes, SOTA reasoning lanes)"
    dataTerms:
      tier: cloud
      zdr: false
      trains: false
      humanReview: false
      tenantIsolated: false
      consumerEndpoint: false
    requires_cli: opencode
    secret_env:
      OPENROUTER_API_KEY: "OpenRouter API Key"
    default:
      adapterType: opencode_local
      adapterConfig:
        model: openrouter/anthropic/claude-opus-4.7
        timeoutSec: 600
        dangerouslySkipPermissions: true
    lanes:
      primary:
        model: openrouter/anthropic/claude-opus-4.7
      routing:
        model: openrouter/z-ai/glm-5.2
      drafting:
        model: openrouter/anthropic/claude-opus-4.7
        timeoutSec: 900
      review:
        model: openrouter/z-ai/glm-5.2
        timeoutSec: 900
      extractive:
        model: openrouter/z-ai/glm-5.2
    per_agent: {}
```

- [ ] **Step 2: Verify variant config still parses**

Run: `python3 bin/_possiblaw_variants.py --self-test`
Expected: OK. Then `./bin/possiblaw --list-variants` lists `openrouter-cost`.

- [ ] **Step 3: Write the failing test** — `orchestration-eval/src/index.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "./index.ts";

test("parseArgs reads run flags with defaults", () => {
  const a = parseArgs(["run", "--benchmark", "lab", "--limit", "3", "--runs", "2", "--config", "openrouter-cost", "--arms", "A,B", "--budget", "500"]);
  assert.equal(a.command, "run");
  assert.equal(a.benchmark, "lab");
  assert.equal(a.limit, 3);
  assert.equal(a.runs, 2);
  assert.equal(a.config, "openrouter-cost");
  assert.deepEqual(a.arms, ["A", "B"]);
  assert.equal(a.budgetCents, 500);
});

test("parseArgs defaults runs=3 and arms=A,B", () => {
  const a = parseArgs(["run", "--benchmark", "lab"]);
  assert.equal(a.runs, 3);
  assert.deepEqual(a.arms, ["A", "B"]);
});

test("parseArgs recognizes list", () => {
  assert.equal(parseArgs(["list"]).command, "list");
});
```

- [ ] **Step 4: Run — verify it fails**

Run: `pnpm -C orchestration-eval test`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement** — `orchestration-eval/src/index.ts` (CLI; the run loop is wired but the live execution is guarded behind env so unit tests only cover `parseArgs`):

```typescript
// orchestration-eval/src/index.ts
import { loadBenchmark } from "../../eval-harness/src/benchmarks.ts";
import { PaperclipEvalClient } from "./paperclip-client.ts";
import { runArm, type Arm } from "./runner.ts";
import { scoreRun } from "./judge.ts";
import { aggregate, renderReport, type RunRecord } from "./report.ts";

export interface ParsedArgs {
  command: "run" | "list"; benchmark: string; limit?: number; runs: number; config: string; arms: Arm[]; budgetCents?: number;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = (argv[0] === "list" ? "list" : "run");
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    command,
    benchmark: get("--benchmark") ?? "lab",
    limit: get("--limit") ? Number(get("--limit")) : undefined,
    runs: get("--runs") ? Number(get("--runs")) : 3,
    config: get("--config") ?? "sota-subscription",
    arms: (get("--arms") ?? "A,B").split(",").map(s => s.trim()) as Arm[],
    budgetCents: get("--budget") ? Number(get("--budget")) : undefined,
  };
}

// Live execution requires a disposable paperclip instance + harvey-lab + ANTHROPIC_API_KEY.
// Driven by env: PAPERCLIP_BASE_URL, PAPERCLIP_COMPANY_ID, PAPERCLIP_API_KEY,
// CHIEF_OF_STAFF_AGENT_ID, HARVEY_LAB_DIR, REPO_ROOT.
export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const repoRoot = process.env.REPO_ROOT ?? process.cwd();
  if (args.command === "list") {
    const cases = loadBenchmark(args.benchmark, repoRoot);
    console.log(`${args.benchmark}: ${cases.length} cases`);
    for (const c of cases) console.log(`  ${c.slug}`);
    return;
  }
  const harveyLabDir = process.env.HARVEY_LAB_DIR ?? `${repoRoot}/harvey-lab`;
  const client = new PaperclipEvalClient({
    baseUrl: process.env.PAPERCLIP_BASE_URL!, companyId: process.env.PAPERCLIP_COMPANY_ID!, apiKey: process.env.PAPERCLIP_API_KEY ?? "",
  });
  if (args.budgetCents) await client.patchCompanyBudget(args.budgetCents);
  const chiefOfStaffAgentId = process.env.CHIEF_OF_STAFF_AGENT_ID!;
  const cases = loadBenchmark(args.benchmark, repoRoot).slice(0, args.limit ?? undefined);
  const resultsDir = `${harveyLabDir}/results`;

  const records: RunRecord[] = [];
  for (const c of cases) {
    const task = (c.metadata?.["task_path"] as string) ?? c.slug;
    for (const arm of args.arms) {
      for (let k = 0; k < args.runs; k++) {
        const runId = `${task.replace(/\//g, "_")}__${arm}__${args.config}__${k}`;
        try {
          const r = await runArm({ caseRec: c, harveyLabDir, resultsDir, runId, arm, chiefOfStaffAgentId, client });
          const scores = await scoreRun(harveyLabDir, runId, task, { judgeModel: c.grading.rubric?.judge_model });
          records.push({ task, arm, config: args.config, allPass: scores.all_pass, costCents: r.costCents ?? null });
        } catch (e) {
          console.error(`run ${runId} failed: ${String(e)}`);
        }
      }
    }
  }
  console.log(renderReport(aggregate(records), { runsPerCell: args.runs, skipped: [] }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 6: Create the bin** — `orchestration-eval/bin/orchestration-eval`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec npx tsx "$DIR/src/index.ts" "$@"
```
Then `chmod +x orchestration-eval/bin/orchestration-eval`.

- [ ] **Step 7: Run — verify pass + list works**

Run: `pnpm -C orchestration-eval test`
Expected: PASS. Then: `REPO_ROOT="$(pwd)" ./orchestration-eval/bin/orchestration-eval list --benchmark lab` prints the curated LAB cases.

- [ ] **Step 8: Commit**

```bash
git add orchestration-eval/src/index.ts orchestration-eval/src/index.test.ts orchestration-eval/bin/orchestration-eval companies/legal-operations/variants.yaml
git commit -m "feat(orchestration-eval): CLI + matrix loop + openrouter-cost variant"
```

---

## Task 10: Live e2e smoke + docs + honest scope + CHANGELOG

**Files:**
- Modify: `docs/operator-test-checklist.md`, `docs/known-limitations.md`, `docs/operator-walkthrough.md`, `CHANGELOG.md`, `CLAUDE.md` (Code Map + Commands)
- Modify: `docs/superpowers/specs/2026-06-22-eval-harness-design.md` (§13 future → shipped subset), if present.

**Interfaces:** none (docs + operator runbook).

- [ ] **Step 1: Operator checklist** — add an "Orchestration eval (Harvey LAB)" section to `docs/operator-test-checklist.md`:
  - `git submodule update --init harvey-lab`
  - prereqs: `uv` installed; `pandoc` installed (`brew install pandoc`); `ANTHROPIC_API_KEY` (judge); `OPENROUTER_API_KEY` (cost runs).
  - launch a disposable instance: `./bin/possiblaw --variant openrouter-cost --port 3199 --gate-port 3899 --data-dir "$(mktemp -d)" --non-interactive --yes --mission "lab eval"` (NEVER port 3100).
  - mint a company-scoped key (`POST /api/agents/:id/keys`), find the `chief-of-staff` agent id (`GET /api/companies/:id/agents`), and a per-practice lead id for Arm A.
  - run: `REPO_ROOT="$(pwd)" PAPERCLIP_BASE_URL=http://127.0.0.1:3199 PAPERCLIP_COMPANY_ID=<co> PAPERCLIP_API_KEY=<key> CHIEF_OF_STAFF_AGENT_ID=<id> ./orchestration-eval/bin/orchestration-eval run --benchmark lab --limit 2 --runs 3 --config openrouter-cost --arms A,B --budget 2000`
  - tear down the disposable instance + `results/` dir; confirm port 3100 untouched.

- [ ] **Step 2: Known-limitations** — add an "Orchestration eval" subsection: curated single-parent-issue subset only; non-fitting tasks SKIPPED (logged); non-determinism averaged over K with variance; deliverable emitted as text (judge reads UTF-8 — fidelity caveat vs native .docx); cost metered only on OpenRouter (subscription = flat); "a curated subset of Harvey LAB (N tasks)", never "we ran Harvey LAB"; Arm A is the strongest single-agent one-shot (not a strawman); `GLM 5.2 ≈ Opus` is UNCONFIRMED — measured by Experiment 2.

- [ ] **Step 3: Walkthrough** — add a short "Measure the thesis (Harvey LAB A/B)" section to `docs/operator-walkthrough.md` pointing at the operator checklist.

- [ ] **Step 4: CHANGELOG + CLAUDE.md** — add a CHANGELOG entry (new `orchestration-eval/` package + LAB adapter + `openrouter-cost` variant + harvey-lab submodule); update `CLAUDE.md` Code Map (new package + submodule) and Commands (`pnpm -C orchestration-eval test`, `git submodule update --init harvey-lab`).

- [ ] **Step 5: Full machine-side test battery**

```bash
pnpm -C orchestration-eval test
pnpm -C orchestration-eval typecheck
pnpm -C eval-harness test
python3 bin/_possiblaw_variants.py --self-test
bash -n bin/possiblaw
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add docs/ CHANGELOG.md CLAUDE.md
git commit -m "docs(orchestration-eval): operator runbook, honest scope, CHANGELOG"
```

---

## Self-Review

**Spec coverage:**
- §4 Harvey facts → Spike Receipts + Task 2 (adapter) + Task 4 (parser) + Task 7 (judge). ✅
- §5 package split + submodule + 5 components → Tasks 1–9. ✅
- §6 two experiments + run matrix + lane-maps → Task 8 (matrix), Task 9 (config + budgets), Task 10 (operator runbook for Exp 1 subscription / Exp 2 OpenRouter). ✅ (Note: `sota-subscription` / `sota-openrouter` are the default `--config` value + the existing `codex`/`claude`/`openrouter` variants; `openrouter-cost` is added in Task 9. Experiment ordering is operator-driven via `--config` + `--variant`.)
- §7 validity → Task 2 manifest (structural inclusion + excluded list), Task 6 (Arm A = manifest doer, not strawman), Task 8 (K-run rate + Δ), Task 10 (honest scope). ✅
- §8 cost/budgets → Task 3 (budget+cost client methods), Task 9 (set budget), report cost columns. ✅
- §9 honest scope → Task 8 SKIPPED section + Task 10 known-limitations. ✅
- §10 spikes S2–S9 → resolved in Spike Receipts (S2 status, S3 work-product read, S4 behavioral arms, S5 manifest rule, S6 client/disposable, S7 UTF-8 deliverable, S8 parse_doc uv, S9 variant+budgets+GLM). ✅
- §12 acceptance → HAPPY (Task 9 `list` + single-arm run), THESIS (Task 8/9 A vs B), COST-FRONTIER (Task 9 `openrouter-cost`), FAILURE/HONESTY (Task 8 SKIPPED + manifest excluded), BUDGET-SAFETY (Task 3/9 budget). ✅

**Placeholder scan:** the only `REPLACE_WITH_…` is the manifest's `submodule_sha`, filled from Task 1 Step 1's `git rev-parse` (concrete action, not a code placeholder). No "TODO/implement later/add error handling" in code steps. ✅

**Type consistency:** `runArm`/`RunArmResult.costCents` flows into `RunRecord.costCents` (Task 6 → 8). `JudgeScores.all_pass` → `RunRecord.allPass` (Task 7 → 9). `Arm` type defined once (Task 6), imported by report (Task 8) + index (Task 9). Client method names (`createIssue`, `putDocument`, `getIssueCostSummary`, `patchCompanyBudget`) consistent across Tasks 3/6/9. ✅

**Note for the implementer:** every code step shows complete code; the live runner (Task 6) and judge (Task 7) are unit-tested with injected fakes (no network), and the real paperclip/judge/parser calls are exercised only by the operator-side e2e (Task 10) on a disposable instance — never port 3100.
