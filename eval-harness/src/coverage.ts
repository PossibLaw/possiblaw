// eval-harness/src/coverage.ts
// Generates a markdown coverage table showing which agents/skills have eval cases.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCase, CaseParseError } from "./cases/parse.ts";

export interface ParseErrorEntry {
  file: string;
  message: string;
}

/**
 * generateCoverage reads agents/skills directories and cases directory,
 * produces a markdown table of targets and their eval coverage status.
 * Also surfaces any CaseParseErrors in a separate section.
 */
export function generateCoverage(agentsDir: string, skillsDir: string, casesDir: string): string {
  // List all target slugs
  const agentSlugs = listSubdirs(agentsDir).map(slug => ({ slug, type: "agent" as const }));
  const skillSlugs = listSubdirs(skillsDir).map(slug => ({ slug, type: "skill" as const }));
  const allTargets = [...agentSlugs, ...skillSlugs].sort((a, b) => a.slug.localeCompare(b.slug));

  // Parse all case files, collect covered targets and parse errors
  const coveredTargets = new Set<string>();
  const parseErrors: ParseErrorEntry[] = [];

  let caseFiles: string[] = [];
  try {
    caseFiles = readdirSync(casesDir).filter(f => f.endsWith(".md")).sort();
  } catch {
    // cases dir may not exist yet
  }

  for (const file of caseFiles) {
    const filePath = join(casesDir, file);
    const content = readFileSync(filePath, "utf-8");
    const slug = file.replace(/\.md$/, "");
    try {
      const c = parseCase(content, slug);
      coveredTargets.add(c.target);
    } catch (e) {
      if (e instanceof CaseParseError) {
        parseErrors.push({ file, message: e.message });
      } else {
        parseErrors.push({ file, message: String(e) });
      }
    }
  }

  const coveredCount = allTargets.filter(t => coveredTargets.has(t.slug)).length;
  const totalCount = allTargets.length;

  const lines: string[] = [];
  lines.push("# PossibLaw Eval Coverage");
  lines.push("");
  lines.push(`**${coveredCount} covered of ${totalCount} total targets** (${caseFiles.length} case files)`);
  lines.push("");
  lines.push("| target | type | status |");
  lines.push("|---|---|---|");

  for (const { slug, type } of allTargets) {
    const covered = coveredTargets.has(slug);
    const status = covered ? "done ✅" : "TODO ⬜";
    lines.push(`| ${slug} | ${type} | ${status} |`);
  }

  if (parseErrors.length > 0) {
    lines.push("");
    lines.push("## Parse Errors");
    lines.push("");
    lines.push("The following case files could not be parsed and are excluded from coverage:");
    lines.push("");
    for (const { file, message } of parseErrors) {
      lines.push(`- **${file}**: ${message}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function listSubdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}
