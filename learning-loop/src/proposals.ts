import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillEditProposal, ProposalStatus } from "./types.ts";

export function nextProposalId(existing: SkillEditProposal[], dateStr: string): string {
  const prefix = `SEP-${dateStr}-`;
  const nums = existing.filter((p) => p.id.startsWith(prefix))
    .map((p) => parseInt(p.id.slice(prefix.length), 10)).filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function serializeProposals(p: SkillEditProposal[]): string {
  return p.map((x) => JSON.stringify(x)).join("\n") + (p.length ? "\n" : "");
}

export function parseProposals(jsonl: string): SkillEditProposal[] {
  return jsonl.split("\n").map((s) => s.trim()).filter(Boolean)
    .map((s) => JSON.parse(s) as SkillEditProposal);
}

export async function loadProposals(businessDir: string): Promise<SkillEditProposal[]> {
  try {
    const raw = await readFile(join(businessDir, "proposals", "proposals.jsonl"), "utf8");
    return parseProposals(raw);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function saveProposals(businessDir: string, p: SkillEditProposal[]): Promise<void> {
  const dir = join(businessDir, "proposals");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "proposals.jsonl"), serializeProposals(p), "utf8");
}

export function addProposal(existing: SkillEditProposal[], p: SkillEditProposal): SkillEditProposal[] {
  return [...existing, p];
}

const VALID: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ["approved", "rejected", "edited"],
  edited: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function setProposalStatus(
  existing: SkillEditProposal[], id: string, status: ProposalStatus,
): SkillEditProposal[] {
  return existing.map((p) => {
    if (p.id !== id) return p;
    if (!VALID[p.status].includes(status)) {
      throw new Error(`invalid status transition ${p.status} -> ${status} for ${id}`);
    }
    return { ...p, status };
  });
}

export async function writeOverlay(businessDir: string, skillSlug: string, body: string): Promise<void> {
  const dir = join(businessDir, "skill-overlays", skillSlug);
  await mkdir(dir, { recursive: true });
  const cur = join(dir, "SKILL.md");
  try {
    const prior = await readFile(cur, "utf8");
    await writeFile(join(dir, "SKILL.md.prev"), prior, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await writeFile(cur, body, "utf8");
}
