import { readFile } from "node:fs/promises";
import { loadStore, saveStore } from "./store.ts";
import { sanitizeLesson } from "./sanitizer.ts";
import { nextLessonId, setStatus } from "./ledger.ts";
import { appendLesson } from "./memory.ts";
import { topicsAtThreshold } from "./recurrence.ts";
import { loadManifest, saveManifest, upsertDelivery, markProcessed } from "./manifest.ts";
import { hashText } from "./diff.ts";
import type { Lesson, DeliveryRecord } from "./types.ts";
import {
  loadProposals, saveProposals, addProposal, setProposalStatus,
  nextProposalId, writeOverlay,
} from "./proposals.ts";
import type { SkillEditProposal } from "./types.ts";

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function args(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}`) out.push(argv[i + 1]);
  return out;
}
function isoNow(): string {
  return new Date().toISOString();
}

export async function run(argv: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const cmd = argv[0];
    const dir = arg(argv, "business");
    if (!cmd || !dir) return { code: 1, stdout: "usage: <propose|accept|reject|recurring|render> --business <dir> ..." };

    const lessons = await loadStore(dir);

    if (cmd === "propose") {
      const text = arg(argv, "text");
      if (!text || !text.trim()) return { code: 1, stdout: "empty lesson text" };
      const matter = arg(argv, "matter");
      if (!matter || !matter.trim()) return { code: 1, stdout: "missing --matter" };
      const entities = args(argv, "entity");
      const sane = sanitizeLesson(text, entities);
      if (!sane.ok) return { code: 2, stdout: JSON.stringify({ ok: false, violations: sane.violations }) };
      const now = isoNow();
      const id = nextLessonId(lessons, now.slice(0, 10).replace(/-/g, ""));
      const lesson: Lesson = {
        id, createdAt: now, text, topic: arg(argv, "topic") ?? "general", status: "pending",
        sources: [{ matterId: matter, feedback: arg(argv, "feedback") ?? "" }],
      };
      const { lessons: next, action } = appendLesson(lessons, lesson);
      if (action === "duplicate") return { code: 0, stdout: "duplicate" };
      await saveStore(dir, next);
      return { code: 0, stdout: id };
    }

    if (cmd === "accept" || cmd === "reject") {
      const id = arg(argv, "id");
      if (!id) return { code: 1, stdout: "missing --id" };
      const exists = lessons.some((l) => l.id === id);
      if (!exists) return { code: 1, stdout: `unknown id: ${id}` };
      const next = setStatus(lessons, id, cmd === "accept" ? "accepted" : "rejected");
      await saveStore(dir, next);
      return { code: 0, stdout: id };
    }

    if (cmd === "recurring") {
      const n = parseInt(arg(argv, "n") ?? "3", 10);
      return { code: 0, stdout: JSON.stringify(topicsAtThreshold(lessons, n)) };
    }

    if (cmd === "render") {
      await saveStore(dir, lessons);
      return { code: 0, stdout: "rendered" };
    }

    if (cmd === "manifest-add") {
      const fileId = arg(argv, "file-id");
      const kind = arg(argv, "kind");
      const matter = arg(argv, "matter");
      const draftPath = arg(argv, "draft-path");
      if (!fileId || !kind || !matter || !draftPath) {
        return { code: 1, stdout: "manifest-add requires --file-id --kind --matter --draft-path" };
      }
      if (kind !== "onedrive" && kind !== "gdrive") return { code: 1, stdout: `bad --kind: ${kind}` };
      const body = await readFile(draftPath, "utf8");
      const records = await loadManifest(dir);
      const rec: DeliveryRecord = {
        vendorFileId: fileId, destinationKind: kind, driveId: arg(argv, "drive-id"),
        matter, agentId: arg(argv, "agent") ?? "", skillSlug: arg(argv, "skill") ?? "",
        deliveredAt: isoNow(), draftHash: hashText(body), draftPath,
      };
      await saveManifest(dir, upsertDelivery(records, rec));
      return { code: 0, stdout: "ok" };
    }

    if (cmd === "manifest-pending") {
      return { code: 0, stdout: JSON.stringify(await loadManifest(dir)) };
    }

    if (cmd === "manifest-mark") {
      const fileId = arg(argv, "file-id");
      const hash = arg(argv, "hash");
      if (!fileId || !hash) return { code: 1, stdout: "manifest-mark requires --file-id --hash" };
      await saveManifest(dir, markProcessed(await loadManifest(dir), fileId, hash));
      return { code: 0, stdout: "ok" };
    }

    if (cmd === "propose-edit") {
      const skill = arg(argv, "skill");
      const matter = arg(argv, "matter");
      const fileId = arg(argv, "file-id");
      const observed = arg(argv, "observed");
      const edit = arg(argv, "edit");
      const overlayFile = arg(argv, "overlay-file");
      if (!skill || !matter || !fileId || !observed || !edit || !overlayFile) {
        return { code: 1, stdout: "propose-edit requires --skill --matter --file-id --observed --edit --overlay-file" };
      }
      const overlayBody = await readFile(overlayFile, "utf8");
      const entities = args(argv, "entity");
      // Fail-closed: every stored field must pass the ethical wall.
      const checkText = [observed, edit, overlayBody].join("\n");
      const sane = sanitizeLesson(checkText, entities);
      if (!sane.ok) return { code: 2, stdout: JSON.stringify({ ok: false, violations: sane.violations }) };
      const props = await loadProposals(dir);
      const now = isoNow();
      const id = nextProposalId(props, now.slice(0, 10).replace(/-/g, ""));
      const proposal: SkillEditProposal = {
        id, createdAt: now, skillSlug: skill, sourceMatter: matter, vendorFileId: fileId,
        observedChange: observed, generalizedEdit: edit, proposedOverlayBody: overlayBody,
        status: "pending",
      };
      await saveProposals(dir, addProposal(props, proposal));
      return { code: 0, stdout: id };
    }

    if (cmd === "review-list") {
      const props = await loadProposals(dir);
      return { code: 0, stdout: JSON.stringify(props.filter((p) => p.status === "pending")) };
    }

    if (cmd === "approve-edit" || cmd === "reject-edit") {
      const id = arg(argv, "id");
      if (!id) return { code: 1, stdout: "missing --id" };
      const props = await loadProposals(dir);
      const target = props.find((p) => p.id === id);
      if (!target) return { code: 1, stdout: `unknown id: ${id}` };
      if (cmd === "reject-edit") {
        await saveProposals(dir, setProposalStatus(props, id, "rejected"));
        return { code: 0, stdout: id };
      }
      // approve: optional --overlay-file overrides the body (the "edit" path)
      const overlayFile = arg(argv, "overlay-file");
      let body = target.proposedOverlayBody;
      let status: "approved" | "edited" = "approved";
      if (overlayFile) {
        const edited = await readFile(overlayFile, "utf8");
        const sane = sanitizeLesson(edited, args(argv, "entity"));
        if (!sane.ok) return { code: 2, stdout: JSON.stringify({ ok: false, violations: sane.violations }) };
        body = edited;
        status = "edited";
      }
      await writeOverlay(dir, target.skillSlug, body);
      const afterEdit = status === "edited" ? setProposalStatus(props, id, "edited") : props;
      await saveProposals(dir, setProposalStatus(afterEdit, id, "approved"));
      return { code: 0, stdout: id };
    }

    return { code: 1, stdout: `unknown command: ${cmd}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, stdout: msg };
  }
}

// Process entrypoint (not exercised by unit tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((r) => {
    process.stdout.write(r.stdout + "\n");
    process.exit(r.code);
  }).catch((e: unknown) => {
    process.stderr.write(String((e instanceof Error ? e.message : e) ?? e) + "\n");
    process.exit(1);
  });
}
