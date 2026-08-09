# Atlas Protocol

**The decentralized operating system for professional liquidity providers on Solana.**

Atlas Protocol is a production-grade liquidity allocation system that connects capital with verified LP managers through on-chain transparency, automated risk monitoring, and governance-controlled parameters. The protocol combines Anchor Rust programs, a Fastify backend, and a Next.js frontend into a unified pnpm workspace.

## Architecture

```
                  Investors
                      │
                      ▼
              Capital Vault Layer
                      │
                      ▼
          Dynamic Allocation Engine
                      │
       ┌──────────────┼───────────────┐
       ▼              ▼               ▼
  Manager A      Manager B      Manager C
       │              ▼               │
       ▼            ▼                ▼
  Meteora DLMM   Orca CLMM      Raydium CLMM
       │            │                │
       └────────────┼───────────────┘
                    ▼
         Risk Monitoring Engine
                    ▼
        Performance Oracle Layer
                    ▼
           Capital Reallocation
```

## Components

### On-chain (Anchor programs)

| Program            | Responsibility                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| `vault`            | Vault state, deposits (mint shares), withdrawals (burn shares), fee settlement, emergency exit, rebalance |
| `manager-registry` | Manager profiles (PDA per owner), on-chain weighted score with validated 0-100 components, status lifecycle (active/suspended/banned) |
| `staking`          | Bonding escrow (PDA token account), unbond with cooldown, claim, slashing by slash authority to insurance escrow |
| `governance`       | Token voting, proposal system, risk parameter voting, manager onboarding, veATLAS locks |
| `treasury`         | Protocol treasury management, fee collection, rollover periods |

### Backend services (TypeScript, Fastify)

- **Scoring** — Weighted reputation formula (fee generation, risk, drawdown, consistency, TVL growth, governance participation), pure functions, fully unit tested.
- **Risk engine** — Daily returns, VaR (historical), expected shortfall, max drawdown, concentration metrics, risk rule evaluation with `ok | reduce | pause` decisions.
- **Allocation engine** — Raw weight from score/risk/fee-efficiency/consistency/volatility/track record, iterative cap enforcement (max 30%/manager, 10% cash reserve), drift detection for reallocation.
- **Indexer** — Helius webhook normalization + event bus (in-memory or Kafka).
- **Oracle** — M-of-N oracle set for NAV marks; median of signed feeds with max-value-move bounds.
- **Circuit breaker** — Automated evaluation of manager NAV series against the risk engine; submits `set_status(Suspended)` via governance keypair.
- **API** — REST under `/api/v1` (vaults, managers, strategies, leaderboard, score computation, governance), WebSocket `/ws/feed`, Helius webhook intake at `/webhooks/helius`.

### Data stores

- PostgreSQL: relational core (managers, strategies, vaults, allocations, risk decisions, risk rules).
- ClickHouse: time-series performance snapshots, transactions, Meteora bin analytics.
- Redis/Kafka: events, queues.

### Frontend (Next.js 15 + Tailwind 4 + TanStack Query)

- `/` — Investor dashboard (TVL, weighted APY, NAV chart, allocation, top managers)
- `/invest` — Deposit and withdraw from vaults
- `/strategies` — Strategy marketplace with protocol filters and risk-tier gating
- `/leaderboard` — Manager rankings by on-chain weighted score
- `/manager/[id]` — Manager profile (score breakdown, track record, strategies)
- `/protocol` — Risk rules, protocol narrative, and governance participation
- `/governance` — Proposals, voting, and veATLAS lock management

## Security

Atlas Protocol is designed with defense-in-depth for on-chain capital flows:

- **PDA-based account constraints** with canonical seeds; all token authorities are PDAs
- **M-of-N oracle set** for NAV marks (median of >=3 signatures, max-value-move bounds)
- **Escrow patterns** for vault deposits, bonds, and fees
- **Governance-gated parameter changes** — no single key can alter protocol parameters
- **Auto-suspend on low scores** — circuit breaker evaluates risk continuously and pauses managers automatically
- **Wallet-signature authentication** with nonce replay protection for privileged API calls
- **Helius webhook signature verification** for event intake
- **Zod-validated environment** — invalid configuration crashes startup rather than running unsafe

See [SECURITY.md](SECURITY.md) for vulnerability reporting and the full security policy.

