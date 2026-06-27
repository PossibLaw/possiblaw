// mcp-servers/firm-facade/src/handlers.ts
//
// Handlers (Tasks 3.4–3.7) for the firm-facade MCP server.
// Server wiring is a LATER unit — handlers here are pure functions of (args, deps).
//
// LOAD-BEARING SECURITY RULES (enforced by tests in handlers.test.ts):
//
// (a) Every handler writes exactly ONE firm_facade receipt — outcome "performed" on
//     success, "error" on failure. No handler silently swallows an unaudited action.
//
// (b) NO privileged text (titles, descriptions, document bodies, action/summary text)
//     ever enters a receipt or the payloadSha256 descriptor. Receipts carry only ids
//     (matterId / workProductId / approvalId) plus outcome flags. The payloadSha256
//     is sha256hex(canonicalArgs({ tool, ...ids })).
//
// (c) HUMAN-ONLY APPROVAL (risk #1): there is NO tool and NO handler and NO code
//     path that approves, rejects, or decides an approval. requestApproval ALWAYS
//     returns status:"pending_approval". The client has no approve/decide method.
//
// (d) FULL-TEXT SIDE-DOOR (risk #2): document body text is returned to the outside
//     assistant ONLY when include_text:true AND policy.allowWorkProductText===true
//     (literal boolean). Every disclosure writes a receipt with textDisclosed:true.
//     No document body text ever enters a receipt. Fail-closed: absent policy is
//     treated as {allowWorkProductText:false}.

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
import { buildApprovalDeepLink } from "./deeplink.ts";

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
  getDocument(issueId: string, key: string): Promise<DocumentRecord>;
  createApproval(body: CreateApprovalBody): Promise<ApprovalRecord>;
}

/** Structural mirror of FacadeReceiptWriter.record(). */
export interface FacadeReceipts {
  record(input: FacadeReceiptInput): Promise<void>;
}

/**
 * Handler dependencies. Extended in Unit D for the policy gate and approval deep link.
 *
 * Fail-closed defaults:
 *   - `policy` absent → treated as { allowWorkProductText: false }
 *   - `publicBaseUrl` or `companyPrefix` absent → buildApprovalDeepLink returns null
 */
