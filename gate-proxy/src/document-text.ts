// gate-proxy/src/document-text.ts
// Maps a citation-gated egress tool to the payload field that carries the
// reviewable document text the citation gate hashes. Field names mirror the
// payload shapes the corresponding performers in connectors.ts egress.
const DOCUMENT_TEXT_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  file_court_document: "documentText",
  upload_document: "content",
  send_email: "body",
  share_external: "content",
});

export function extractDocumentText(tool: string, payload: Record<string, unknown>): string | null {
  const field = DOCUMENT_TEXT_FIELDS[tool];
  if (field === undefined) return null;
  const value = payload[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}
