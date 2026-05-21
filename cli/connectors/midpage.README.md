# midpage Connector — Reconciliation Notes

## Status: ANTICIPATED SCHEMA (UNCONFIRMED)

As of 2026-05-20, midpage.ai has not published a formal public API specification.
The connector in `midpage.ts` is built against an *anticipated* REST API shape based
on midpage's public marketing material. It will need to be reconciled with the actual
API spec before production use.

## What needs verification

| Item | Assumed value | Status |
|------|---------------|--------|
| Base URL | `https://api.midpage.ai/v1` | UNCONFIRMED |
| Auth scheme | `Authorization: Bearer <key>` | UNCONFIRMED |
| `GET /briefs` endpoint | Lists briefs | UNCONFIRMED |
| `GET /briefs/:id` endpoint | Fetches single brief | UNCONFIRMED |
| `POST /briefs` body shape | `{ title, matter_description, jurisdiction }` | UNCONFIRMED |
| Response envelope | Bare JSON objects/arrays | UNCONFIRMED |

## How to reconcile

1. Contact midpage at https://midpage.ai / their developer portal.
2. Request API access and documentation.
3. Update `BASE_URL`, request/response types, and capability implementations
   in `cli/connectors/midpage.ts` to match the actual spec.
4. Remove the UNCONFIRMED markers once verified.
5. Update `layer/connectors/midpage.yaml` to reflect accurate endpoint info.

## Why it's in Sprint 6A

midpage is included as a reference live connector demonstrating the **HTTP-only pattern**
(plain `fetch` with Bearer token). Even without a confirmed spec, the structural pattern
is complete and Sprint 6B connectors can follow the same shape.
