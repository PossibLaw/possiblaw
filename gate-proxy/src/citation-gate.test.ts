// gate-proxy/src/citation-gate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, postEgress, registerCitation } from "./test-helpers.ts"; // reuse/extend existing server.test harness

test("gated boundary with no registered citation verification is blocked 403", async () => {
  const srv = await startTestServer();
  const res = await postEgress(srv, "file_court_document", { documentText: "Plaintiff cites 410 U. S. 113." });
  assert.equal(res.status, 403);
  assert.match(res.body.reason as string, /citation_gate/);
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
  assert.match(res.body.reason as string, /citation_gate.*document/);
  await srv.close();
});

test("non-gated boundary is unaffected by the citation gate", async () => {
  const srv = await startTestServer();
  const res = await postEgress(srv, "send_payment", { amount: 1 });
  assert.doesNotMatch(JSON.stringify(res.body), /citation_gate/);
  await srv.close();
});
