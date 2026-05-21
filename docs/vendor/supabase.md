# Supabase Vendor Reference

Last verified: 2026-03-01
Official sources:
- https://supabase.com/docs/guides/api/api-keys
- https://supabase.com/docs/reference/javascript/initializing
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions/secrets

## API Keys and Migration Notes
- Current key prefixes:
  - publishable key: `sb_publishable_...`
  - secret key: `sb_secret_...`
- Legacy JWT-style `anon` and `service_role` keys may still exist in older projects but should be treated as migration targets when current keys are available.
- Never expose secret keys to browsers, mobile bundles, logs, or client-visible responses.

## Client vs Server Usage
- Browser/mobile client code should only use the publishable key.
- Trusted server runtimes may use the secret key for privileged operations.
- For Supabase REST calls from trusted services, keep auth headers server-side only and avoid forwarding secret-bearing requests through untrusted clients.

## Environment Variable Patterns
- Client-safe:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Server-only:
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEY`
- Keep server-only keys out of `.env.example` values and never print them in build/test output.

## Security and RLS
- Keep Row Level Security (RLS) enabled on exposed tables.
- Use least-privilege policies and validate policy coverage with real auth contexts.
- Treat secret keys as highly privileged credentials; rotate on exposure and audit downstream logs immediately.