## Prerequisites

- Node.js 20+
- pnpm 11+
- Rust + Cargo
- Anchor CLI 0.30.1
- PostgreSQL 16 (production)

## Quick start

```bash
# Install dependencies
pnpm install

# Build shared types (required before backend/frontend)
pnpm --filter atlas-types build

# Build strategy SDK (required before backend typecheck)
pnpm --filter strategy-sdk build

# Run type checking across the workspace
pnpm typecheck

# Run all tests
pnpm test

# Run backend tests with coverage
pnpm --filter atlas-backend test:coverage

# Run frontend lint + tests
pnpm --filter atlas-frontend lint
pnpm --filter atlas-frontend test

# Start development servers
pnpm dev:backend
pnpm dev:frontend
```

## Build order

TypeScript packages must be built in dependency order before backend/frontend type checking or builds:

```bash
pnpm --filter atlas-types build    # shared types (no dependencies)
pnpm --filter strategy-sdk build   # depends on atlas-types
# then: pnpm --filter atlas-backend build / typecheck
# then: pnpm --filter atlas-frontend build / typecheck
```

The backend `typecheck` script automatically builds these dependencies via the `pretypecheck` hook.

## Build and test Rust programs

```bash
cargo clippy --workspace --manifest-path programs/Cargo.toml -- -D warnings
cargo test --workspace --manifest-path programs/Cargo.toml
cargo build --workspace --manifest-path programs/Cargo.toml
```

## Database migrations

```bash
pnpm db:migrate    # apply pending SQL migrations
pnpm db:seed       # seed demo data (development only)
```

## Deployment

The deployment workflow lives in `deploy/`. Programs are deployed to Solana devnet, followed by on-chain configuration initialization.

### Devnet program IDs

| Program | Address |
|---------|---------|
| Vault | `BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR` |
| Manager Registry | `CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs` |
| Staking | `4PxMwLR7KimbQct4NYXyjVk42aMK4vrKcBobBGepjJ4H` |
| Governance | `5fcfpz4DK8G4HbPMyX259fgotXJaE4v7yNhXidRAtWnD` |
| Treasury | `86pSPBBGKzMXteNGjxPT8XSt3fjuZGRMVMnEhQpWiefS` |

### Environment variables

Key backend environment variables:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development`, `test`, or `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `REPOSITORY_DRIVER` | `memory` (dev) or `postgres` (production) |
| `DB_AUTO_MIGRATE` | Apply migrations on startup (default: `true`) |
| `DB_AUTO_SEED` | Seed demo data when DB is empty (default: `false`) |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `ATLAS_REGISTRY_PROGRAM_ID` | Manager registry program ID |
| `ATLAS_VAULT_PROGRAM_ID` | Vault program ID |
| `ATLAS_GOVERNANCE_PROGRAM_ID` | Governance program ID |
| `ORACLE_KEYPAIR` | Oracle signer keypair (JSON array) |
| `GOVERNANCE_KEYPAIR` | Governance/circuit-breaker keypair (JSON array) |
| `HELIUS_WEBHOOK_SECRET` | Helius webhook verification secret |

## Documentation

- `docs/architecture.md` — System architecture and account/data flow
- `docs/risk-engine.md` — Risk engine model, thresholds, and safeguards
- `docs/manager-score.md` — Manager score calculation and manipulation resistance
- `docs/protocol-economics.md` — Protocol economics and token flow
- `docs/roadmap.md` — Delivery roadmap

## Repository layout

```
programs/            Anchor Rust workspace (vault, manager-registry, staking, governance, treasury)
apps/backend/        Fastify API, Solana services, risk engine, scoring, allocation, indexer, oracle
apps/frontend/       Next.js 15 dashboard and wallet UX
packages/types/      Shared TypeScript domain models (atlas-types)
packages/sdk/        Typed client over the backend API (atlas-sdk)
deploy/              Deployment automation, keypair generation, on-chain initialization
docs/                Architecture, risk engine, manager score, protocol economics, roadmap
```

## Contributing

We follow conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Before submitting:

1. Run `pnpm typecheck`
2. Run `pnpm test`
3. Run `cargo clippy --workspace --manifest-path programs/Cargo.toml -- -D warnings`
4. Ensure frontend lint passes: `pnpm --filter atlas-frontend lint`

## License

MIT
