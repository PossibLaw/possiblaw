# Westlaw Connector — Setup Guide

## UNCONFIRMED — Enterprise API Access Required

The Westlaw connector uses a **placeholder base URL** (`https://api.westlaw.com/v1/`)
and **placeholder request/response shapes**. The actual Westlaw Edge public API
is only available under an enterprise contract with Thomson Reuters.

Before using this connector in production, you must:

1. Contact your Thomson Reuters account representative to obtain API access.
2. Confirm the correct base URL for your contract tier and region.
3. Verify the auth scheme (header name, token format) with TR documentation.
4. Reconcile all request and response shapes against the TR API spec.
5. Update `BASE_URL` in `cli/connectors/westlaw.ts` and remove the UNCONFIRMED comments.

---

## Known uncertainties (as of 2026-05-20)

| Item | Status | Action needed |
|---|---|---|
| Base URL | UNCONFIRMED | Verify with TR — may be region-specific |
| Auth header | UNCONFIRMED | Currently using `x-api-key` + `x-user-id`; confirm with TR |
| `/health` ping path | UNCONFIRMED | May not exist; TR may use a different ping mechanism |
| `/cases/search` request shape | UNCONFIRMED | Fields and pagination may differ |
| `/cases/{citation}` path format | UNCONFIRMED | Citation encoding rules may differ |
| `/citations/keycite` path | UNCONFIRMED | KeyCite path name is a guess; verify with TR |

---

## Required env vars

| Var | Required | Notes |
|---|---|---|
| `WESTLAW_API_KEY` | yes | From TR developer portal (enterprise contract) |
| `WESTLAW_USER_ID` | yes | Westlaw user ID associated with the credential |

---

## Stand-in equivalent

`courtlistener` is the open-access stand-in for Westlaw. It uses the free
CourtListener REST API (`https://www.courtlistener.com/api/rest/v4/`) for case
search and retrieval with no credentials required. All offline demos and
demos without a TR contract use CourtListener.

---

## TR Developer resources (UNCONFIRMED availability)

- Thomson Reuters Developer Portal: `https://developer.thomsonreuters.com`
- Westlaw Edge API documentation requires signing an NDA with TR before access.
