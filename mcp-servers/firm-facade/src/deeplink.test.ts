// mcp-servers/firm-facade/src/deeplink.test.ts
//
// Zero-network tests for buildApprovalDeepLink (Task 3.6 — deeplink.ts).
// All tests are pure value assertions; no I/O.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildApprovalDeepLink } from "./deeplink.ts";

describe("buildApprovalDeepLink", () => {
  it("returns confirmed URL shape: baseUrl/companyPrefix/approvals/approvalId", () => {
    const url = buildApprovalDeepLink(
      "https://app.possiblaw.io",
      "acme-law",
      "approval-xyz",
    );
    assert.equal(url, "https://app.possiblaw.io/acme-law/approvals/approval-xyz");
  });

  it("strips trailing slash from publicBaseUrl", () => {
    const url = buildApprovalDeepLink(
      "https://app.possiblaw.io/",
      "acme-law",
      "approval-xyz",
    );
    assert.equal(url, "https://app.possiblaw.io/acme-law/approvals/approval-xyz");
  });

  it("percent-encodes companyPrefix containing a space", () => {
    const url = buildApprovalDeepLink(
      "https://app.possiblaw.io",
      "acme law firm",
      "approval-1",
    );
    assert.equal(url, "https://app.possiblaw.io/acme%20law%20firm/approvals/approval-1");
  });

  it("percent-encodes approvalId containing a slash", () => {
    const url = buildApprovalDeepLink(
      "https://app.possiblaw.io",
      "acme",
      "approval/with/slash",
    );
    assert.equal(url, "https://app.possiblaw.io/acme/approvals/approval%2Fwith%2Fslash");
  });

  it("returns null when publicBaseUrl is empty string", () => {
    assert.equal(buildApprovalDeepLink("", "acme", "approval-1"), null);
  });

  it("returns null when publicBaseUrl is undefined", () => {
    assert.equal(buildApprovalDeepLink(undefined, "acme", "approval-1"), null);
  });

  it("returns null when companyPrefix is empty string", () => {
    assert.equal(buildApprovalDeepLink("https://app.possiblaw.io", "", "approval-1"), null);
  });

  it("returns null when companyPrefix is undefined", () => {
    assert.equal(
      buildApprovalDeepLink("https://app.possiblaw.io", undefined, "approval-1"),
      null,
    );
  });

  it("returns null when both publicBaseUrl and companyPrefix are undefined", () => {
    assert.equal(buildApprovalDeepLink(undefined, undefined, "approval-1"), null);
  });
});
