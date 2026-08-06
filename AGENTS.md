# AGENTS.md

Atlas Protocol: Solana (Anchor) programs + Fastify backend + Next.js frontend, all in one pnpm workspace. README is the user-facing overview; trust `docs/architecture.md`, `docs/risk-engine.md`, `docs/manager-score.md` for design truth.

## Layout

- `programs/` — Rust workspace (`vault`, `manager-registry`, `staking`, `governance`, `treasury`). README says 3 programs; the Cargo workspace actually has 5 members.
- `apps/backend/` — Fastify API. Services: `src/services/{scoring,risk-engine,allocation,indexer,ingestion,oracle,governance,perf-metrics,analytics,pricing,circuit-breaker}`. Routes: `src/routes/{health,vaults,managers,strategies,leaderboard,investors,oracle,governance,governance-execution,staking,webhooks,ws}`.
- `apps/frontend/` — Next.js 15 + Tailwind 4 + TanStack Query.
- `packages/types/` — shared TS types (`atlas-types`). Only workspace package consumed by both apps.
- `packages/sdk/` — `atlas-sdk`: typed client over the backend API (vaults, strategies, uploads, leaderboard, risk). Build order: `atlas-types` first, then `atlas-sdk`.
- `docs/` — architecture, risk-engine, manager-score, protocol-economics. Keep in sync when changing formulas or account layouts (CONTRIBUTING requirement).

## Automation (spec §12.2)

- On-chain: vault `rebalance` (keeper-triggered, `MIN_REBALANCE_INTERVAL_SECS` cooldown), treasury `rollover_period` (permissionless keeper resetting period caps), registry `set_status` gated to governance/slash_authority.
- Off-chain: `src/services/circuit-breaker/` loop evaluates manager NAV series against the risk engine and submits `set_status(Suspended)` via `GOVERNANCE_KEYPAIR` (env: `CIRCUIT_BREAKER_ENABLED`, `CIRCUIT_BREAKER_INTERVAL_MS`). `isValidPublicKey` guards non-Solana seed owners.

## Commands

```bash
pnpm --filter atlas-types build      # REQUIRED first: apps import atlas-types from dist/, which is gitignored
pnpm --filter atlas-sdk build        # second: depends on atlas-types dist/
pnpm --filter atlas-backend test     # vitest; in-memory repos, no Postgres needed
pnpm --filter atlas-frontend test    # vitest + jsdom
pnpm --filter atlas-frontend lint    # only frontend has a lint script (backend: none)
pnpm typecheck                       # tsc across workspace
pnpm db:migrate                      # applies apps/backend/db/migrations/*.sql; needs live Postgres
cargo test --workspace --manifest-path programs/Cargo.toml
make help                           # all shortcuts: dev, test, lint, docker-up, format, clean
```

CI (`.github/workflows/ci.yml`) is the source of truth for what must pass: frontend lint/typecheck/test/build, backend typecheck/test:coverage/build + migrations against real Postgres 16, `cargo clippy --workspace -- -D warnings` + `cargo test`.

## Gotchas

- **`anchor build` / `anchor test`** — `programs/Anchor.toml` is committed. Program `tests/*.ts` (Anchor TS) are currently unrunnable because `target/types/` is gitignored and not generated; verify Rust changes with `cargo test`/`cargo clippy` as CI does.
- **Build order matters**: `atlas-types` must be built before backend/frontend `tsc` (typecheck/build). Vitest aliases `atlas-types` to source, so tests work without the build.
- Backend env is zod-validated at import in `src/env.ts` (`NODE_ENV` must be `development|test|production`); invalid env crashes startup. Default `REPOSITORY_DRIVER=memory`; Postgres driver only in docker-compose.
- Program changes: never change PDA seeds without a migration plan; add TS instruction tests in `programs/*/tests/`; update `docs/architecture.md` on account layout changes.
- Prettier for everything (rust files use 4-space indent via `.editorconfig`); conventional commits (`feat:`, `fix:`, ...).
