// mcp-servers/firm-facade/src/handlers.ts
//
// Read handlers (Task 3.4) and create_matter (Task 3.5) for the firm-facade MCP server.
// Server wiring is a LATER unit — handlers here are pure functions of (args, deps).
//
// LOAD-BEARING SECURITY RULES (enforced by tests in handlers.test.ts):
//
// (a) Every handler writes exactly ONE firm_facade receipt — outcome "performed" on
//     success, "error" on failure. No handler silently swallows an unaudited action.
//
// (b) NO privileged text (titles, descriptions, document bodies) ever enters a receipt
//     or the payloadSha256 descriptor. Receipts carry only ids (matterId / workProductId)
//     plus outcome flags. The payloadSha256 is sha256hex(canonicalArgs({ tool, ...ids })).
//
// (c) fetch_work_product withholds full document text in this unit even when
//     include_text===true. Unit D adds the policy-gated full-text branch (clearly marked
//     with a seam comment below). Do not call client.getDocument here.

import type {
  IssueRecord,
  WorkProductRecord,
  DocumentRecord,
  ApprovalRecord,
  CreateIssueBody,
  CreateApprovalBody,
} from "./paperclip-client.ts";
import type { FacadeReceiptInput, FacadeOutcome, FacadeTool } from "./receipts.ts";
import { sha256hex, canonicalArgs } from "./hash.ts";

// ---------------------------------------------------------------------------
// Structural interfaces for dependency injection
// (enables fake client + fake receipts spy in tests; FirmFacadeClient satisfies
//  FacadeClient structurally — no circular import needed)
// ---------------------------------------------------------------------------

/** Structural mirror of FirmFacadeClient — all 5 methods, exact signatures. */
export interface FacadeClient {
  createIssue(body: CreateIssueBody): Promise<IssueRecord>;
  getIssue(issueId: string): Promise<IssueRecord>;
  listWorkProducts(issueId: string): Promise<WorkProductRecord[]>;
  /** Used by Unit D (policy-gated full-text branch). Included here so the interface
   *  is stable across units. */
  getDocument(issueId: string, key: string): Promise<DocumentRecord>;
  createApproval(body: CreateApprovalBody): Promise<ApprovalRecord>;
}

/** Structural mirror of FacadeReceiptWriter.record(). */
export interface FacadeReceipts {
  record(input: FacadeReceiptInput): Promise<void>;
}

/**
 * Handler dependencies. Extendable — Unit D will add a policy dependency here
 * for the fetch_work_product full-text gate.
 */
export interface HandlerDeps {
  client: FacadeClient;
  receipts: FacadeReceipts;
}

// ---------------------------------------------------------------------------
// Internal helper: write one receipt (throws on failure — fail-closed)
// ---------------------------------------------------------------------------

async function writeReceipt(
  receipts: FacadeReceipts,
  tool: FacadeTool,
  outcome: FacadeOutcome,
  payloadSha256: string,
  ids?: Pick<FacadeReceiptInput, "matterId" | "workProductId" | "approvalId">,
  meta?: Record<string, unknown>,
): Promise<void> {
  const input: FacadeReceiptInput = {
    tool,
    outcome,
    payloadSha256,
    ...(ids ?? {}),
    ...(meta !== undefined ? { meta } : {}),
  };
  await receipts.record(input);
}

// ---------------------------------------------------------------------------
// Handler: getMatterStatus (Task 3.4)
// ---------------------------------------------------------------------------

export interface GetMatterStatusArgs {
  matterId: string;
}

export interface GetMatterStatusResult {
  matterId: string;
  status: string;
  workProductCount: number;
  documentCount: number;
}

/**
 * Get the current status and aggregate counts for a matter.
 * Returns METADATA ONLY — never exposes planDocument.body, documentSummaries bodies,
 * or the raw workProducts/documentSummaries arrays.
 * Writes one "get_matter_status" receipt (performed/error).
 */
