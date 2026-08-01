# Contributing

Thanks for contributing to Atlas Protocol.

## Setup

```bash
pnpm install
cp .env.example .env
```

## Development

```bash
pnpm dev:backend     # Fastify API on :4000
pnpm dev:frontend    # Next.js on :3000
pnpm --filter atlas-backend test
```

## Before submitting

1. `pnpm typecheck` — TypeScript across all workspaces
2. `pnpm test` — unit + integration tests
3. `pnpm --filter atlas-frontend build` — production build
4. `cargo check` in `programs/` if you touched Rust
5. Run `npx prettier --write .` (or rely on CI)

CI runs lint, typecheck, tests, and the Anchor build. Pull requests must pass all checks.

## Commit conventions

Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.

## Program changes

- Never change program seeds without a migration plan.
- Add tests for every new instruction (see `programs/*/tests/`).
- Regenerate the IDL and client types (`anchor build` + `anchor idl` updates).
- Update `docs/architecture.md` when account layouts change.
