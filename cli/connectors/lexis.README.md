# Lexis Connector — Setup Guide

## UNCONFIRMED — Enterprise API Access Required

The Lexis connector uses a **placeholder base URL** (`https://api.lexis.com/v1/`)
and **placeholder request/response shapes**. LexisNexis API access is
product-specific (Lexis+, Lexis Advance, etc.) and requires an enterprise
contract. The exact endpoint, auth scheme, and payload format depend on the
operator's LexisNexis product agreement.

Before using this connector in production, you must:

1. Contact your LexisNexis account representative to obtain API access.
2. Confirm the correct base URL for your product tier and region.
3. Verify the auth scheme (header name, token format) with LexisNexis documentation.
4. Reconcile all request and response shapes against the LexisNexis API spec.
5. Update `BASE_URL` in `cli/connectors/lexis.ts` and remove the UNCONFIRMED comments.

---

## Known uncertainties (as of 2026-05-20)

| Item | Status | Action needed |
|---|---|---|
| Base URL | UNCONFIRMED | Product-specific; verify with LexisNexis |
| Auth header | UNCONFIRMED | Currently using `x-api-key` + `x-user-id`; confirm with LN |
| `/health` ping path | UNCONFIRMED | May not exist; LN may use a different ping mechanism |
| `/cases/search` request shape | UNCONFIRMED | Fields and pagination may differ |
| `/cases/{citation}` path format | UNCONFIRMED | Citation encoding rules may differ |
| `/citations/shepards` path | UNCONFIRMED | Shepard's path name is a guess; verify with LN |

---

## Required env vars

| Var | Required | Notes |
|---|---|---|
| `LEXIS_API_KEY` | yes | From LexisNexis developer portal (enterprise contract) |
| `LEXIS_USER_ID` | yes | LexisNexis user ID associated with the credential |

---

## Stand-in equivalent

`courtlistener` is the open-access stand-in for Lexis. It uses the free
CourtListener REST API (`https://www.courtlistener.com/api/rest/v4/`) for case
search and retrieval with no credentials required. All offline demos and
demos without a LexisNexis contract use CourtListener.

---

## LexisNexis Developer resources (UNCONFIRMED availability)

- LexisNexis Developer Portal: `https://developer.lexisnexis.com`
- API documentation typically requires an existing product subscription.
