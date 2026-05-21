# Vendor Documentation

Vendor docs under `docs/vendor/` are the default source of truth for integration and API configuration guidance in this repo.

## Usage Rules
- For vendor API, SDK, auth, or config tasks, read `docs/vendor/<vendor>.md` before using model memory.
- Treat `docs/vendor/*.md` as authoritative defaults for project-specific guidance.
- If a vendor file is missing or stale, check the official vendor docs and cite the source URL plus source date.

## Extension Pattern
- Add new files as `docs/vendor/<vendor>.md`.
- Include:
  - `Last verified: YYYY-MM-DD`
  - `Official sources:` links
  - security notes (secrets, auth scopes, least privilege)
