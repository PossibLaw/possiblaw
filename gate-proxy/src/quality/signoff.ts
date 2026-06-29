// gate-proxy/src/quality/signoff.ts
// Matter Trust Report bundle assembler.
//
// Reads EXISTING receipt structures (gate-proxy/src/receipts.ts) for a single
// matter (issueId) and emits a regulator-readable bundle in two forms: a JSON
// object and a rendered Markdown "Matter Trust Report" string. This adds no new
// trust surface, no new persistence, and no new external dependency — it is a
// pure projection over the receipt chain.
//
// SECURITY INVARIANT (reproduces the receipt invariant): the bundle carries
// payloadSha256 ONLY. It never carries plaintext and never copies a raw `meta`
// object through. Only a fixed allow-list of non-payload audit fields is read
// out of meta (reason, claimedConfidentiality, routedLocal, dataTermsTier,
// maskedTokenCount, citation/row counts). Callers MUST NOT place payload
// fragments in those fields per the ReceiptBody contract; this assembler does
// not introduce any path by which an arbitrary meta value reaches output.
//
// FAIL-CLOSED: assembly verifies chain integrity first and refuses to emit a
// "clean" report over a corrupt chain — it throws ReceiptChainCorruptError so
// the caller route returns an error rather than a falsely reassuring bundle.

import { ReceiptChain, ReceiptChainCorruptError } from "../receipts.ts";
import type { ReceiptEntry, ReceiptBody, ReceiptOutcome, BoundaryType, Decision } from "../receipts.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One receipt as projected into the bundle — hashes only, never payloads. */
export interface BundleReceipt {
  seq: number;
  ts: string;
  kind: ReceiptBody["kind"];
  tool: string;
  boundary: BoundaryType | null;
  decision: Decision | null;
  outcome: ReceiptOutcome;
  payloadSha256: string;
  agentId?: string;
  issueId?: string;
  approvalId?: string;
  hash: string;
}

/** A blocked egress with its (non-payload) reason for the regulator story. */
export interface BlockedEgress extends BundleReceipt {
  reason?: string;
}

/** A tier-floor decision: did a confidential matter stay local. */
export interface TierFloorDecision {
  seq: number;
  ts: string;
  tool: string;
  payloadSha256: string;
  routedLocal: boolean;
  claimedConfidentiality?: string;
  dataTermsTier?: string;
}

/** Operator / lawyer attestation: who approved, when, against which hash. */
export interface Attestation {
  approvalId: string;
  agentId?: string;
  ts: string;
  payloadSha256: string;
  tool: string;
  boundary: BoundaryType | null;
}

/** A retrieved-authority registration (from POST /quality/authority). */
export interface AuthorityRegistration {
  seq: number;
  ts: string;
  normalizedCitation: string;
  authoritySha256: string;
  source?: string;
  sourceUrl?: string;
  retrievedAt?: string;
}

/** An egress receipt that recorded one or more cited-but-never-retrieved authorities. */
export interface UnbackedCitationRecord {
  seq: number;
  ts: string;
  tool: string;
  outcome: ReceiptOutcome;
  payloadSha256: string;
  unbackedCitations: string[];
}

/**
 * One firm-facade action as projected into the Matter Trust Report.
 * Carries hashes and non-payload audit identifiers only — never plaintext.
 *
 * displayStatus renders the outcome in regulator-readable language:
 *   - "pending" (request_approval) → "requested — pending human approval"
 *   - "performed" → "performed"
 *   - etc.
 * A pending approval request is NEVER shown as attested; it is always clearly
 * labelled as a pending request awaiting human decision.
 */
export interface FirmFacadeActivity {
  seq: number;
  ts: string;
  tool: string;
  outcome: ReceiptOutcome;
  payloadSha256: string;
  /** Present on request_approval receipts. */
  approvalId?: string;
  /** Present on fetch_work_product receipts (from meta.workProductId). */
  workProductId?: string;
  /** Present on fetch_work_product receipts (from meta.textDisclosed). */
  textDisclosed?: boolean;
  /**
   * Regulator-readable status — never confuses a pending request with an approval.
   * "outcome:pending" → "requested — pending human approval"
   */
  displayStatus: string;
}

