# Atlas Protocol Deployment Runbook (Solana Devnet)

## Overview

This runbook provides step-by-step instructions to deploy the Atlas Protocol to Solana Devnet using free-tier services. The deployment includes:

1. Building and deploying 5 Solana programs
2. Initializing on-chain protocol configurations
3. Deploying backend and frontend to free hosting

## Prerequisites

### Install Required Tools

```bash
# 1. Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# 2. Install Solana CLI (v1.18+ recommended)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
# Or via pip on some systems:
# pip3 install --break-system-packages solders

# 3. Install Anchor CLI only if you need the Anchor JS tooling
#    The repo's committed build path is Cargo-based, not Anchor-based.
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked --debug

# 4. Install Node.js 22+ and pnpm
curl -fsSL https://get.pnpm.io/install.sh | sh -
# Or: npm install -g pnpm

# 5. Verify installations

```

### Project Setup

```bash
cd /path/to/atlas-protocol
pnpm install
```

---

## Phase 1: Build Solana Programs

```bash
cd ~/Projects/Atlas\ Protocol

# Build the Rust workspace entrypoint used by this repo
export PATH="$HOME/.cargo/bin:$PATH"
cargo build --workspace --manifest-path programs/Cargo.toml
```

### Expected result

- The command should finish successfully with a line like:
  `Finished dev profile [unoptimized + debuginfo] target(s) in ...`
- The resulting compiled artifacts live under `programs/target/debug/` for the local Cargo build.
- You may see `unexpected cfg` warnings such as `anchor-debug`, `custom-heap`, `custom-panic`, and `solana` during the build. Those warnings are non-fatal for the current Cargo workspace build and do not indicate a broken compilation.

**Note**: This repository is a Cargo workspace, not a committed Anchor workspace. If you run `anchor build` from `programs/`, you can get `Not in workspace` because there is no committed `Anchor.toml` in the repo. The supported build entrypoint here is `cargo build --workspace --manifest-path programs/Cargo.toml`.

---

## Phase 2: Prepare Deployment Wallet

### Option A: Use the provided wallet

The keypair file has been created at `deploy/deployer.json`. Before using it, you MUST:

1. **Verify ownership**: This wallet is provided by the user — make sure you control it
2. **Fund with devnet SOL**: The wallet needs SOL for transaction fees

```bash
# Set Solana to devnet
solana config set --url https://api.devnet.solana.com

# Check current balance
solana balance --keypair deploy/deployer.json

# Request airdrop if balance is low (get 2 SOL)
solana airdrop 2 --keypair deploy/deployer.json

# Verify new balance
solana balance --keypair deploy/deployer.json
```

### Option B: Create a new deployment wallet

```bash
# Generate a fresh wallet
solana-keygen new --no-bip39-passphrase --outfile deploy/deployer.json

# Fund it
solana airdrop 2 --keypair deploy/deployer.json
```

### Generate Oracle Keypairs (for testing)

```bash
solana-keygen new --no-bip39-passphrase --silent --outfile deploy/oracle1.json --force
solana-keygen new --no-bip39-passphrase --silent --outfile deploy/oracle2.json --force
solana-keygen new --no-bip39-passphrase --silent --outfile deploy/oracle3.json --force

# Fund oracle wallets (they need SOL for signing transactions)
solana airdrop 1 $(solana-keygen pubkey deploy/oracle1.json)
solana airdrop 1 $(solana-keygen pubkey deploy/oracle2.json)
solana airdrop 1 $(solana-keygen pubkey deploy/oracle3.json)
```

---

## Phase 3: Deploy Programs to Devnet

### 3.1. Deploy in Dependency Order

Programs must be deployed in a specific order due to cross-program invocations (CPI):

```bash
cd programs

# Set to devnet
solana config set --url https://api.devnet.solana.com
solana config set --keypair ../deploy/deployer.json

# 1. Deploy staking (no dependencies)
echo "=== Deploying atlas_staking ==="
anchor deploy --program-name atlas-staking

# 2. Deploy manager-registry (depends on staking for CPI)
echo "=== Deploying atlas_manager_registry ==="
anchor deploy --program-name atlas-manager-registry

# 3. Deploy vault (depends on manager-registry for CPI)
echo "=== Deploying atlas_vault ==="
anchor deploy --program-name atlas-vault

# 4. Deploy treasury (no dependencies)
echo "=== Deploying atlas_treasury ==="
anchor deploy --program-name atlas-treasury

# 5. Deploy governance (no dependencies)
echo "=== Deploying atlas_governance ==="
anchor deploy --program-name atlas-governance
```

### 3.2. Capture Program IDs

After each deployment, Anchor will output the program ID. Note them down:

```
Program ID: <PROGRAM_ID>
```

You can also verify deployed programs:

