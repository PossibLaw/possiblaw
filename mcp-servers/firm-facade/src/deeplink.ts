// mcp-servers/firm-facade/src/deeplink.ts
//
// buildApprovalDeepLink — constructs the human-facing approval dashboard URL.
//
// URL shape (confirmed spike): `${PAPERCLIP_PUBLIC_URL}/:companyPrefix/approvals/:approvalId`
//
// Returns null when publicBaseUrl or companyPrefix is empty/unset — never
// invents a URL from partial configuration. Callers include a fallback note
// so the human reviewer can locate the approval in the dashboard manually.

/**
 * Build a deep link to the approval dashboard entry for `approvalId`.
 *
 * @param publicBaseUrl  The firm's paperclip public base URL (e.g. PAPERCLIP_PUBLIC_URL).
 *                       Trailing slash is stripped. Returns null if empty/undefined.
 * @param companyPrefix  The company slug used in the dashboard URL (e.g. "acme-law").
 *                       Returns null if empty/undefined.
 * @param approvalId     The approval record id returned by createApproval.
 */
export function buildApprovalDeepLink(
  publicBaseUrl: string | undefined,
  companyPrefix: string | undefined,
  approvalId: string,
): string | null {
  if (!publicBaseUrl || !companyPrefix) return null;
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(companyPrefix)}/approvals/${encodeURIComponent(approvalId)}`;
}
