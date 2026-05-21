# iManage Connector — Setup Guide

## Overview

iManage Work is the dominant DMS in large law firms. This connector uses the
iManage Work API v2 with a Bearer token. Two auth flows are supported in
production; only Bearer token is implemented in code.

---

## Auth Flow 1: Static Bearer Token (implemented)

This is the simplest path and is what the connector uses today.

1. Your iManage administrator creates a service account in the Work server.
2. The admin generates a long-lived access token for that service account.
3. Set `IMANAGE_TOKEN` to that token value.

**Limitation**: Long-lived tokens are a security risk. Rotate regularly.
Prefer OAuth for any production deployment.

---

## Auth Flow 2: OAuth 2.0 (documented; not yet implemented in code)

iManage supports OAuth 2.0 authorization code and client credentials flows via
the iManage IM.OAuth2 server.

**Steps (client credentials flow — server-to-server):**

1. Register a client application in the iManage IM.OAuth2 console
   (`https://<your-host>/auth/realms/imanage-work/`).
2. Note the `client_id` and `client_secret`.
3. POST to the token endpoint:

```
POST https://<IMANAGE_HOST>/auth/realms/imanage-work/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=<client_id>
&client_secret=<client_secret>
&scope=user
```

4. The response contains `access_token` (short-lived JWT).
5. Use `access_token` as the Bearer token.
6. Implement token refresh before expiry (typically 1 hour).

To wire OAuth into the connector: replace the static `IMANAGE_TOKEN` env var
with `IMANAGE_CLIENT_ID` + `IMANAGE_CLIENT_SECRET` and add a token-refresh
wrapper around `imFetch`.

---

## Required env vars

| Var | Required | Notes |
|---|---|---|
| `IMANAGE_HOST` | yes | e.g. `https://yourfirm.cloudimanage.com` |
| `IMANAGE_LIBRARY` | yes | Library name, e.g. `ACTIVE` |
| `IMANAGE_TOKEN` | yes (Bearer flow) | Access token; rotate regularly |

---

## Stand-in equivalent

`local-fs-doc-store` is the no-credential stand-in for iManage. It stores and
retrieves documents from `layer/connectors/local-docs/` on the local filesystem.
All offline demos use this stand-in automatically.

---

## API reference

- iManage Work REST API v2: `https://cloudimanage.com/work/api/v2/`
- iManage Developer Portal: `https://developers.imanage.com`
- Base URL in connector: `https://<IMANAGE_HOST>/work/api/v2`