```bash
solana program show <PROGRAM_ID> --url https://api.devnet.solana.com
```

### 3.3. Update Program IDs in Source

After deployment, update the program IDs in the Rust source:

```bash
# For each program, update the declare_id! macro:
cd programs

# Edit each program's lib.rs to use the newly deployed IDs
# Example: programs/vault/src/lib.rs
# Change: declare_id!("AfCPkgDj8ADzebwdWW9T8WTAyXVqMccaPkQJsQHFMhtr")
# To:     declare_id!("<your-deployed-program-id>")

# This step is optional for first deployment but recommended for correctness
```

---

## Phase 4: Initialize On-Chain Configurations

### 4.1. Install Backend Dependencies for Initialization

```bash
cd /path/to/atlas-protocol

# Install dependencies
pnpm install

# Build shared types (required)
pnpm --filter atlas-types build

# Install Anchor JS in deploy directory
cd deploy
npm init -y
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token yargs
```

### 4.2. Run Initialization Script

```bash
cd /path/to/atlas-protocol

node deploy/initialize-configs.js \
  --deployer deploy/deployer.json \
  --oracle1 deploy/oracle1.json \
  --oracle2 deploy/oracle2.json \
  --oracle3 deploy/oracle3.json \
  --staking <STAKING_PROGRAM_ID> \
  --registry <REGISTRY_PROGRAM_ID> \
  --vault <VAULT_PROGRAM_ID> \
  --treasury <TREASURY_PROGRAM_ID> \
  --governance <GOVERNANCE_PROGRAM_ID> \
  --rpc https://api.devnet.solana.com
```

### 4.3. What Gets Initialized

The script performs these on-chain operations:

1. **Token Mints Created**:
   - `bondMint` - For manager registration bonds
   - `atlasMint` - For governance voting (1M ATLAS minted to deployer)
   - `revenueMint` - For treasury revenue

2. **Staking Config**:
   - Sets vault program reference
   - Sets premium/bond mint
   - Slash authority = deployer

3. **Registry Config**:
   - Oracle: `oracle1` (can submit manager scores)
   - Slash authority: deployer
   - Bond amount: 100 tokens (100,000,000 base units)
   - Score threshold: 40 (auto-suspend below this)

4. **Vault Config**:
   - Oracle set: `[oracle1, oracle2, oracle3]` (M-of-3)
   - Min signatures: 3
   - Risk engine: deployer (replace with actual risk engine in prod)
   - Treasury/Insurance/veAtlas: deployer
   - Reserve target: 0

5. **Treasury Config**:
   - Intrinsic price: 10,000 bps (1:1)
   - Oracle set: same 3 oracles
   - Revenue mint and ATLAS mint references

6. **Governance Config**:
   - Atlas mint reference set
   - Deployer as governance authority

### 4.4. Troubleshooting

**Error: "already initialized"**

- This means the PDA was already initialized in a previous run
- The script handles this gracefully (skips or updates)

**Error: "Insufficient funds for fee"**

- Fund your deployer wallet: `solana airdrop 2 --keypair deploy/deployer.json`

**Error: "IDL not found"**

- Ensure you ran `anchor build` first (generates IDLs in `programs/target/idl/`)
- Check the `--idl-dir` path

**Error: "Transaction too large"**

- The initialization creates multiple accounts in one transaction
- If it fails, the script will partially succeed — check which PDAs were initialized

---

## Phase 5: Deploy Backend API (Render.com Free Tier)

### 5.1. Create Render.com Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Fork/push your Atlas Protocol repository to GitHub

### 5.2. Create PostgreSQL Add-on

1. In Render dashboard, click "New" → "PostgreSQL"
2. Name: `atlas-db`
3. Database name: `atlas`
4. Region: Choose closest to your users
5. Plan: Free (sufficient for development)

Alternatively, use Supabase for PostgreSQL hosting.

### 5.3. Create Web Service

1. Click "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `atlas-backend`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Build Command**:

   ```bash
   pnpm install --frozen-lockfile && \
   pnpm --filter atlas-types build && \
   pnpm --filter atlas-backend build
   ```

   - **Start Command**: `node apps/backend/dist/index.js`
   - **Plan**: Free (512MB RAM)

### 5.4. Set Environment Variables

In the Render dashboard for your backend service:

```
NODE_ENV=production
BACKEND_PORT=10000
HOST=0.0.0.0
DATABASE_URL=postgresql://postgres:postgres@aws-us-west-2.render.com:5432/atlas
REPOSITORY_DRIVER=postgres

# Get from your deployed program IDs
ATLAS_REGISTRY_PROGRAM_ID=7n1a5j...your-registry-program-id

# Solana devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Helius (optional for indexing)
HELIUS_API_KEY=your-helius-api-key

# CORS (add your frontend domain)
CORS_ORIGINS=https://atlas-frontend.onrender.com,https://your-frontend.vercel.app

# Circuit breaker (disable for beta)
CIRCUIT_BREAKER_ENABLED=false
ORACLE_LOOP_ENABLED=false

# Metrics
METRICS_ENABLED=true
```

