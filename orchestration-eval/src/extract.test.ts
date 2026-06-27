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
