# Atlas Protocol

Atlas Protocol is a pnpm monorepo for a Solana-native liquidity allocation system.
The workspace combines Rust Anchor programs, a Fastify backend, and a Next.js frontend.

## What lives in this repo

- `programs/` — Anchor programs for vault, manager registry, staking, treasury, and governance.
- `apps/backend/` — Fastify API, Solana submitter, risk engine, scoring, allocation, indexer, and oracle services.
- `apps/frontend/` — Next.js 15 dashboard and wallet UX.
- `packages/types/` — shared TypeScript domain models.
- `deploy/` — deployment, keypair, and init automation for Solana devnet configuration.
- `docs/` — architecture and protocol design references.

## Current stack

- Rust + Anchor
- TypeScript + pnpm workspaces
- Fastify backend
- Next.js frontend
- Solana devnet deployment scripts

## Local development

### Prerequisites

- Node.js 20+
- pnpm 11+
- Rust + Cargo
- Anchor CLI 0.30.1

### Install workspace dependencies

```bash
pnpm install
```

### Common commands

```bash
pnpm build
pnpm test
pnpm typecheck
pnpm --filter atlas-backend test
pnpm --filter atlas-frontend test
pnpm --filter atlas-frontend lint
pnpm --filter atlas-types build
pnpm --filter atlas-sdk build
```

### Run the apps

```bash
pnpm dev:backend
pnpm dev:frontend
```

### Build and test the Rust programs

```bash
anchor build
anchor test
```

## Deploying on Solana devnet

The deployment workflow lives in `deploy/`.
The repo expects the Anchor programs to be deployed first, then the on-chain configuration to be initialized with the generated program IDs.

### Current devnet program IDs

These are the addresses recorded in the repo’s deployment artifact:

- Vault: `BeEtwSTYjPs47ZWa4joMppCNdJs4f4GRumCRtKXfSfSR`
- Manager Registry: `CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs`
- Staking: `4PxMwLR7KimbQct4NYXyjVk42aMK4vrKcBobBGepjJ4H`
- Governance: `5fcfpz4DK8G4HbPMyX259fgotXJaE4v7yNhXidRAtWnD`
- Treasury: `86pSPBBGKzMXteNGjxPT8XSt3fjuZGRMVMnEhQpWiefS`

For Render-backed backend runtime configuration, the backend uses `ATLAS_REGISTRY_PROGRAM_ID` as the main Solana program reference.
See `apps/backend/src/env.ts` for the environment contract.

## Backend environment notes

The backend reads its runtime settings from `apps/backend/src/env.ts`.
The key values you typically need in deployment are:

- `ATLAS_REGISTRY_PROGRAM_ID`
- `SOLANA_RPC_URL`
- `ORACLE_KEYPAIR` when enabling oracle submission
- `GOVERNANCE_KEYPAIR` when enabling circuit-breaker submission

## Documentation map

- `docs/architecture.md` — system architecture and account/data flow
- `docs/risk-engine.md` — risk engine model, thresholds, and safeguards
- `docs/manager-score.md` — manager score calculation
- `docs/protocol-economics.md` — protocol economics and token flow
- `docs/roadmap.md` — delivery roadmap

## Repository hygiene

A few local-only installer and environment helper files are not part of the source-of-truth project workflow and should stay out of version-control commits.
The checked-in repo is organized to keep the runtime workspace, generated build artifacts, and local toolchain files out of the Git history.
