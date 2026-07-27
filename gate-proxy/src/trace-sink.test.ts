// gate-proxy/src/trace-sink.test.ts
//
// M2 — the receipt<->trace binding, and the fail-soft contract around it.
//
// The binding half is small; the property worth defending is that tracing can
// never take down an egress. Every other failure in the gate is fail-closed
// because the failing thing IS the control. A trace is evidence ABOUT a
// control — blocking an approved court filing because a log was full would be
// an outage with a deadline attached.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bindTrace, type TraceSink, type TraceSinkInput } from "./trace-sink.ts";

const INPUT: TraceSinkInput = {
  issueId: "POS-42",
  agentId: "agent-1",
  requestedBy: "user-partner-z",
  tool: "send_email",
  boundary: "THIRD_PARTY_EGRESS",
  decision: "human",
  outcome: "performed",
  payloadSha256: "a".repeat(64),
};

describe("bindTrace", () => {
  it("returns the binding a healthy sink produces", () => {
    const sink: TraceSink = () => ({ traceId: "t-1", traceSha256: "b".repeat(64) });
    assert.deepEqual(bindTrace(sink, INPUT), {
      traceId: "t-1",
      traceSha256: "b".repeat(64),
    });
  });

  it("hands the sink everything needed to attribute the action", () => {
    const captured: TraceSinkInput[] = [];
    bindTrace((i) => {
      captured.push(i);
      return null;
    }, INPUT);
    const seen = captured[0];
    assert.ok(seen);
    // Both halves of accountability: which agent, and which human it acted for.
    assert.equal(seen.agentId, "agent-1");
    assert.equal(seen.requestedBy, "user-partner-z");
    assert.equal(seen.issueId, "POS-42");
    // And the correlation key back to the receipt.
    assert.equal(seen.payloadSha256, "a".repeat(64));
  });

  it("stamps nothing when tracing is off", () => {
    assert.deepEqual(bindTrace(null, INPUT), {});
    assert.deepEqual(bindTrace(undefined, INPUT), {});
  });

  it("stamps nothing when the sink declines to record", () => {
    assert.deepEqual(bindTrace(() => null, INPUT), {});
  });

  it("survives a throwing sink and reports it", () => {
    const lines: string[] = [];
    const result = bindTrace(
      () => {
        throw new TypeError("trace store exploded");
      },
      INPUT,
      (l) => lines.push(l),
    );
    assert.deepEqual(result, {}, "egress proceeds with no binding");
    assert.equal(lines.length, 1);
    assert.match(lines[0] as string, /trace_sink_failed/);
    // The failure is logged but the error itself is not — a trace-store error
    // could carry content, and this string is operator-visible.
    assert.doesNotMatch(lines[0] as string, /exploded/);
  });

  it("rejects malformed bindings rather than stamping junk on a receipt", () => {
    const bad: unknown[] = [
      { traceId: "t-1" }, // missing hash
      { traceSha256: "b".repeat(64) }, // missing id
      { traceId: "", traceSha256: "b".repeat(64) }, // empty id
      { traceId: "t-1", traceSha256: "" }, // empty hash
      { traceId: 7, traceSha256: "b".repeat(64) }, // wrong type
      "not-an-object",
      42,
    ];
    for (const b of bad) {
      assert.deepEqual(
        bindTrace((() => b) as unknown as TraceSink, INPUT),
        {},
        `must not stamp: ${JSON.stringify(b)}`,
      );
    }
  });
});
