// gate-proxy/src/citation-gate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, postEgress, registerCitation, registerAuthority } from "./test-helpers.ts"; // reuse/extend existing server.test harness

/** Find the latest performed send_email egress receipt's meta.provenance. */
function latestProvenance(srv: Awaited<ReturnType<typeof startTestServer>>): {
  segmentCount: number;
  summary: { sourced: number; quoted: number; unsourced: number };
  segments: Array<{ index: number; kind: string; citation?: string }>;
} | undefined {
  const eg = srv.receipts
    .entries()
    .filter((e) => e.body.kind === "egress" && e.body.tool === "send_email" && e.body.outcome === "performed");
  const meta = eg.length > 0 ? eg[eg.length - 1].body.meta : undefined;
  return meta?.["provenance"] as ReturnType<typeof latestProvenance>;
}

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
  // Passed the citation gate → reaches the human gate (503 with the null client
  // in this harness). Crucially, it is NOT a citation-gate block.
  assert.equal(res.status, 503);
  assert.doesNotMatch(JSON.stringify(res.body), /citation_gate/);
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

test("gated boundary with a citation-free document passes the gate (only citation-bearing docs are gated)", async () => {
  const srv = await startTestServer();
  // A filing body with no detectable legal citations → nothing to verify →
  // the citation gate does not fire; the request proceeds to the normal gates.
  const res = await postEgress(srv, "file_court_document", { documentText: "Notice of appearance. No legal authorities are cited here." });
  assert.doesNotMatch(JSON.stringify(res.body), /citation_gate/);
  await srv.close();
});

test("PROVENANCE: a segment citing a RETRIEVED authority is recorded sourced; argument is unsourced", async () => {
  const srv = await startTestServer();
  try {
    const doc = "Background argument with no authority cited here.\n\nThe court held in 410 U.S. 113 that the right applies.";
    await registerAuthority(srv, { citation: "410 U.S. 113", sha256: "a".repeat(64), source: "courtlistener" });
    await registerCitation(srv, doc, [{ citation: "410 U.S. 113", match: "Yes" }]);

    const res = await postEgress(srv, "send_email", { body: doc });
    assert.equal(res.status, 200);

    const prov = latestProvenance(srv);
    assert.ok(prov, "expected provenance recorded on the egress receipt");
    assert.equal(prov.segmentCount, 2);
    assert.deepEqual(prov.summary, { sourced: 1, quoted: 0, unsourced: 1 });
    assert.equal(prov.segments[0].kind, "unsourced");
    assert.equal(prov.segments[1].kind, "sourced");
    assert.equal(prov.segments[1].citation, "410 U.S. 113");
  } finally {
    await srv.close();
  }
});

test("PROVENANCE: a cited-but-never-retrieved authority leaves its segment unsourced", async () => {
  const srv = await startTestServer();
  try {
    const doc = "We rely on 999 F.3d 100 for this proposition.";
    // Citation verification registered (so the gate passes) but NO authority retrieval.
    await registerCitation(srv, doc, [{ citation: "999 F.3d 100", match: "Yes" }]);

    const res = await postEgress(srv, "send_email", { body: doc });
    assert.equal(res.status, 200);

    const prov = latestProvenance(srv);
    assert.ok(prov, "expected provenance recorded on the egress receipt");
    assert.equal(prov.summary.sourced, 0);
    assert.equal(prov.segments[0].kind, "unsourced");
  } finally {
    await srv.close();
  }
});

test("PROVENANCE: a citation-free document records all-unsourced provenance", async () => {
  const srv = await startTestServer();
  try {
    const doc = "Notice of appearance.\n\nNo legal authorities are cited in this message.";
    const res = await postEgress(srv, "send_email", { body: doc });
    assert.equal(res.status, 200);

    const prov = latestProvenance(srv);
    assert.ok(prov, "expected provenance recorded even with no citations");
    assert.equal(prov.segmentCount, 2);
    assert.deepEqual(prov.summary, { sourced: 0, quoted: 0, unsourced: 2 });
  } finally {
    await srv.close();
  }
});
