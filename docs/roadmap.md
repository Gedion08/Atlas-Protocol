# Roadmap

## Phase 1 — Foundation (current scaffold)

- [x] Monorepo: Anchor programs, backend API, frontend dashboards, shared types
- [x] Programs: vault (deposit/withdraw/shares), manager-registry (profiles + score), staking (bond/unbond/slash)
- [x] Scoring, risk engine, allocation engine (pure TS, unit tested)
- [x] REST API + WebSocket feed + Helius webhook intake (in-memory repos)
- [x] PostgreSQL + ClickHouse DDL
- [x] Frontend: investor, strategies, leaderboard, manager profile, protocol pages

## Phase 2 — Data & truth

- [ ] Performance Oracle: ClickHouse ingest from Geyser/Helius; NAV, APY, Sharpe, Sortino, Calmar, ulcer index, win rate, recovery factor, capital efficiency
- [ ] Meteora DLMM bin analytics (bin distribution, active bin %, crossing/rebalance frequency, inventory skew)
- [ ] Oracle-signed score submission gating `set_score`
- [ ] Wire vault share pricing to oracle instead of 1:1
- [ ] Indexer: Kafka topics, replay, backfill from Dune exports

## Phase 3 — Automation & risk

- [ ] Scheduled rebalancer (hour/day/week) executing on-chain rebalances via the vault program
- [ ] Auto-pause circuit breaker wiring risk engine → on-chain `set_status`
- [ ] Emergency exit flow (position close + full redemption)
- [ ] Insurance fund activation (slashed capital → insurance escrow → compensation claims)
- [ ] Strategy SDK: parameterized strategy definitions, versioning, validation

## Phase 4 — Markets & governance

- [ ] Strategy marketplace with strategy upload by managers and risk-tier gating
- [ ] Governance: token voting, proposal system, risk parameter voting, manager onboarding, slashing proposals
- [ ] ATLAS token utility: governance, staking, fee discounts, risk insurance, revenue sharing, boosted allocations
- [ ] Bonding requirements per risk tier and allocation size

## Phase 5 — Scale

- [ ] GraphQL + gRPC APIs, enterprise dashboards, compliance reports
- [ ] White-label licensing
- [ ] Multiple vault templates (SOL, USDC, USDT, LST vaults)
- [ ] Institution onboarding (KYC-gated vaults, audited reports)
- [ ] Formal verification of core programs