/**
 * One computed deadline as projected into the Matter Trust Report.
 * Carries date/rule/jurisdiction/direction/days + the computation sha only —
 * no matter content, no privileged text.
 */
export interface ComputedDeadlineEntry {
  seq: number;
  ts: string;
  /** The computed deadline date (YYYY-MM-DD). */
  deadline: string;
  /** The rule applied — e.g. "FRCP-6". */
  rule: string;
  /** Jurisdiction key — e.g. "US-FED". */
  jurisdiction: string;
  /** "forward" or "backward". */
  direction: string;
  /** Period in calendar days. */
  days: number;
  /** Whether FRCP 6(d) mail service (+3 days, forward only) was applied. */
  serviceByMail: boolean;
  /** SHA-256 of the deterministic computation input (from the deadline-calculator skill). */
  payloadSha256: string;
}

/** Authority provenance: what was retrieved + which outbound citations were unbacked. */
export interface AuthorityProvenance {
  registrations: AuthorityRegistration[];
  unbacked: UnbackedCitationRecord[];
}

/** One segment's provenance as projected into the report (hashes/indices only — never text). */
export interface SegmentProvenanceRow {
  index: number;
  segmentSha256: string;
  /** "sourced" | "quoted" | "unsourced". */
  kind: string;
  /** The backing citation token when kind === "sourced". */
  citation?: string;
}

/** Per-segment provenance recorded on one outbound document's egress receipt. */
export interface DocumentProvenanceRecord {
  seq: number;
  ts: string;
  tool: string;
  outcome: ReceiptOutcome;
  documentSha256: string;
  segmentCount: number;
  summary: { sourced: number; quoted: number; unsourced: number };
  segments: SegmentProvenanceRow[];
}

/** Matter-wide rollup of per-segment provenance. */
export interface ProvenanceTotals {
  documents: number;
  segments: number;
  sourced: number;
  quoted: number;
  unsourced: number;
}

export interface ProvenanceProjection {
  totals: ProvenanceTotals;
  documents: DocumentProvenanceRecord[];
}

export interface SignoffBundle {
  issueId: string;
  generatedAt: string;
  chain: { ok: boolean; length: number; head: string };
  receipts: BundleReceipt[];
  anonymizationEvents: BundleReceipt[];
  citationVerifications: BundleReceipt[];
  authorityProvenance: AuthorityProvenance;
  /**
   * Per-segment provenance for this matter's outbound documents, recorded on the
   * egress receipt's meta.provenance by the citation gate. Document-level rollup
   * plus the per-segment kinds/shas — never any segment text (hash-only).
   */
  provenance: ProvenanceProjection;
  tierFloorDecisions: TierFloorDecision[];
  blockedEgress: BlockedEgress[];
  attestations: Attestation[];
  /**
   * Firm-facade actions performed on this matter.
   * Separate from attestations: facade approval requests are PENDING requests,
   * never board-decided attestations — the attestations section excludes kind:"firm_facade".
   */
  firmFacadeActivity: FirmFacadeActivity[];
  /**
   * Computed deadlines recorded via POST /receipts/deadline for this matter.
   * Each row carries date/rule/jurisdiction facts + the computation sha only —
   * no matter content. v1: US-FED FRCP Rule 6 only.
   */
  deadlines: ComputedDeadlineEntry[];
}

// ---------------------------------------------------------------------------
// meta read helpers — fixed allow-list of non-payload audit fields only
// ---------------------------------------------------------------------------

function metaString(body: ReceiptBody, key: string): string | undefined {
  const v = body.meta?.[key];
  return typeof v === "string" ? v : undefined;
}

function metaBool(body: ReceiptBody, key: string): boolean {
  return body.meta?.[key] === true;
}

