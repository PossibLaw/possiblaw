// gate-proxy/src/trace-sink.ts
//
// M2 — the seam between the gate proxy and the execution trace store.
//
// Structural on purpose: the gate proxy does not import @possiblaw/trace-store.
// It knows only that something can be handed an egress decision and may return
// a binding to stamp on the receipt. index.ts supplies the real implementation;
// tests supply fakes; a deployment with tracing off supplies nothing.
//
// FAIL-SOFT, and this is the one place in the gate where that is the right
// call. Every other failure here is fail-closed because the thing failing IS
// the control. Tracing is evidence ABOUT a control, not the control itself —
// a trace store that is full, misconfigured, or absent must not block a
// lawful, already-approved egress. A missing binding is visible (the receipt
// simply carries no traceId); a blocked filing because a log was full is an
// outage with a deadline attached.

/** What the gate knows about an action, handed to the trace store. */
export interface TraceSinkInput {
  companyId?: string | undefined;
  issueId?: string | undefined;
  agentId?: string | undefined;
  /** The human principal the agent acted for, when the caller supplied one. */
  requestedBy?: string | undefined;
  tool: string;
  boundary: string | null;
  decision: string | null;
  outcome: string;
  /** Hash of the egress payload; correlates the trace with the receipt. */
  payloadSha256: string;
}

/** What the trace store hands back, to be stamped onto the receipt. */
export interface TraceBinding {
  traceId: string;
  traceSha256: string;
}

/**
 * Record an execution trace and return its binding, or null when tracing is
 * off or the record was not written. Implementations MUST NOT throw; the gate
 * treats a throw as "no binding" but that is a safety net, not a contract.
 */
export type TraceSink = (input: TraceSinkInput) => TraceBinding | null;

/**
 * Call a sink without letting it affect the egress outcome.
 *
 * Returns the binding, or an empty object suitable for spreading into a
 * ReceiptBody when there is nothing to bind.
 */
export function bindTrace(
  sink: TraceSink | null | undefined,
  input: TraceSinkInput,
  onError?: (message: string) => void,
): { traceId?: string; traceSha256?: string } {
  if (!sink) return {};
  let binding: TraceBinding | null;
  try {
    binding = sink(input);
  } catch (err) {
    onError?.(`trace_sink_failed error=${(err as Error).name}`);
    return {};
  }
  if (
    binding === null ||
    typeof binding !== "object" ||
    typeof binding.traceId !== "string" ||
    typeof binding.traceSha256 !== "string" ||
    binding.traceId === "" ||
    binding.traceSha256 === ""
  ) {
    return {};
  }
  return { traceId: binding.traceId, traceSha256: binding.traceSha256 };
}