export interface HandlerDeps {
  client: FacadeClient;
  receipts: FacadeReceipts;
  /** Full-text policy gate. Absent is treated as {allowWorkProductText:false} (fail-closed). */
  policy?: { allowWorkProductText: boolean };
  /** Public base URL for approval deep links (e.g. PAPERCLIP_PUBLIC_URL env). */
  publicBaseUrl?: string;
  /** Company prefix for approval deep links (e.g. the firm's company slug). */
  companyPrefix?: string;
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
// Handler: fetchWorkProduct (Tasks 3.4 + 3.7)
// ---------------------------------------------------------------------------

export interface FetchWorkProductArgs {
  matterId: string;
  workProductId: string;
  include_text?: boolean;
}

/** Full-text disclosed result — returned when policy allows and docKey is resolvable. */
export interface FetchWorkProductFullText {
  id: string;
  title?: string;
  type: string;
  status?: string;
  reviewState?: string;
  link: string | null;
  text: string;
  textDisclosed: true;
}

/** Withheld result — returned when policy is off, include_text is false, or no docKey. */
export interface FetchWorkProductWithheld {
  id: string;
  title?: string;
  type: string;
  status?: string;
  reviewState?: string;
  link: string | null;
  textWithheld: true;
  note?: string;
}

export type FetchWorkProductResult =
  | FetchWorkProductFullText
  | FetchWorkProductWithheld
  | { error: string };

/**
 * Fetch a specific work product. Returns metadata only by default.
 *
 * FULL-TEXT OPT-IN (risk #2): document body is returned ONLY when
 *   args.include_text === true AND deps.policy?.allowWorkProductText === true.
 * Default-closed; absent policy → closed. Every disclosure writes a
 * receipt with meta.textDisclosed:true. No body text ever enters a receipt.
 *
 * DOC-KEY DERIVATION: a work product has no first-class document FK.
 * The doc key is derived from: externalId → metadata.documentKey → metadata.key.
 * When none is resolvable, full text is honestly unavailable (v1 limitation, Unit G).
 *
 * Writes exactly one "fetch_work_product" receipt per call (performed/error).
 */
export async function fetchWorkProduct(
  args: FetchWorkProductArgs,
  deps: HandlerDeps,
): Promise<FetchWorkProductResult> {
  const { matterId, workProductId, include_text } = args;
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

  const link = wp.url ?? null;

  // ---------------------------------------------------------------------------
  // FULL-TEXT BRANCH (risk #2):
  // Gate condition: include_text === true AND policy.allowWorkProductText === true.
  // Absent policy is closed (fail-closed).
  // ---------------------------------------------------------------------------

  if (include_text === true && deps.policy?.allowWorkProductText === true) {
    // Derive document key — three lookup sources, in priority order.
    // externalId is typed string|undefined; metadata fields need runtime type check (unknown).
    const meta = wp.metadata;
    const docKey: string | undefined =
      wp.externalId
      ?? (meta !== undefined && typeof meta["documentKey"] === "string"
          ? meta["documentKey"]
          : undefined)
      ?? (meta !== undefined && typeof meta["key"] === "string"
          ? meta["key"]
          : undefined);

    if (docKey !== undefined) {
      // Full text available — fetch document, return text + disclosure receipt.
      // Receipt records the disclosure event; NO body text enters the receipt.
      const doc = await client.getDocument(matterId, docKey);
      await writeReceipt(
        receipts,
        "fetch_work_product",
        "performed",
        payloadSha256,
        { matterId, workProductId },
        // meta: textDisclosed:true + workProductId so the receipt is self-contained
        { textDisclosed: true, workProductId },
      );
      return {
        id: wp.id,
        title: wp.title,
        type: wp.type,
        status: wp.status,
        reviewState: wp.reviewState,
        link,
        text: doc.body ?? "",
        textDisclosed: true,
      };
    }

    // No docKey resolvable — work product has no linked document (e.g. pull_request, preview_url).
    // This is an honest v1 limitation (Unit G). Withhold with a clear note.
    await writeReceipt(
      receipts,
      "fetch_work_product",
      "performed",
      payloadSha256,
      { matterId, workProductId },
      { textDisclosed: false, reason: "no_linked_document" },
    );
    return {
      id: wp.id,
      title: wp.title,
      type: wp.type,
      status: wp.status,
      reviewState: wp.reviewState,
      link,
      textWithheld: true,
      note: "no linked document to disclose for this work product",
    };
  }

  // ---------------------------------------------------------------------------
  // WITHHOLD PATH: include_text false/absent OR policy off.
  // Receipt: textDisclosed:false. Note present only when caller requested text
  // but policy was off (helps caller understand why text was not returned).
  // ---------------------------------------------------------------------------

  const note: string | undefined =
    include_text === true
      ? "full text withheld — enable firmFacade.allowWorkProductText"
      : undefined;

  await writeReceipt(
    receipts,
    "fetch_work_product",
    "performed",
    payloadSha256,
    { matterId, workProductId },
    { textDisclosed: false },
  );

  return {
    id: wp.id,
    title: wp.title,
    type: wp.type,
    status: wp.status,
    reviewState: wp.reviewState,
    link,
    textWithheld: true,
    ...(note !== undefined ? { note } : {}),
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

// ---------------------------------------------------------------------------
// Handler: requestApproval (Task 3.6) — HUMAN-ONLY APPROVAL (risk #1)
// ---------------------------------------------------------------------------

export interface RequestApprovalArgs {
  matterId: string;
  action: string;
  summary: string;
}

export interface RequestApprovalResult {
  /** Always "pending_approval" — there is no code path that approves or decides. */
  status: "pending_approval";
  approvalId: string;
  /** Deep link to the approval dashboard entry, or null when config is absent. */
  deepLink: string | null;
  /** Present only when deepLink is null — instructs caller to use the dashboard. */
  note?: string;
}

/**
 * Request human approval for a proposed action on a matter.
 *
 * HUMAN-ONLY INVARIANT (risk #1 — headline security property):
 * This handler creates an APPROVAL REQUEST. It ALWAYS returns status "pending_approval".
 * There is NO code path that approves, rejects, or decides the approval.
 * The client has no approve/decide method. The human reviewer decides via the dashboard.
 *
 * Bait-and-switch surface: v1 has no post-approval execution step inside the facade —
 * the human approves exactly what the dashboard shows. There is no execution seam here.
 *
 * payloadSha256: hashes { tool, matterId, approvalId } only.
 * NO action or summary text enters the receipt (they are privileged human-readable
 * content; they go to the paperclip payload seen by the human reviewer in the dashboard).
 */
export async function requestApproval(
  args: RequestApprovalArgs,
  deps: HandlerDeps,
): Promise<RequestApprovalResult> {
  const { matterId, action, summary } = args;
  const { client, receipts, publicBaseUrl, companyPrefix } = deps;

  // Create approval request. action/summary go to the dashboard payload so the
  // human reviewer can see what is being approved — they do NOT go into the receipt.
  const approval = await client.createApproval({
    type: "request_board_approval",
    payload: {
      source: "firm-facade",
      action,
      summary,
      matterId,
    },
    issueIds: [matterId],
  });

  // Build optional deep link — null when publicBaseUrl or companyPrefix is absent
  const deepLink = buildApprovalDeepLink(publicBaseUrl, companyPrefix, approval.id);

  // Receipt: tool + ids only. NO action/summary text — those are privileged.
  const payloadSha256 = sha256hex(
    canonicalArgs({ tool: "request_approval", matterId, approvalId: approval.id }),
  );
  await writeReceipt(
    receipts,
    "request_approval",
    "pending",
    payloadSha256,
    { matterId, approvalId: approval.id },
  );

  return {
    status: "pending_approval",
    approvalId: approval.id,
    deepLink,
    note: deepLink === null
      ? "Open the approval in the dashboard; set PAPERCLIP_PUBLIC_URL + company prefix for a direct link."
      : undefined,
  };
}