/** Read a string[] from a meta field — non-strings dropped, non-arrays → []. */
function metaStringArray(body: ReceiptBody, key: string): string[] {
  const v = body.meta?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Parse the meta.provenance object the citation gate records on a document-
 * bearing egress receipt. Defensive: any field with the wrong type is coerced to
 * a safe default; a missing/non-object provenance returns null. Reads shas,
 * indices, kinds, and citation tokens only — never any segment text.
 */
function metaProvenance(body: ReceiptBody): {
  documentSha256: string;
  segmentCount: number;
  summary: { sourced: number; quoted: number; unsourced: number };
  segments: SegmentProvenanceRow[];
} | null {
  const p = body.meta?.["provenance"];
  if (p === null || typeof p !== "object" || Array.isArray(p)) return null;
  const obj = p as Record<string, unknown>;

  const s = obj["summary"];
  const so = s !== null && typeof s === "object" && !Array.isArray(s)
    ? (s as Record<string, unknown>)
    : {};
  const summary = { sourced: num(so["sourced"]), quoted: num(so["quoted"]), unsourced: num(so["unsourced"]) };

  const rawSegs = Array.isArray(obj["segments"]) ? obj["segments"] : [];
  const segments: SegmentProvenanceRow[] = [];
  for (const r of rawSegs) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) continue;
    const ro = r as Record<string, unknown>;
    const row: SegmentProvenanceRow = {
      index: num(ro["index"]),
      segmentSha256: typeof ro["segmentSha256"] === "string" ? ro["segmentSha256"] : "",
      kind: typeof ro["kind"] === "string" ? ro["kind"] : "unsourced",
    };
    if (typeof ro["citation"] === "string") row.citation = ro["citation"];
    segments.push(row);
  }

  return {
    documentSha256: typeof obj["documentSha256"] === "string" ? obj["documentSha256"] : "",
    segmentCount: num(obj["segmentCount"]),
    summary,
    segments,
  };
}

// ---------------------------------------------------------------------------
// Projection — strips everything except hashes + audit identifiers
// ---------------------------------------------------------------------------

function projectReceipt(entry: ReceiptEntry): BundleReceipt {
  const b = entry.body;
  const r: BundleReceipt = {
    seq: entry.seq,
    ts: entry.ts,
    kind: b.kind,
    tool: b.tool,
    boundary: b.boundary,
    decision: b.decision,
    outcome: b.outcome,
    payloadSha256: b.payloadSha256,
    hash: entry.hash,
  };
  if (b.agentId !== undefined) r.agentId = b.agentId;
  if (b.issueId !== undefined) r.issueId = b.issueId;
  if (b.approvalId !== undefined) r.approvalId = b.approvalId;
  return r;
}

// ---------------------------------------------------------------------------
// assembleSignoffBundle
// ---------------------------------------------------------------------------

/**
 * Assemble a Matter Trust Report bundle for one matter.
 *
 * @param chainOrPath an existing ReceiptChain instance, or a receipts file path.
 * @param issueId     the matter id; receipts are filtered on body.issueId.
 *
 * FAIL-CLOSED: verifies chain integrity first. On a corrupt chain (hash
 * mismatch, broken linkage, unparseable line) it throws
 * ReceiptChainCorruptError and emits NO bundle — a corrupt ledger must never
 * masquerade as a clean compliance report.
 */
