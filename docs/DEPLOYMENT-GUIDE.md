# Atlas Protocol — Complete Deployment Guide (Free-Tier / Testnet)

> Deploy the entire Atlas Protocol stack using free-tier services for beta/testing. This guide walks you through every component: Solana programs, backend API, frontend dashboard, database, and optional infrastructure.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Phase 1: Solana Programs (Testnet)](#3-phase-1-solana-programs-testnet)
4. [Phase 2: Database (Supabase Free Tier)](#4-phase-2-database-supabase-free-tier)
5. [Phase 3: Backend API (Render Free Tier)](#5-phase-3-backend-api-render-free-tier)
6. [Phase 4: Frontend (Vercel Free Tier)](#6-phase-4-frontend-vercel-free-tier)
7. [Phase 5: Optional Infrastructure](#7-phase-5-optional-infrastructure)
8. [Environment Configuration](#8-environment-configuration)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [CI/CD Setup](#10-cicd-setup)
11. [Cost Summary](#11-cost-summary)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

Atlas Protocol has these deployable components:

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────┐
│  Solana         │    │                  │    │              │
│  Programs       │◄──►│  Backend API     │◄──►│  Frontend    │
│  (5 programs)   │    │  (Fastify)       │    │  (Next.js)   │
└─────────────────┘    │                  │    │              │
                       │  ┌────────────┐  │    │              │
                       │  │ PostgreSQL │  │    │              │
                       │  │ (Supabase) │  │    │              │
                       │  └────────────┘  │    │              │
                       │                  │    │              │
                       │  ┌────────────┐  │    │              │
                       │  │  Redis     │  │    │              │
                       │  │  (Cache)   │  │    │              │
                       │  └────────────┘  │    │              │
                       │                  │    │              │
                       │  ┌────────────┐  │    │              │
                       │  │ ClickHouse │  │    │              │
                       │  │ (Analytics)│  │    │              │
                       │  └────────────┘  │    │              │
                       └──────────────────┘    └──────────────┘
```

### Components at a Glance

| Component | Technology | Free Tier Option |
|---|---|---|
| PostgreSQL DB | PostgreSQL 16 | Supabase (500MB free) |
| Backend API | Node.js 22 + Fastify | Render (Free Web Service) |
| Frontend UI | Next.js 15 | Vercel (Hobby plan) |
| Solana Programs | Rust + Anchor 0.30.1 | Solana Devnet (free SOL airdrop) |
| Solana RPC | JSON-RPC | Public devnet RPC (free) |
| Indexing | Helius | Helius (free 100K req/mo) |
| Optional: Redis | In-memory | Upstash (10K req free) |
| Optional: ClickHouse | Time-series DB | Self-hosted Docker |

---

## 2. Prerequisites

### 2.1 System Requirements

- **OS**: macOS, Linux, or WSL2 on Windows
- **Node.js**: v20 or higher
- **Rust**: Latest stable (via rustup)
- **pnpm**: v9 or higher (faster than npm/yarn, workspace-aware)
- **Solana CLI**: For testnet operations
- **Anchor CLI**: v0.30.1 (for building/deploying programs)
- **Git**: For repository management
- **Docker**: Optional, for local infrastructure

### 2.2 Install Toolchain

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Install Node.js 22 (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# Enable pnpm
corepack enable pnpm

# Install Solana CLI (Linux/macOS)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
# For devnet only:
solana config set --url https://api.devnet.solana.com

# Install Anchor CLI (required for program deployment)
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
```

### 2.3 Account Setup

Create accounts with these providers:

1. **Supabase** (supabase.com) - For PostgreSQL database
2. **Render** (render.com) - For backend API hosting
3. **Vercel** (vercel.com) - For frontend hosting
4. **Helius** (helius.io) - For Solana RPC + indexing (free tier)
5. **Solana** (solana.com) - For wallet + devnet SOL

---

## 3. Phase 1: Solana Programs (Testnet)

### 3.1. Prepare Solana Wallet

```bash
# Generate a new testnet wallet (save this somewhere safe!)
solana-keygen new --no-bip39-passphrase

# Or use an existing wallet:
# solana config set --url https://api.devnet.solana.com

# Request airdrop (devnet SOL is free)
solana airdrop 2 $(solana-keygen pubkey)
solana airdrop 1 $(solana-keygen pubkey)

# Check balance
solana balance
```

### 3.2. Build Programs

```bash
cd programs

# Build all programs in release mode
cargo build --workspace --manifest-path Cargo.toml --release

# Or build with Anchor (for IDL generation):
anchor build  # Uses the Cargo.toml in programs/
```

### 3.3. Deploy to Devnet

⚠️ **Important**: The README mentions that `anchor build` / `anchor test` don't work without `Anchor.toml`. However, we can still deploy using `solana program deploy`.

```bash
# Set to devnet
solana config set --url https://api.devnet.solana.com

# Deploy each program in dependency order:
cd programs

# 1. staking (no dependencies)
solana program deploy target/deploy/atlas_staking.so
# Note: Copy the program ID from output

# 2. manager-registry (depends on staking for CPI)
solana program deploy target/deploy/atlas_manager_registry.so

# 3. vault (depends on manager-registry)
solana program deploy target/deploy/atlas_vault.so

# 4. treasury (no dependencies)
solana program deploy target/deploy/atlas_treasury.so

# 5. governance (no dependencies)
solana program deploy target/deploy/atlas_governance.so
```

### 3.4. Update Program IDs

After deployment, Anchor generates new program IDs. You need to update them:

1. In `programs/*/Cargo.toml`, update the `declare_id!` strings
2. In `.env`, update `ATLAS_REGISTRY_PROGRAM_ID`
3. Rebuild and redeploy if needed

```bash
# Example: After deploying manager-registry, update its ID
# Edit programs/manager-registry/src/lib.rs
# Change: declare_id!("9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8")
# To your newly deployed program ID
```

### 3.5. Initialize Protocol Configuration

You need to initialize two on-chain configs:

**Registry Config (manager-registry program):**
- Governance authority
- Oracle key (who can submit scores)
- Slash authority
- Bond mint and amount

**Vault Config (vault program):**
- M-of-N oracle set (3+ oracles for NAV marks)
- Risk engine address
- Treasury, insurance, veatlas addresses

The test file at `programs/vault/tests/vault.ts` shows the full initialization sequence. You'll need to create a deployment script that performs these steps.

**Sample initialization steps (pseudo-code):**
```typescript
// 1. Initialize Registry Config
await registryProgram.methods.initializeConfig({
  oracles: [oraclePubkey1, oraclePubkey2, oraclePubkey3],
  slashAuthority: deployerPubkey,
  bondMint: bondMintPubkey,
  bondAmount: new BN(100_000_000), // 100 tokens at 1M decimals
  scoreThreshold: 40
}).accounts({
  config: registryConfigPDA,
  governance: deployerPubkey,
  systemProgram: SystemProgram.programId
}).rpc();

// 2. Initialize Vault Config
await vaultProgram.methods.initializeConfig({
  oracles: oracleSet.map(k => k.publicKey),
  minOracleSignatures: 3,
  riskEngine: deployerPubkey, // For now
  treasury: deployerPubkey,
  insurance: deployerPubkey,
  veatlas: deployerPubkey,
  reserveTarget: new BN(0)
}).accounts({
  config: vaultConfigPDA,
  governance: deployerPubkey,
  systemProgram: SystemProgram.programId
}).rpc();
```

### 3.6. Helius Indexing Setup (Free Tier)

1. Go to [helius.io](https://helius.io)
2. Sign up and create a project
3. In the project dashboard:
   - **RPC Endpoint**: Use `https://mainnet-helius-rpc.com?api_key=...` or devnet equivalent
   - **Webhook URL**: Set to `https://your-backend.com/webhooks/helius` (configure after backend deploy)
   - **Webhook Secret**: Generate a secret and add to `HELIUS_WEBHOOK_SECRET` env var

The Helius free tier gives you 100,000 requests/month, which is sufficient for testnet.

---

## 4. Phase 2: Database (Supabase Free Tier)

### 4.1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose organization (create one if needed)
4. Enter project name: `atlas-protocol`
5. Database password: Choose a secure password (save it!)
6. Region: Choose the closest to your users (e.g., `us-east-1`)
7. Click "Create new project"

Wait 5-10 minutes for provisioning.

### 4.2. Get Connection String

1. Go to Project Dashboard → Settings → Database
2. Under "Connection string", select "Node.js" (for `pg` library)
3. Copy the connection string — you'll need it for the backend:
   ```
   postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
   ```
4. Replace `[PASSWORD]` with your actual database password

### 4.3. Apply Database Migrations

1. Go to Project Dashboard → SQL editor
2. Create a new query
3. Paste the contents of each migration file in order:
   - `apps/backend/db/migrations/0001_init.sql`
   - `apps/backend/db/migrations/0002_performance.sql`
   - `apps/backend/db/migrations/0003_strategy_uploads.sql`
   - `apps/backend/db/migrations/0004_governance.sql`
4. Click "Run" for each

Alternatively, if you have the local Postgres running:

```bash
# From the project root
DATABASE_URL=postgresql://postgres:your-password@db.region.supabase.co:5432/postgres \
  pnpm --filter atlas-backend db:migrate
```

### 4.4. Configure Authentication (Optional)

If you want to secure the API:

1. Go to Project Dashboard → Authentication
2. Enable email-password auth (or OAuth providers like Google, Discord)
3. Note: The current Atlas backend doesn't require auth for public endpoints, but you may want it secured

---

## 5. Phase 3: Backend API (Render Free Tier)

### 5.1. Build Types Package Locally

Before deploying, build the shared types package:

```bash
# From project root
pnpm --filter atlas-types build
# This creates packages/types/dist/ which is needed for tsc
```

### 5.2. Create Render Service

1. Go to [render.com](https://render.com)
2. Sign up/in with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repo (fork and push to GitHub first if needed)

### 5.3. Configure Build Settings

**Root Directory**: Leave empty (repo root)

**Build Command**:
```bash
pnpm install --frozen-lockfile && \
pnpm --filter atlas-types build && \
pnpm --filter atlas-backend build
```

**Start Command**:
```bash
node apps/backend/dist/index.js
```

### 5.4. Environment Variables

Set these in the Render dashboard (Environment → Add Environment Variable):

```env
# Basic
NODE_ENV=production
LOG_LEVEL=info
BACKEND_PORT=10000
HOST=0.0.0.0

# Database (from Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
REPOSITORY_DRIVER=postgres

# CORS (your frontend domain)
CORS_ORIGINS=https://atlas-frontend.vercel.app,https://your-frontend.vercel.app

# Rate limiting
RATE_LIMIT_MAX=100

# Metrics (keep enabled)
METRICS_ENABLED=true

# Redis (skip if not using - use Upstash)
# REDIS_URL=

# ClickHouse (skip if not using)
# CLICKHOUSE_URL=http://localhost:8123
# CLICKHOUSE_ENABLED=false

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
# For mainnet: https://api.mainnet-beta.solana.com

# Helius (if you set up indexing)
HELIUS_API_KEY=your-helius-api-key
HELIUS_WEBHOOK_SECRET=your-webhook-secret
HELIUS_WEBHOOK_SIGNATURE_HEADER=x-webhook-signature

# Registry program ID (from your devnet deployment)
ATLAS_REGISTRY_PROGRAM_ID=9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8

# Kafka (keep disabled for free tier)
KAFKA_BROKERS=localhost:9092
KAFKA_ENABLED=false

# Oracle loop (disable for beta)
ORACLE_LOOP_ENABLED=false
ORACLE_LOOP_INTERVAL_MS=3600000

# Circuit breaker (disable initially, enable after testing)
CIRCUIT_BREAKER_ENABLED=false
CIRCUIT_BREAKER_INTERVAL_MS=300000
```

### 5.5. Plan Selection

- **Plan**: Free (512MB RAM, sufficient for development/testing)
- **Region**: Choose closest to your users and Supabase region

### 5.6. Deployment

After setting everything up:

1. Render will auto-build your backend
2. Monitor the deployment in the "Deploys" tab
3. Once deployed, note your service URL (e.g., `https://atlas-backend.onrender.com`)

### 5.7. Health Check

Render automatically sets up a health check. You can also check manually:

```bash
curl https://your-backend-url.onrender.com/health/ready
```

Expected response: `{"status":"ok"}` or similar.

---

## 6. Phase 4: Frontend (Vercel Free Tier)

### 6.1. Create Vercel Project

1. Go to [vercel.com](https://vercel.com)
2. Sign up/in with GitHub
3. Click "New Project" → Import your repository

### 6.2. Configure Build Settings

**Framework Preset**: Next.js (auto-detected)

**Build Command** (override):
```bash
pnpm install --frozen-lockfile && \
pnpm --filter atlas-types build && \
pnpm --filter atlas-frontend build
```

**Output Directory**: `.next`

### 6.3. Environment Variables

Set these in the Vercel dashboard (Settings → Environment Variables):

```env
NEXT_PUBLIC_API_URL=https://your-backend-url.onrender.com
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

### 6.4. Deployment

1. Click "Deploy"
2. Vercel will auto-build and deploy
3. Once deployed, you'll get a URL like `https://atlas-frontend-git-main.vercel.app`

### 6.5. Custom Domain (Optional)

In Vercel project settings:
1. Go to "Domains"
2. Add your domain (e.g., `app.atlas-protocol.com`)
3. Follow DNS verification steps

---

## 7. Phase 5: Optional Infrastructure

### 7.1. Redis Cache (Upstash Free Tier)

Upstash provides 10,000 free requests/day:

1. Go to [upstash.com](https://upstash.com)
2. Sign up and create a Redis database
3. Copy the REST URL and Token
4. Add to your backend environment:
   ```env
   REDIS_URL=redis://default:[TOKEN]@...upstash.io:6379
   ```

### 7.2. ClickHouse (Local Docker)

For development analytics (Phase 2 in roadmap):

```bash
docker run -d \
  --name clickhouse \
  -p 8123:8123 -p 9000:9000 \
  -e CLICKHOUSE_DB=atlas \
  clickhouse/clickhouse-server

# Apply ClickHouse schema
cat apps/backend/db/clickhouse/0001_metrics.sql | \
  clickhouse-client --host localhost --port 9000 --query "
  CREATE DATABASE IF NOT EXISTS atlas;
  "
```

### 7.3. Local Development Stack

For local development, use the provided docker-compose:

```bash
make docker-up    # Builds and starts postgres, backend, frontend
make docker-logs  # Tail all logs
make docker-down   # Stop everything
```

Note: The docker-compose uses port 8080 for backend and 3000 for frontend.

---

## 8. Environment Configuration

### 8.1. Complete .env Example (Testnet)

```env
# --- Shared ---
NODE_ENV=production
LOG_LEVEL=info

# --- Backend ---
BACKEND_PORT=10000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:your-password@db.region.supabase.co:5432/postgres
REPOSITORY_DRIVER=postgres
CORS_ORIGINS=https://your-frontend.vercel.app,https://your-backend.onrender.com
RATE_LIMIT_MAX=100
METRICS_ENABLED=true

# Redis (optional - from Upstash)
REDIS_URL=

# ClickHouse (optional - local only)
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_ENABLED=false

# --- Solana / Indexing ---
SOLANA_RPC_URL=https://api.devnet.solana.com
HELIUS_API_KEY=your-helius-api-key
HELIUS_WEBHOOK_SECRET=your-helius-webhook-secret
HELIUS_WEBHOOK_SIGNATURE_HEADER=x-webhook-signature

# Program IDs (from devnet deployment)
ATLAS_REGISTRY_PROGRAM_ID=9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8

# Kafka (disabled for free tier)
KAFKA_BROKERS=localhost:9092
KAFKA_ENABLED=false

# Oracle loop (disabled initially)
ORACLE_LOOP_ENABLED=false
ORACLE_LOOP_INTERVAL_MS=3600000
ORACLE_SUSPEND_THRESHOLD=40
ORACLE_KEYPAIR=

# Circuit breaker (disabled initially)
CIRCUIT_BREAKER_ENABLED=false
CIRCUIT_BREAKER_INTERVAL_MS=300000
GOVERNANCE_KEYPAIR=

# --- Frontend ---
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# --- Docker Compose (postgres) ---
POSTGRES_USER=atlas
POSTGRES_PASSWORD=atlas
POSTGRES_DB=atlas
```

### 8.2. Free Tier Limits to Be Aware Of

| Service | Free Tier Limit | Notes |
|---|---|---|
| Supabase DB | 500MB | Monitor usage in dashboard |
| Render | 750 hrs/mo, 512MB RAM | Sleeps after 15 min inactivity |
| Vercel | Custom domains, 100GB | Hobby plan is generous |
| Helius | 100K req/mo | Sufficient for testnet |
| Upstash | 10K req/day | Good for light caching |

---

## 9. Post-Deployment Verification

### 9.1. Test Backend Endpoints

```bash
# Health check
curl https://your-backend.onrender.com/health/ready

# API docs (Swagger)
# Visit: https://your-backend.onrender.com/docs

# Test vault list
curl https://your-backend.onrender.com/api/v1/vaults

# Test manager list
curl https://your-backend.onrender.com/api/v1/managers

# Test leaderboard
curl https://your-backend.onrender.com/api/v1/leaderboard
```

### 9.2. Test Frontend

1. Visit your frontend URL (e.g., `https://atlas-frontend.vercel.app`)
2. Verify:
   - Homepage loads with vault TVL display
   - `/strategies` page shows strategy filters
   - `/leaderboard` shows manager rankings (may be empty on fresh deploy)
   - `/protocol` shows protocol narrative
3. Connect Solana wallet (Phantom, Solflare):
   - Click "Connect" in top-right
   - Select your wallet
   - Switch to Devnet in wallet settings

### 9.3. Test Frontend-Backend Integration

```bash
# In browser dev tools (Network tab), verify:
# - Frontend calls API endpoints successfully
# - No CORS errors
# - Data flows correctly
```

### 9.4. Test Solana Integration

On devnet with your wallet:

1. Fund wallet with devnet SOL:
   ```bash
   solana airdrop 2 $(solana-keygen pubkey)
   ```

2. Deposit into a vault (via UI)
3. Check transaction on [SolanaFM devnet explorer](https://devnet.solana.fm)

---

## 10. CI/CD Setup

### 10.1. GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main, develop]
  workflow_dispatch:

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.9.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter atlas-types build
      - run: pnpm --filter atlas-backend build
      - name: Deploy to Render
        uses: render-deploy@v1
        with:
          apiKey: ${{ secrets.RENDER_API_KEY }}
          serviceId: ${{ secrets.RENDER_BACKEND_SERVICE_ID }}
          wait-for-deployment: true

  deploy-frontend:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.9.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter atlas-types build
      - run: pnpm --filter atlas-frontend build
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
          working-directory: ./apps/frontend
```

### 10.2. Required Secrets

Store these in GitHub repo Settings → Secrets → Actions:

| Secret Name | Value |
|---|---|
| `RENDER_API_KEY` | API key from Render dashboard |
| `RENDER_BACKEND_SERVICE_ID` | Your Render web service ID |
| `VERCEL_TOKEN` | Token from Vercel account settings |
| `VERCEL_ORG_ID` | Your Vercel organization ID |
| `VERCEL_PROJECT_ID` | Your Vercel project ID |

---

## 11. Cost Summary

### Free Tier Services (Total: $0/month)

| Service | Provider | Plan | Cost |
|---|---|---|---|
| PostgreSQL | Supabase | Free | $0 |
| Backend API | Render | Free Web Service | $0* |
| Frontend | Vercel | Hobby | $0 |
| Solana RPC | Public RPC | Devnet | $0 |
| Indexing | Helius | Free (100K req) | $0 |
| **Total** | | | **$0** |

\* Render free tier limits: 750 hours/month (enough for one service 24/7), 512MB RAM.

### When You Hit Free Limits

| Upgrade Trigger | Next Tier Cost | Notes |
|---|---|---|
| Supabase DB > 500MB | $25/month | Pro plan |
| Need always-on backend | $7/month | Render paid plan |
| More Vercel analytics | $25/month | Pro plan |
| Mainnet Solana RPC | $0-200/month | Depends on volume |
| More Helius requests | $49/month | 500K req plan |

---

## 12. Troubleshooting

### Common Issues

#### Issue: Backend crashes on startup
**Cause**: Missing required env vars or invalid env values

**Fix**: Check your environment variables match the schema in `apps/backend/src/env.ts`

```bash
# Test locally
DATABASE_URL=postgresql://... REPOSITORY_DRIVER=postgres \
  pnpm --filter atlas-backend start
```

#### Issue: CORS errors in frontend
**Cause**: Backend `CORS_ORIGINS` doesn't include frontend URL

**Fix**: Add your frontend domain to CORS_ORIGINS in backend env vars:
```env
CORS_ORIGINS=https://your-frontend.vercel.app
```

#### Issue: Frontend shows empty data
**Cause**: `NEXT_PUBLIC_API_URL` not set or incorrect

**Fix**: Verify in Vercel dashboard:
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

#### Issue: Solana transactions fail
**Cause**: Wrong RPC URL or insufficient SOL

**Fix**: 
1. Check wallet has devnet SOL: `solana balance`
2. Airdrop if needed: `solana airdrop 2 $(solana-keygen pubkey)`
3. Confirm RPC URL: `https://api.devnet.solana.com`

#### Issue: Database migrations fail
**Cause**: Incorrect DATABASE_URL or permissions

**Fix**:
1. Verify Supabase credentials
2. Test connection manually:
   ```bash
   psql "postgresql://postgres:password@db.region.supabase.co:5432/postgres"
   ```
3. Ensure you're running migrations in order (0001 → 0002 → etc.)

#### Issue: Docker builds fail
**Cause**: Missing `atlas-types` dist or incorrect build order

**Fix**:
```bash
# Always build types first
pnpm --filter atlas-types build
pnpm --filter atlas-sdk build  # if needed
# Then backend/frontend
pnpm --filter atlas-backend build
pnpm --filter atlas-frontend build
```

### Getting Help

- Check the [GitHub Issues](https://github.com/atlas-protocol/issues) for known problems
- Review logs in Render/Vercel dashboards
- Run tests locally for verification:
  ```bash
  pnpm --filter atlas-backend test
  pnpm --filter atlas-frontend test
  cargo test --workspace --manifest-path programs/Cargo.toml
  ```

---

## Appendix

### A. Program Addresses (Devnet Placeholders)

| Program | Placeholder Address | After Deploy |
|---|---|---|
| atlas-vault | `AfCPkgDj8ADzebwdWW9T8WTAyXVqMccaPkQJsQHFMhtr` | Your deployed ID |
| manager-registry | `9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8` | Your deployed ID |
| staking | `B2sKSyicsc65bJ8AXZigQSfa1MUBiKbBjRqpYQuT6iUA` | Your deployed ID |
| governance | _(not set)_ | Your deployed ID |
| treasury | _(not set)_ | Your deployed ID |

### B. Useful Commands

```bash
# Build everything
pnpm build

# Run all tests
pnpm test

# Type check all packages
pnpm typecheck

# Local development
pnpm dev:backend    # http://localhost:4000
pnpm dev:frontend   # http://localhost:3000

# Docker (full stack)
make docker-up
make docker-logs
make docker-down

# Solana programs
cargo test --workspace --manifest-path programs/Cargo.toml
cargo clippy --workspace --manifest-path programs/Cargo.toml
```

### C. Migration Files

Migration files in `apps/backend/db/migrations/`:

1. `0001_init.sql` - Core tables (managers, strategies, vaults, allocations)
2. `0002_performance.sql` - Time-series performance tables
3. `0003_strategy_uploads.sql` - Strategy upload workflow tables
4. `0004_governance.sql` - Governance proposals and votes

Apply these in order. They're idempotent (`CREATE TABLE IF NOT EXISTS`).

---

*This guide covers deploying the full Atlas Protocol stack using free-tier services for beta and testnet phases. For production deployment, review the [Economic Specification](docs/protocol-economics.md) and [Architecture docs](docs/architecture.md).*
