// eval-harness/src/cases/parse.ts
import { parse as yamlParse } from "yaml";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Case, GradingMode } from "../types.ts";

export class CaseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaseParseError";
  }
}

const VALID_GRADING_MODES: GradingMode[] = ["deterministic", "rubric"];
const VALID_TARGET_TYPES = ["agent", "skill"] as const;

export function parseCase(markdown: string, slugFallback: string): Case {
  // Split frontmatter: must start with ---\n
  const FM_RE = /^---\n([\s\S]*?)\n---/;
  const match = FM_RE.exec(markdown);
  if (!match) {
    throw new CaseParseError(`No frontmatter found in case (fallback slug: ${slugFallback})`);
  }

  const frontmatterStr = match[1];
  const body = markdown.slice(match[0].length).trim() || undefined;

  let fm: Record<string, unknown>;
  try {
    fm = yamlParse(frontmatterStr) as Record<string, unknown>;
  } catch (e) {
    throw new CaseParseError(`Failed to parse YAML frontmatter: ${String(e)}`);
  }

  if (!fm || typeof fm !== "object") {
    throw new CaseParseError("Frontmatter is not an object");
  }

  // Validate required fields
  const slug = typeof fm.slug === "string" && fm.slug.length > 0 ? fm.slug : slugFallback;
  if (!fm.slug) {
    throw new CaseParseError(`Missing required field: slug`);
  }
  if (typeof fm.target !== "string" || fm.target.length === 0) {
    throw new CaseParseError(`Missing required field: target`);
  }
  if (!VALID_TARGET_TYPES.includes(fm.targetType as "agent" | "skill")) {
    throw new CaseParseError(`Missing or invalid required field: targetType (must be agent|skill), got: ${JSON.stringify(fm.targetType)}`);
  }
  if (typeof fm.input_brief !== "string" || fm.input_brief.length === 0) {
    throw new CaseParseError(`Missing required field: input_brief`);
  }

  // Validate grading
  const grading = fm.grading as Record<string, unknown> | undefined;
  if (!grading || typeof grading !== "object") {
    throw new CaseParseError(`Missing required field: grading`);
  }
  if (!VALID_GRADING_MODES.includes(grading.mode as GradingMode)) {
    throw new CaseParseError(`Invalid grading.mode: ${JSON.stringify(grading.mode)} (must be deterministic|rubric)`);
  }

  // Build source with defaults
  let source: Case["source"] = { kind: "local" };
  if (fm.source && typeof fm.source === "object") {
    const s = fm.source as Record<string, unknown>;
    const kind = s.kind as "local" | "benchmark" | "external";
    source = { kind: kind ?? "local", ...(s.name ? { name: String(s.name) } : {}) };
  }

  return {
    slug: String(fm.slug),
    target: String(fm.target),
    targetType: fm.targetType as "agent" | "skill",
    project: typeof fm.project === "string" ? fm.project : undefined,
    lane: typeof fm.lane === "string" ? fm.lane : undefined,
    input_brief: String(fm.input_brief),
    documents: Array.isArray(fm.documents) ? (fm.documents as string[]) : [],
    grading: grading as Case["grading"],
    source,
    metadata: fm.metadata as Record<string, unknown> | undefined,
    body,
  };
}

export function loadCasesForTarget(casesDir: string, target: string): Case[] {
  const files = readdirSync(casesDir).filter(f => f.endsWith(".md"));
  const cases: Case[] = [];
  for (const file of files) {
    const content = readFileSync(join(casesDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
    try {
      const c = parseCase(content, slug);
      if (c.target === target) cases.push(c);
    } catch {
      // skip unparseable files (report-level error handling is caller's job)
    }
  }
  return cases;
}