export function assembleSignoffBundle(
  chainOrPath: ReceiptChain | string,
  issueId: string,
): SignoffBundle {
  const chain = typeof chainOrPath === "string" ? new ReceiptChain(chainOrPath) : chainOrPath;

  // 1. Fail-closed integrity check BEFORE trusting any entry.
  const chainResult = chain.verify();
  if (!chainResult.ok) {
    throw new ReceiptChainCorruptError(
      `Matter Trust Report refused: receipt chain failed integrity verification ` +
        `(line ${chainResult.badSeq}: ${chainResult.reason}). ` +
        `A corrupt ledger cannot produce a clean compliance report; ` +
        `repair the chain and re-anchor before regenerating.`,
    );
  }

  // 2. entries() throws ReceiptChainCorruptError on any structurally bad line —
  //    re-checked here as defence in depth (verify() already passed above).
  const all = chain.entries();
  const matter = all.filter((e) => e.body.issueId === issueId);

  const receipts = matter.map(projectReceipt);

  const anonymizationEvents = matter
    .filter((e) => e.body.outcome === "anonymized_performed")
    .map(projectReceipt);

  const citationVerifications = matter
    .filter((e) => e.body.kind === "quality" && e.body.tool === "citation_verification")
    .map(projectReceipt);

  // Authority provenance.
  // Registrations (POST /quality/authority) are matter-AGNOSTIC: the legal-data
  // MCP reports a retrieval once for the firm, not per matter, so they carry no
  // issueId. We surface ALL retrieved-authority registrations from the chain so
  // a regulator can see the pool of authorities that back this matter's
  // citations. Hashes + public citation identifiers + source only — never text.
  const authorityRegistrations: AuthorityRegistration[] = all
    .filter((e) => e.body.kind === "quality" && e.body.tool === "authority_provenance" && e.body.outcome === "performed")
    .map((e) => {
      const r: AuthorityRegistration = {
        seq: e.seq,
        ts: e.ts,
        normalizedCitation: metaString(e.body, "normalizedCitation") ?? "",
        authoritySha256: metaString(e.body, "authoritySha256") ?? e.body.payloadSha256,
      };
      const source = metaString(e.body, "source");
      if (source !== undefined) r.source = source;
      const sourceUrl = metaString(e.body, "sourceUrl");
      if (sourceUrl !== undefined) r.sourceUrl = sourceUrl;
      const retrievedAt = metaString(e.body, "retrievedAt");
      if (retrievedAt !== undefined) r.retrievedAt = retrievedAt;
      return r;
    });

  // Unbacked-citation records ride on THIS matter's egress receipts (the gate
  // recorded meta.unbackedCitations when a filing cited a never-retrieved
  // authority). These are the matter-scoped hallucination signals.
  const unbackedRecords: UnbackedCitationRecord[] = matter
    .filter((e) => e.body.kind === "egress" && metaStringArray(e.body, "unbackedCitations").length > 0)
    .map((e) => ({
      seq: e.seq,
      ts: e.ts,
      tool: e.body.tool,
      outcome: e.body.outcome,
      payloadSha256: e.body.payloadSha256,
      unbackedCitations: metaStringArray(e.body, "unbackedCitations"),
    }));

  const authorityProvenance: AuthorityProvenance = {
    registrations: authorityRegistrations,
    unbacked: unbackedRecords,
  };

  // Per-segment provenance — projected from THIS matter's egress receipts whose
  // meta.provenance the citation gate recorded. Document-level rollup + the
  // per-segment kinds/shas/citations only (never text).
  const provenanceDocuments: DocumentProvenanceRecord[] = [];
  const provenanceTotals: ProvenanceTotals = {
    documents: 0, segments: 0, sourced: 0, quoted: 0, unsourced: 0,
  };
  for (const e of matter) {
    if (e.body.kind !== "egress") continue;
    const p = metaProvenance(e.body);
    if (p === null) continue;
    provenanceDocuments.push({
      seq: e.seq,
      ts: e.ts,
      tool: e.body.tool,
      outcome: e.body.outcome,
      documentSha256: p.documentSha256,
      segmentCount: p.segmentCount,
      summary: p.summary,
      segments: p.segments,
    });
    provenanceTotals.documents++;
    provenanceTotals.segments += p.segmentCount;
    provenanceTotals.sourced += p.summary.sourced;
    provenanceTotals.quoted += p.summary.quoted;
    provenanceTotals.unsourced += p.summary.unsourced;
  }
  const provenance: ProvenanceProjection = {
    totals: provenanceTotals,
    documents: provenanceDocuments,
  };

  const tierFloorDecisions: TierFloorDecision[] = matter
    .filter((e) => metaBool(e.body, "routedLocal") || metaString(e.body, "dataTermsTier") !== undefined)
    .map((e) => {
      const d: TierFloorDecision = {
        seq: e.seq,
        ts: e.ts,
        tool: e.body.tool,
        payloadSha256: e.body.payloadSha256,
        routedLocal: metaBool(e.body, "routedLocal"),
      };
      const conf = metaString(e.body, "claimedConfidentiality");
      if (conf !== undefined) d.claimedConfidentiality = conf;
      const tier = metaString(e.body, "dataTermsTier");
      if (tier !== undefined) d.dataTermsTier = tier;
      return d;
    });

  const blockedEgress: BlockedEgress[] = matter
    .filter((e) => e.body.kind === "egress" && e.body.outcome === "blocked")
    .map((e) => {
      const r: BlockedEgress = projectReceipt(e);
      const reason = metaString(e.body, "reason");
      if (reason !== undefined) r.reason = reason;
      return r;
    });

  // ATTESTATIONS — board-decided approvals only.
  // SECURITY INVARIANT: kind:"firm_facade" and kind:"deadline" receipts are
  // EXCLUDED here by name. A facade request_approval carries an approvalId and
  // outcome:"pending" — it is a REQUEST, not a board decision. A deadline receipt
  // never carries an approvalId today, but the explicit guard is defense-in-depth:
  // a future deadline extension that ever set approvalId must NEVER leak into the
  // attestations (board-decision) section. Facade activity and deadlines are
  // surfaced in their own sections (firmFacadeActivity / deadlines) below.
  const attestations: Attestation[] = matter
    .filter(
      (e) =>
        e.body.kind !== "firm_facade" &&
        e.body.kind !== "deadline" &&
        e.body.approvalId !== undefined &&
        e.body.approvalId !== "",
    )
    .map((e) => {
      const a: Attestation = {
        approvalId: e.body.approvalId as string,
        ts: e.ts,
        payloadSha256: e.body.payloadSha256,
        tool: e.body.tool,
        boundary: e.body.boundary,
      };
      if (e.body.agentId !== undefined) a.agentId = e.body.agentId;
      return a;
    });

  // FIRM FACADE ACTIVITY — projected from kind:"firm_facade" receipts for this matter.
  // Each row carries the facade tool name, outcome, and non-privileged audit identifiers.
  // displayStatus renders the outcome in regulator-readable language; "pending" is
  // always shown as "requested — pending human approval" (never as "approved/attested").
  const firmFacadeActivity: FirmFacadeActivity[] = matter
    .filter((e) => e.body.kind === "firm_facade")
    .map((e) => {
      const outcome = e.body.outcome;
      const displayStatus =
        outcome === "pending"
          ? "requested — pending human approval"
          : outcome === "anonymized_performed"
            ? "performed (anonymized)"
            : String(outcome);

      const row: FirmFacadeActivity = {
        seq: e.seq,
        ts: e.ts,
        tool: e.body.tool,
        outcome,
        payloadSha256: e.body.payloadSha256,
        displayStatus,
      };
      if (e.body.approvalId !== undefined) row.approvalId = e.body.approvalId;
      // workProductId and textDisclosed live in meta on fetch_work_product receipts
      const wpId = metaString(e.body, "workProductId");
      if (wpId !== undefined) row.workProductId = wpId;
      const textDisclosedRaw = e.body.meta?.["textDisclosed"];
      if (typeof textDisclosedRaw === "boolean") row.textDisclosed = textDisclosedRaw;
      return row;
    });

  // COMPUTED DEADLINES — projected from kind:"deadline" receipts for this matter.
  // Carries date/rule/jurisdiction/direction/days + computation sha only — no
  // matter content, no privileged text (the deadline-calculator skill never posts
  // matter text into the receipt; only the deterministic date/rule facts).
  const deadlines: ComputedDeadlineEntry[] = matter
    .filter((e) => e.body.kind === "deadline")
    .map((e) => ({
      seq: e.seq,
      ts: e.ts,
      deadline: metaString(e.body, "deadline") ?? "",
      rule: metaString(e.body, "rule") ?? "",
      jurisdiction: metaString(e.body, "jurisdiction") ?? "",
      direction: metaString(e.body, "direction") ?? "",
      days: (typeof e.body.meta?.["days"] === "number" ? e.body.meta["days"] as number : 0),
      serviceByMail: e.body.meta?.["serviceByMail"] === true,
      payloadSha256: e.body.payloadSha256,
    }));

  return {
    issueId,
    generatedAt: new Date().toISOString(),
    chain: { ok: chainResult.ok, length: chainResult.length, head: chainResult.head },
    receipts,
    anonymizationEvents,
    citationVerifications,
    authorityProvenance,
    provenance,
    tierFloorDecisions,
    blockedEgress,
    attestations,
    firmFacadeActivity,
    deadlines,
  };
}

