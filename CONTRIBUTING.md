# Contributing to PossibLaw

Thanks for your interest! PossibLaw is a proof-of-concept, but contributions are welcome.

## How to propose changes

For non-trivial changes, open an issue first and describe what you want to do and why. This avoids duplicate effort and aligns on scope before you write code. Typo fixes, doc improvements, and minor bug fixes can go straight to a PR.

## Dev setup

```bash
git clone --recurse-submodules https://github.com/PossibLaw/possiblaw.git
cd possiblaw
pnpm -C paperclip install   # install the paperclip submodule's deps
./bin/possiblaw             # onboard, pick a variant, import the package
```

To validate package changes without writing to a database:

```bash
./bin/possiblaw --dry-run --variant codex --non-interactive --yes
# expected: plan summary with 0 warnings, 0 errors
```

## Code style

Prettier defaults. No config file needed — if in doubt, run `npx prettier --write <file>`.

## License

By contributing you agree your code will be licensed under the **Apache License 2.0**. See [LICENSE](LICENSE).

DCO sign-off is encouraged. Add `Signed-off-by: Your Name <email>` to commits when possible.

## Important: no AGPL code

Do not copy code from AGPL-3.0-licensed sources (e.g., mike). Design inspiration is fine; code copies are not.

## Where to start

Browse `docs/extending/` for guides on adding new agents, skills, and workflows to the layer.