export async function getMatterStatus(
  args: GetMatterStatusArgs,
  deps: HandlerDeps,
): Promise<GetMatterStatusResult> {
  const { matterId } = args;
  const { client, receipts } = deps;
  // payloadSha256 = hash of non-privileged action descriptor (tool + ids only, NO text)
  const payloadSha256 = sha256hex(canonicalArgs({ matterId, tool: "get_matter_status" }));

  let issue: IssueRecord;
  try {
    issue = await client.getIssue(matterId);
  } catch (err) {
    // Client call failed — write error receipt then re-throw
    await writeReceipt(receipts, "get_matter_status", "error", payloadSha256, { matterId });
    throw err;
  }

  // Receipt written AFTER successful client call (read operations are safe to audit post-read)
  await writeReceipt(receipts, "get_matter_status", "performed", payloadSha256, { matterId });

  return {
    matterId,
    status: issue.status,
    // Count only — never include the arrays themselves (they may carry summary/body text)
    workProductCount: Array.isArray(issue.workProducts) ? issue.workProducts.length : 0,
    documentCount: Array.isArray(issue.documentSummaries) ? issue.documentSummaries.length : 0,
    // NOTE: issue.planDocument.body is intentionally excluded — metadata only.
  };
}

// ---------------------------------------------------------------------------
// Handler: listWorkProducts (Task 3.4)
// ---------------------------------------------------------------------------

export interface ListWorkProductsArgs {
  matterId: string;
}

export interface WorkProductMeta {
  id: string;
  type: string;
  title?: string;
  status?: string;
  reviewState?: string;
  isPrimary?: boolean;
  url?: string;
}

/**
 * List work-product metadata for a matter.
 * Returns a mapped array: { id, type, title, status, reviewState, isPrimary, url }.
 * Document bodies are never included here — policy-gated via fetchWorkProduct.
 * Writes one "list_work_products" receipt (performed/error).
 */
export async function listWorkProducts(
  args: ListWorkProductsArgs,
  deps: HandlerDeps,
): Promise<WorkProductMeta[]> {
  const { matterId } = args;
  const { client, receipts } = deps;
  const payloadSha256 = sha256hex(canonicalArgs({ matterId, tool: "list_work_products" }));

  let items: WorkProductRecord[];
  try {
    items = await client.listWorkProducts(matterId);
  } catch (err) {
    await writeReceipt(receipts, "list_work_products", "error", payloadSha256, { matterId });
    throw err;
  }

  await writeReceipt(receipts, "list_work_products", "performed", payloadSha256, { matterId });

  // Map to metadata shape only — no document body fields
  return items.map((wp) => ({
    id: wp.id,
    type: wp.type,
    title: wp.title,
    status: wp.status,
    reviewState: wp.reviewState,
    isPrimary: wp.isPrimary,
    url: wp.url,
  }));
}

// ---------------------------------------------------------------------------
// Handler: fetchWorkProduct (Task 3.4) — METADATA-ONLY in this unit
// ---------------------------------------------------------------------------

export interface FetchWorkProductArgs {
  matterId: string;
  workProductId: string;
  include_text?: boolean;
}

export type FetchWorkProductResult =
  | {
      id: string;
      title?: string;
      type: string;
      status?: string;
      reviewState?: string;
      link: string | null;
      textWithheld: true;
      note: string;
    }
  | { error: string };

/**
 * Fetch metadata for a specific work product.
 *
 * METADATA-ONLY in this unit: full document text is ALWAYS withheld even when
 * include_text===true. The caller receives textWithheld:true and a note.
 *
 * Unit D seam: the policy-gated full-text branch (client.getDocument call) is
 * clearly marked below. Unit D will insert the branch there after adding a
 * policy dependency to HandlerDeps.
 *
 * Writes one "fetch_work_product" receipt (performed/error).
 * payloadSha256 includes workProductId (an id, not privileged text).
 */