// ---------------------------------------------------------------------------
// renderSignoffMarkdown
// ---------------------------------------------------------------------------

function mdEscape(s: string): string {
  // Escape pipe so a value cannot break a Markdown table cell.
  return s.replace(/\|/g, "\\|");
}

function cell(v: string | null | undefined): string {
  return v === null || v === undefined ? "—" : mdEscape(v);
}

/**
 * Render a SignoffBundle as a human/regulator-readable "Matter Trust Report"
 * Markdown string. Reads only fields already present on the bundle, so the
 * payload invariant is inherited from the assembler (hashes only).
 */
export function renderSignoffMarkdown(bundle: SignoffBundle): string {
  const out: string[] = [];

  out.push(`# Matter Trust Report — ${cell(bundle.issueId)}`);
  out.push("");
  out.push(`Generated: ${bundle.generatedAt}`);
  out.push("");
  out.push(
    "_Hashes only. Payloads are represented by their SHA-256 (`payloadSha256`); " +
      "no plaintext or privileged content appears in this report._",
  );
  out.push("");

  // Chain integrity
  out.push("## Chain Integrity");
  out.push("");
  out.push(`- Verified: **${bundle.chain.ok ? "OK" : "FAILED"}**`);
  out.push(`- Chain length: ${bundle.chain.length}`);
  out.push(`- Head: \`${bundle.chain.head}\``);
  out.push("");

  // Receipts
  out.push("## Receipts");
  out.push("");
  if (bundle.receipts.length === 0) {
    out.push("_No receipts for this matter._");
  } else {
    out.push("| seq | ts | tool | boundary | decision | outcome | payloadSha256 | agentId | approvalId |");
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of bundle.receipts) {
      out.push(
        `| ${r.seq} | ${cell(r.ts)} | ${cell(r.tool)} | ${cell(r.boundary)} | ${cell(r.decision)} ` +
          `| ${cell(r.outcome)} | \`${cell(r.payloadSha256)}\` | ${cell(r.agentId)} | ${cell(r.approvalId)} |`,
      );
    }
  }
  out.push("");

  // Anonymization events
  out.push("## Anonymization Events");
  out.push("");
  if (bundle.anonymizationEvents.length === 0) {
    out.push("_None._");
  } else {
    out.push("| seq | ts | tool | payloadSha256 |");
    out.push("| --- | --- | --- | --- |");
    for (const r of bundle.anonymizationEvents) {
      out.push(`| ${r.seq} | ${cell(r.ts)} | ${cell(r.tool)} | \`${cell(r.payloadSha256)}\` |`);
    }
  }
  out.push("");

  // Citation verifications
  out.push("## Citation Verifications");
  out.push("");
  if (bundle.citationVerifications.length === 0) {
    out.push("_None._");
  } else {
    out.push("| seq | ts | tool | outcome | payloadSha256 | agentId |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of bundle.citationVerifications) {
      out.push(
        `| ${r.seq} | ${cell(r.ts)} | ${cell(r.tool)} | ${cell(r.outcome)} ` +
          `| \`${cell(r.payloadSha256)}\` | ${cell(r.agentId)} |`,
      );
    }
  }
  out.push("");

  // Authority provenance (anti-hallucination)
  out.push("## Authority Provenance");
  out.push("");
  out.push(
    "_Retrieved authorities registered with the gate, and any citation in an " +
      "outbound filing that was never retrieved (the anti-hallucination signal)._",
  );
  out.push("");
  out.push("### Retrieved Authorities");
  out.push("");
  if (bundle.authorityProvenance.registrations.length === 0) {
    out.push("_None registered._");
  } else {
    out.push("| seq | ts | citation | source | sourceUrl | authoritySha256 | retrievedAt |");
    out.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const r of bundle.authorityProvenance.registrations) {
      out.push(
        `| ${r.seq} | ${cell(r.ts)} | ${cell(r.normalizedCitation)} | ${cell(r.source)} ` +
          `| ${cell(r.sourceUrl)} | \`${cell(r.authoritySha256)}\` | ${cell(r.retrievedAt)} |`,
      );
    }
  }
  out.push("");
  out.push("### Unbacked Citations (cited but never retrieved)");
  out.push("");
  if (bundle.authorityProvenance.unbacked.length === 0) {
    out.push("_None — every cited authority in this matter's outbound documents was retrieved._");
  } else {
    out.push("| seq | ts | tool | outcome | unbackedCitations | payloadSha256 |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const u of bundle.authorityProvenance.unbacked) {
      out.push(
        `| ${u.seq} | ${cell(u.ts)} | ${cell(u.tool)} | ${cell(u.outcome)} ` +
          `| ${cell(u.unbackedCitations.join("; "))} | \`${cell(u.payloadSha256)}\` |`,
      );
    }
  }
  out.push("");

  // Provenance (per-segment)
  out.push("## Provenance (per-segment)");
  out.push("");
  out.push(
    "_Per-paragraph provenance for this matter's outbound documents, computed by " +
      "the citation gate. A segment is **sourced** when it carries a citation that " +
      "was actually retrieved from a real source (registered with the gate); " +
      "**unsourced** is original analysis/argument or a segment whose citation was " +
      "never retrieved. Hashes/indices only — no segment text. (Verbatim " +
      "quote-fidelity — the **quoted** kind — requires producer-supplied source " +
      "passages and is not yet computed here.)_",
  );
  out.push("");
  if (bundle.provenance.documents.length === 0) {
    out.push("_No per-segment provenance recorded for this matter._");
  } else {
    const t = bundle.provenance.totals;
    out.push(
      `Totals: ${t.documents} document(s), ${t.segments} segment(s) — ` +
        `**${t.sourced} sourced**, ${t.quoted} quoted, ${t.unsourced} unsourced.`,
    );
    out.push("");
    out.push("| seq | ts | tool | outcome | segments | sourced | quoted | unsourced | sourced citations | documentSha256 |");
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const d of bundle.provenance.documents) {
      const sourcedCites = d.segments
        .filter((s) => s.kind === "sourced" && s.citation !== undefined)
        .map((s) => s.citation as string);
      out.push(
        `| ${d.seq} | ${cell(d.ts)} | ${cell(d.tool)} | ${cell(d.outcome)} | ${d.segmentCount} ` +
          `| ${d.summary.sourced} | ${d.summary.quoted} | ${d.summary.unsourced} ` +
          `| ${cell(sourcedCites.join("; "))} | \`${cell(d.documentSha256)}\` |`,
      );
    }
  }
  out.push("");

  // Tier-floor decisions
  out.push("## Tier-Floor Decisions");
  out.push("");
  // FIX 4 (honesty): data-terms tiering (dataTermsTier column) is staged — the
  // live egress path does not thread dataTerms into evaluateTierFloor yet, so
  // dataTermsTier will always be absent from receipts. The column is only shown
  // when at least one decision actually carries the field.
  const hasDataTermsTier = bundle.tierFloorDecisions.some((d) => d.dataTermsTier !== undefined);
  if (bundle.tierFloorDecisions.length === 0) {
    out.push("_None._");
  } else {
    if (!hasDataTermsTier) {
      out.push("_Note: data-terms tiering is staged and not yet active in the live egress path._");
      out.push("");
    }
    if (hasDataTermsTier) {
      out.push("| seq | ts | tool | routedLocal | claimedConfidentiality | dataTermsTier | payloadSha256 |");
      out.push("| --- | --- | --- | --- | --- | --- | --- |");
    } else {
      out.push("| seq | ts | tool | routedLocal | claimedConfidentiality | payloadSha256 |");
      out.push("| --- | --- | --- | --- | --- | --- |");
    }
    for (const d of bundle.tierFloorDecisions) {
      if (hasDataTermsTier) {
        out.push(
          `| ${d.seq} | ${cell(d.ts)} | ${cell(d.tool)} | ${d.routedLocal ? "yes" : "no"} ` +
            `| ${cell(d.claimedConfidentiality)} | ${cell(d.dataTermsTier)} | \`${cell(d.payloadSha256)}\` |`,
        );
      } else {
        out.push(
          `| ${d.seq} | ${cell(d.ts)} | ${cell(d.tool)} | ${d.routedLocal ? "yes" : "no"} ` +
            `| ${cell(d.claimedConfidentiality)} | \`${cell(d.payloadSha256)}\` |`,
        );
      }
    }
  }
  out.push("");

  // Blocked egress
  out.push("## Blocked Egress");
  out.push("");
  if (bundle.blockedEgress.length === 0) {
    out.push("_None — no egress was refused for this matter._");
  } else {
    out.push("| seq | ts | tool | boundary | reason | payloadSha256 |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const r of bundle.blockedEgress) {
      out.push(
        `| ${r.seq} | ${cell(r.ts)} | ${cell(r.tool)} | ${cell(r.boundary)} ` +
          `| ${cell(r.reason)} | \`${cell(r.payloadSha256)}\` |`,
      );
    }
  }
  out.push("");

  // Firm Facade Activity
  out.push("## Firm Facade Activity");
  out.push("");
  out.push(
    "_Actions performed through the firm-facing MCP facade. Pending approval requests " +
      "are shown as requested — not as attested events. Board attestations (if any) are in the section below._",
  );
  out.push("");
  if (bundle.firmFacadeActivity.length === 0) {
    out.push("_No facade activity for this matter._");
  } else {
    out.push("| seq | ts | tool | status | approvalId | workProductId | textDisclosed | payloadSha256 |");
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const r of bundle.firmFacadeActivity) {
      const textDisclosedCell =
        r.textDisclosed === undefined ? "—" : r.textDisclosed ? "yes" : "no";
      out.push(
        `| ${r.seq} | ${cell(r.ts)} | ${cell(r.tool)} | ${cell(r.displayStatus)} ` +
          `| ${cell(r.approvalId)} | ${cell(r.workProductId)} ` +
          `| ${textDisclosedCell} | \`${cell(r.payloadSha256)}\` |`,
      );
    }
  }
  out.push("");

  // Computed Deadlines
  out.push("## Computed Deadlines (deterministic — FRCP Rule 6)");
  out.push("");
  out.push(
    "_Computed Deadlines (deterministic FRCP Rule 6, US-FED v1) — recorded for this matter; " +
      "the gate attests the record (date/rule/jurisdiction facts + computation SHA, no matter content), " +
      "it does not re-run the computation. Makes deadlines VISIBLE and audited; it does not yet block a " +
      "late filing (the hard gate is a documented follow-up). State courts and CPR are unsupported; those " +
      "requests return UNCONFIRMED and do not generate a receipt._",
  );
  out.push("");
  if (bundle.deadlines.length === 0) {
    out.push("_No computed deadlines for this matter._");
  } else {
    out.push("| seq | ts | deadline | rule | jurisdiction | direction | days | serviceByMail | payloadSha256 |");
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const d of bundle.deadlines) {
      out.push(
        `| ${d.seq} | ${cell(d.ts)} | ${cell(d.deadline)} | ${cell(d.rule)} ` +
          `| ${cell(d.jurisdiction)} | ${cell(d.direction)} | ${d.days} | ${d.serviceByMail ? "yes" : "no"} ` +
          `| \`${cell(d.payloadSha256)}\` |`,
      );
    }
  }
  out.push("");

  // Attestations
  out.push("## Operator / Lawyer Attestations");
  out.push("");
  if (bundle.attestations.length === 0) {
    out.push("_No approvals recorded for this matter._");
  } else {
    out.push("| approvalId | agentId | ts | tool | boundary | payloadSha256 |");
    out.push("| --- | --- | --- | --- | --- | --- |");
    for (const a of bundle.attestations) {
      out.push(
        `| ${cell(a.approvalId)} | ${cell(a.agentId)} | ${cell(a.ts)} | ${cell(a.tool)} ` +
          `| ${cell(a.boundary)} | \`${cell(a.payloadSha256)}\` |`,
      );
    }
  }
  out.push("");

  return out.join("\n");
}
