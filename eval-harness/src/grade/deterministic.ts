// eval-harness/src/grade/deterministic.ts
import type { DeterministicCheck } from "../types.ts";
import { tokenF1 } from "./tokenf1.ts";

export interface CheckResult {
  id: string;
  pass: boolean;
  score: number;
  detail: string;
}

export function runDeterministic(
  output: string,
  checks: DeterministicCheck[],
): { score: number; pass: boolean; results: CheckResult[] } {
  if (checks.length === 0) {
    return { score: 1, pass: true, results: [] };
  }

  const results: CheckResult[] = checks.map(check => gradeCheck(output, check));
  const score = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const pass = results.every(r => r.pass);

  return { score, pass, results };
}

function gradeCheck(output: string, check: DeterministicCheck): CheckResult {
  switch (check.type) {
    case "regex": {
      const pattern = check.pattern ?? "";
      // Support (?i) prefix for case-insensitive
      const flags = pattern.startsWith("(?i)") ? "i" : "";
      const cleanPattern = pattern.startsWith("(?i)") ? pattern.slice(4) : pattern;
      const re = new RegExp(cleanPattern, flags);
      const pass = re.test(output);
      return { id: check.id, pass, score: pass ? 1 : 0, detail: pass ? "matched" : `pattern not found: ${pattern}` };
    }
    case "contains": {
      const value = check.value ?? "";
      const pass = output.includes(value);
      return { id: check.id, pass, score: pass ? 1 : 0, detail: pass ? "found" : `value not found: ${value}` };
    }
    case "golden": {
      const value = check.value ?? "";
      const threshold = check.threshold ?? 0.8;
      const score = tokenF1(output, value);
      const pass = score >= threshold;
      return { id: check.id, pass, score, detail: `tokenF1=${score.toFixed(3)} (threshold=${threshold})` };
    }
    case "schema": {
      let pass = false;
      try {
        const parsed = JSON.parse(output);
        pass = typeof parsed === "object" && parsed !== null;
      } catch {
        pass = false;
      }
      return { id: check.id, pass, score: pass ? 1 : 0, detail: pass ? "valid JSON object" : "invalid JSON or not an object" };
    }
    default: {
      return { id: check.id, pass: false, score: 0, detail: `unknown check type: ${(check as DeterministicCheck).type}` };
    }
  }
}
