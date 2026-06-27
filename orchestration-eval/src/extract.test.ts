import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgvFor, extractDocText, extractTaskDocuments } from "./extract.ts";

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

test("extractTaskDocuments returns [] for a non-existent documents dir without throwing", async () => {
  const result = await extractTaskDocuments("/nonexistent/harvey-lab", "missing-task");
  assert.deepEqual(result, []);
});

test("extractTaskDocuments excludes subdirectories and returns only file entries", async () => {
  // Build: <tmp>/tasks/t1/documents/note.txt  (file, .txt → direct read)
  //        <tmp>/tasks/t1/documents/subdir/   (directory, must be ignored)
  const base = mkdtempSync(join(tmpdir(), "extract-test-"));
  const docsDir = join(base, "tasks", "t1", "documents");
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, "note.txt"), "hello doc", "utf-8");
  mkdirSync(join(docsDir, "subdir"));

  const result = await extractTaskDocuments(base, "t1");

  assert.equal(result.length, 1, "should have exactly one entry (the .txt file)");
  assert.equal(result[0].name, "note.txt");
  assert.equal(result[0].text, "hello doc");
  assert.equal(result[0].skipped, false);
  assert.ok(
    result.every(e => e.name !== "subdir"),
    "subdir must not appear in results",
  );
});