### 5.5. Database Setup

After the database is provisioned:

```bash
# Apply migrations
DATABASE_URL="postgresql://postgres:postgres@HOST:5432/atlas" \
  pnpm --filter atlas-backend db:migrate

# Or run from Render shell:
render shell
# Then inside the shell:
DATABASE_URL="postgresql://..." pnpm --filter atlas-backend db:migrate
```

---

## Phase 6: Deploy Frontend (Vercel Free Tier)

### 6.1. Create Vercel Project

1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub
3. Click "New Project" → Import your repository

### 6.2. Configure Build Settings

- **Framework Preset**: Next.js (auto-detected)
- **Build Command**:
  ```bash
  pnpm install --frozen-lockfile && \
  pnpm --filter atlas-types build && \
  pnpm --filter atlas-frontend build
  ```
- **Output Directory**: `.next`
- **Install Command**: `pnpm install --frozen-lockfile`

### 6.3. Environment Variables

In Vercel project settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

### 6.4. Deploy

Click "Deploy" — Vercel will auto-deploy on every git push.

---

## Phase 7: Verification

### 7.1. Backend Health Check

```bash
curl https://your-backend.onrender.com/health/ready
# Expected: {"status":"ok","checks":[{"name":"database","status":"pass"}]}
```

### 7.2. API Endpoints

```bash
# List vaults (may be empty initially)
curl https://your-backend.onrender.com/api/v1/vaults

# List managers
curl https://your-backend.onrender.com/api/v1/managers

# Leaderboard
curl https://your-backend.onrender.com/api/v1/leaderboard

# Swagger docs
# Visit: https://your-backend.onrender.com/docs
```

### 7.3. Frontend

Visit your Vercel deployment URL:

- Homepage should load with the Atlas Protocol dashboard
- Connect a Solana wallet (Phantom, Solflare)
- Switch wallet to **Devnet** mode
- Test: Create a vault interaction

### 7.4. On-Chain Verification

```bash
# View registry config
solana account <REGISTRY_CONFIG_PDA> --url https://api.devnet.solana.com

# View vault config
solana account <VAULT_CONFIG_PDA> --url https://api.devnet.solana.com

# View staking config
solana account <STAKING_CONFIG_PDA> --url https://api.devnet.solana.com
```

---

## Phase 8: Optional Services

### 8.1. Set Up Helius Webhook (Indexing)

1. Create project at [helius.dev](https://helius.dev)
2. In your backend, enable:
   ```
   HELIUS_WEBHOOK_URL=https://your-backend.com/webhooks/helius
   HELIUS_WEBHOOK_SECRET=your-secret
   ```
3. Register the webhook in Helius dashboard

### 8.2. Redis Caching (Upstash Free Tier)

1. Go to [upstash.com](https://upstash.com)
2. Create Redis database
3. Add to backend env:
   ```
   REDIS_URL=rediss://default:your-token@your-redis.upstash.io:6379
   ```

### 8.3. Monitoring

The backend exposes Prometheus metrics:

```
curl https://your-backend.onrender.com/metrics
```

---

## Cost Summary

| Service           | Free Tier Limit           | Status    |
| ----------------- | ------------------------- | --------- |
| Supabase          | 500MB DB, 500MB storage   | ✅ In use |
| Render (Backend)  | 750 hrs/mo, 512MB RAM     | ✅ In use |
| Vercel (Frontend) | 100GB bandwidth, 125k req | ✅ In use |
| Helius            | 100K req/month            | ✅ Free   |
| Solana Devnet     | Unlimited free SOL        | ✅ Free   |

**Total monthly cost: $0**

---

## Troubleshooting Guide

### Common Issues

**Q: "Cannot find module 'atlas-types'"**
A: Always run `pnpm --filter atlas-types build` before building backend/frontend.

**Q: "Invalid environment configuration"**
A: Check all required env vars are set. The backend uses zod validation.

**Q: "Program not found" / "Invalid program ID"**
A: Make sure program IDs are updated in `.env` after deployment.

**Q: Anchor build fails**
A: Ensure you're in the `programs/` directory and Cargo workspace is intact.

**Q: Docker deployment fails**
A: Run `pnpm --filter atlas-types build` and `pnpm --filter atlas-sdk build` first.

### Recovery Steps

If deployment fails halfway:

1. Check program IDs in `deploy/devnet-config.json`
2. Re-run initialization script (it handles partial states)
3. Verify Solana cluster: `solana config get`
4. Check wallet balance: `solana balance --keypair deploy/deployer.json`
