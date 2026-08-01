# Architecture

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
      │              │               │
      ▼              ▼               ▼
 Meteora        Orca CLMM      Raydium CLMM
      │              │               │
      └──────────────┼───────────────┘
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
| `vault`            | Vault state (authority, manager, fees, status), deposits (mint shares), withdrawals (burn shares, 1:1 scaffold pricing), parameter updates                         |
| `manager-registry` | Manager profiles (PDA per owner), on-chain weighted score with validated 0-100 components, status lifecycle (active/suspended/banned) |
| `staking`          | Bonding escrow (PDA token account), unbond with cooldown, claim, slashing by slash authority to insurance escrow |

Scaffold simplifications: share pricing is 1:1 until the Performance Oracle is wired in;
`set_score` is currently permissionless (anyone may submit scores) and must be gated by
governance or an oracle signature before mainnet.

### Backend services (TypeScript, Fastify)

- **Scoring** — `src/services/scoring` — weighted reputation formula, pure functions, unit tested.
- **Risk engine** — `src/services/risk-engine` — daily returns, VaR (historical), expected shortfall, max drawdown, risk rule evaluation with `ok | reduce | pause` decisions.
- **Allocation engine** — `src/services/allocation` — raw weight from score/risk/fee-efficiency/consistency/volatility/track record, iterative cap enforcement (max 30%/manager, 10% cash reserve), drift detection for reallocation.
- **Indexer** — `src/services/indexer` — Helius webhook normalization + event bus (in-memory or Kafka).
- **API** — REST under `/api/v1` (vaults, managers, strategies, leaderboard, score computation), WebSocket `/ws/feed`, Helius webhook intake at `/webhooks/helius`.

### Data stores

- PostgreSQL: relational core (managers, strategies, vaults, allocations, risk decisions, risk rules).
- ClickHouse: time-series performance snapshots, transactions, Meteora bin activity (see `db/clickhouse`).
- Redis/Kafka: events, queues (wiring in progress).

### Frontend (Next.js + Tailwind + TanStack Query)

- `/` investor dashboard (TVL, weighted APY, NAV chart, allocation, top managers)
- `/strategies` strategy marketplace with protocol filters
- `/leaderboard` manager rankings
- `/manager/[id]` manager profile (score breakdown, track record, strategies)
- `/protocol` risk rules and protocol narrative

## Data flow

1. Geyser/Helius indexer ingests every LP transaction (fees, swaps, deposits, withdrawals, rebalances) into ClickHouse.
2. Performance Oracle aggregates snapshots into NAV, APY, Sharpe, Sortino, Calmar, IL, utilization.
3. Scoring service converts metrics into score components; oracle signs and submits to `manager-registry`.
4. Allocation engine runs hourly (spec: hour/day/week) on vault capital; drift beyond threshold triggers reallocation.
5. Risk engine evaluates limits continuously; critical violations auto-pause the vault (on-chain circuit breaker to be wired).