export async function fetchWorkProduct(
  args: FetchWorkProductArgs,
  deps: HandlerDeps,
): Promise<FetchWorkProductResult> {
  const { matterId, workProductId } = args;
  const { client, receipts } = deps;
  // payloadSha256: tool + ids only — workProductId is an id, NOT privileged text
  const payloadSha256 = sha256hex(
    canonicalArgs({ matterId, tool: "fetch_work_product", workProductId }),
  );

  let items: WorkProductRecord[];
  try {
    items = await client.listWorkProducts(matterId);
  } catch (err) {
    await writeReceipt(receipts, "fetch_work_product", "error", payloadSha256, { matterId, workProductId });
    throw err;
  }

  const wp = items.find((w) => w.id === workProductId);
  if (wp === undefined) {
    await writeReceipt(receipts, "fetch_work_product", "error", payloadSha256, { matterId, workProductId });
    return { error: "work_product_not_found" };
  }

  // Unit D: policy-gated full-text branch goes here.
  // When deps.policy allows and include_text === true, call:
  //   const doc = await client.getDocument(matterId, workProductId);
  //   return the result with body text included.
  // Until Unit D, full text is always withheld (see note below).

  await writeReceipt(
    receipts,
    "fetch_work_product",
    "performed",
    payloadSha256,
    { matterId, workProductId },
    { textWithheld: true },
  );

  return {
    id: wp.id,
    title: wp.title,
    type: wp.type,
    status: wp.status,
    reviewState: wp.reviewState,
    // Use the work product's own url pass-through — do NOT construct a paperclip deep link
    // (the paperclip "issues" dashboard URL shape was not confirmed in the spike)
    link: wp.url ?? null,
    textWithheld: true,
    note: "full text withheld — opt-in policy applies",
  };
}

// ---------------------------------------------------------------------------
// Handler: createMatter (Task 3.5)
// ---------------------------------------------------------------------------

export interface CreateMatterArgs {
  title: string;
  description?: string;
  projectId?: string;
}

export type CreateMatterResult =
  | { matterId: string; status: string }
  | { error: string };

/**
 * Create a new matter (issue) in the firm's paperclip workspace.
 *
 * Validation: title must be a non-empty, non-whitespace-only string. Validation
 * failures write an error receipt and return {error:"invalid_title"} without
 * calling paperclip.
 *
 * Ordering / fail-closed contract: paperclip create is performed FIRST, THEN
 * the receipt is written. If the receipt write throws (gate unreachable), the
 * error propagates to the caller — the action is not silently swallowed.
 *
 * KNOWN LIMITATION (Unit G): if createIssue succeeds but record() throws, the
 * created issue exists in paperclip without an audit receipt. This narrow window
 * is a documented v1 limitation; a future unit may add deferred-receipt queueing.
 *
 * payloadSha256: on success, hashes { matterId, tool } using the matterId returned
 * by paperclip (a non-privileged id) so each create receipt is bound to its specific
 * matter — matching how the read handlers bind their sha. On the validation-error
 * path no matterId exists yet, so the sha is over { tool } only. Title and
 * description are privileged text and must NEVER appear in the receipt or its sha.
 */
export async function createMatter(
  args: CreateMatterArgs,
  deps: HandlerDeps,
): Promise<CreateMatterResult> {
  const { title, description, projectId } = args;
  const { client, receipts } = deps;

  // Validate title before touching paperclip. No matterId exists on this path,
  // so the error receipt's sha is over { tool } only (title is privileged text).
  if (typeof title !== "string" || title.trim().length === 0) {
    const errorSha = sha256hex(canonicalArgs({ tool: "create_matter" }));
    await writeReceipt(receipts, "create_matter", "error", errorSha);
    return { error: "invalid_title" };
  }

  // Create issue in paperclip (perform BEFORE receipt — see ordering note above)
  const issue = await client.createIssue({ title, description, projectId });

  // Compute payloadSha256 AFTER createIssue so it binds to the returned matterId
  // (a non-privileged id) — gives each create receipt a distinct, traceable hash,
  // matching the read handlers' { matterId, tool } sha convention.
  const payloadSha256 = sha256hex(canonicalArgs({ matterId: issue.id, tool: "create_matter" }));

  // Write receipt with matterId (an id, not privileged text) — throws on gate failure
  await writeReceipt(receipts, "create_matter", "performed", payloadSha256, { matterId: issue.id });

  return { matterId: issue.id, status: issue.status };
}
