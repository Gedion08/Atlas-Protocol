# Atlas Protocol

> The decentralized operating system for professional liquidity providers.

Atlas Protocol builds the first decentralized marketplace where capital providers allocate
liquidity to verified LP managers based entirely on transparent on-chain performance.

**The protocol never predicts markets. It never creates yield. It simply allocates capital
intelligently to the best liquidity providers.**

> "BlackRock meets Beefy on Solana."

## Monorepo layout

```
atlas-protocol/
├── programs/                  # Solana Anchor programs (Rust)
│   ├── vault/                 # Investor vaults: deposit, withdraw, shares
│   ├── manager-registry/      # LP manager profiles and on-chain score
│   └── staking/               # Manager bonding, unbonding, slashing, insurance escrow
├── apps/
│   ├── backend/               # Fastify API + services (risk, scoring, allocation, indexer)
│   └── frontend/              # Next.js dashboards (investor, manager, protocol)
├── packages/
│   └── types/                 # Shared TypeScript domain types
├── docs/
│   ├── architecture.md        # System architecture and data flow
│   ├── risk-engine.md         # Risk metrics, limits, and auto-pause rules
│   ├── manager-score.md       # Weighted reputation formula
│   └── roadmap.md             # Milestone plan
└── .env.example
```

## Quickstart

### Prerequisites

- Node.js >= 20 and pnpm
- Rust + Cargo
- Anchor CLI (`cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli`)

### Install

```bash
pnpm install
cp .env.example .env
```

### Backend

```bash
pnpm dev:backend          # Fastify API on :4000
pnpm --filter atlas-backend test
pnpm db:migrate           # applies db/migrations/0001_init.sql to PostgreSQL
```

### Frontend

```bash
pnpm dev:frontend         # Next.js on :3000
```

### Solana programs

```bash
anchor build
anchor test
```

Program IDs (dev scaffolds):

| Program          | Address                                      |
| ---------------- | -------------------------------------------- |
| atlas-vault      | `AfCPkgDj8ADzebwdWW9T8WTAyXVqMccaPkQJsQHFMhtr` |
| manager-registry | `9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8` |
| staking          | `B2sKSyicsc65bJ8AXZigQSfa1MUBiKbBjRqpYQuT6iUA` |

## Docker deployment

```bash
make docker-up          # builds and starts postgres + migrate + backend + frontend
make docker-logs        # tail logs from all services
make docker-down        # stop all services (data persists in the pgdata volume)
```

`docker compose up` runs database migrations as a one-time `migrate` service
before the backend starts, so a fresh clone is fully bootstrapped. Override
defaults via environment variables (see `.env.example`):

```bash
POSTGRES_USER=atlas POSTGRES_PASSWORD=change-me make docker-up
```

Service endpoints: frontend `http://localhost:3000`, API `http://localhost:8080`,
Swagger docs `http://localhost:8080/docs`, Postgres `localhost:5432`.

## Current scaffold status

| Area                        | Status                                        |
| --------------------------- | --------------------------------------------- |
| Anchor programs (5)         | Scaffolded, compile against anchor 0.30.1     |
| Scoring service             | Implemented + tested (weighted formula)       |
| Risk engine                 | Implemented + tested (VaR, ES, rules, pause)  |
| Allocation engine           | Implemented + tested (capped reweighting)     |
| Backend API                 | REST routes + WebSocket feed (in-memory repo) |
| Indexer                     | Helius webhook normalization + event bus stub |
| DB migrations               | PostgreSQL + ClickHouse DDL                   |
| Frontend dashboards         | Investor, strategies, leaderboard, protocol   |
| SDK / strategy upload       | Not started                                   |
| Governance / DAO            | Not started                                   |
| Performance oracle (full)   | Not started (ClickHouse ingest pipeline)      |
| Automation engine (on-chain)| Not started                                   |

See `docs/roadmap.md` for the milestone plan.
