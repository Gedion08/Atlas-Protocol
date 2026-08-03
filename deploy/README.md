# Atlas Protocol Deployment Package

## Overview

This package contains everything needed to deploy the Atlas Protocol to Solana Devnet for beta testing. The deployment creates:

- 5 Solana programs (vault, manager-registry, staking, governance, treasury)
- On-chain protocol configurations (registry, vault, staking, treasury, governance)
- Token mints (bond, ATLAS, revenue)
- Test oracle keypairs

## Quick Start

```bash
# 1. Navigate to project root
cd /path/to/atlas-protocol

# 2. Run quick deployment
bash deploy/quick-deploy.sh
```

## Manual Steps

### Step 1: Install Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Install Anchor CLI v0.30.1
cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked

# Install Node.js 22+ and pnpm
curl -fsSL https://pnpm.io/install.sh | sh -r --installer pnpm
```

### Step 2: Build Programs

```bash
cd programs
anchor build
cd ..
```

### Step 3: Deploy Programs

```bash
cd programs

solana config set --url https://api.devnet.solana.com
solana config set --keypair ../deploy/deployer.json

# Deploy in dependency order
anchor deploy --program-name atlas-staking
anchor deploy --program-name atlas-manager-registry
anchor deploy --program-name atlas-vault
anchor deploy --program-name atlas-treasury
anchor deploy --program-name atlas-governance
```

### Step 4: Capture Program IDs

The deploy output shows each program ID. You'll see output like:

```
Program ID: ABC123...xyz
```

### Step 5: Initialize On-Chain Configs

```bash
# Install deploy dependencies
cd deploy
npm install

# Run initialization (replace program IDs with actual values from Step 4)
cd ..
node deploy/initialize-configs.js \
  --deployer deploy/deployer.json \
  --oracle1 deploy/oracle1.json \
  --oracle2 deploy/oracle2.json \
  --oracle3 deploy/oracle3.json \
  --staking <STAKING_PROGRAM_ID_FROM_STEP4> \
  --registry <REGISTRY_PROGRAM_ID_FROM_STEP4> \
  --vault <VAULT_PROGRAM_ID_FROM_STEP4> \
  --treasury <TREASURY_PROGRAM_ID_FROM_STEP4> \
  --governance <GOVERNANCE_PROGRAM_ID_FROM_STEP4> \
  --rpc https://api.devnet.solana.com
```

### Step 6: Update Application Configuration

After successful initialization, update your application configuration:

1. **`.env` file** in project root:
   ```env
   ATLAS_REGISTRY_PROGRAM_ID=<REGISTRY_PROGRAM_ID_FROM_STEP4>
   SOLANA_RPC_URL=https://api.devnet.solana.com
   ```

2. **Frontend** env vars (Vercel/Next.js):
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.com
   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
   ```

3. **`deploy/devnet-config.json`** - Auto-generated with all addresses

## File Structure

```
deploy/
├── deployer.json          # Your deployment wallet keypair (pre-generated)
├── oracle1.json           # Oracle 1 keypair (for NAV marks)
├── oracle2.json           # Oracle 2 keypair
├── oracle3.json           # Oracle 3 keypair
├── deploy.sh              # Main deployment script
├── quick-deploy.sh        # Quick deployment wrapper
├── initialize-configs.js  # On-chain configuration script
├── package.json           # Deploy dependencies
└── RUNBOOK.md             # Detailed step-by-step guide
```

## Wallet Information

- **Deployer**: `AqsVGUdZKd7cKr3KJSW7mTM1BwTyyS4pKqDAT5qDQBnu`
- **Status**: Pre-generated keypair file included
- **Funding**: Needs devnet SOL (airdrop with `solana airdrop`)

## What Gets Deployed On-Chain

### Programs (5 total)
1. **atlas_staking** - Manager bonding/unbonding/slashing
2. **atlas_manager_registry** - LP manager profiles and scoring
3. **atlas_vault** - Investor vault (deposits, withdrawals, rebalancing)
4. **atlas_treasury** - Protocol revenue and buybacks
5. **atlas_governance** - veATLAS voting and proposals

### Token Mints (3 total)
1. **Bond Mint** - For manager registration bonds (100 tokens required)
2. **ATLAS Mint** - Governance token (1,000,000 minted to deployer)
3. **Revenue Mint** - Treasury revenue collection

### PDAs (5 total)
1. `atlas_registry_config` - Registry protocol config
2. `vault_config` - Vault program config (M-of-N oracles)
3. `atlas_staking_config` - Staking program config
4. `atlas_treasury` - Treasury program config
5. `atlas_governance` - Governance program config

### Configuration Values

**Registry Config:**
- Governance: deployer (`AqsVGUdZKd7cKr3KJSW7mTM1BwTyyS4pKqDAT5qDQBnu`)
- Oracle: `oracle1` (score submission authority)
- Slash authority: deployer
- Bond amount: 100 tokens
- Score threshold: 40 (auto-suspend below)

**Vault Config:**
- Oracle set: `[oracle1, oracle2, oracle3]` (M-of-3)
- Min signatures: 3
- Risk engine: deployer (replace with actual risk engine)
- Treasury/Insurance/veAtlas: deployer
- Reserve target: 0

## Environment Variables (.env)

Required for backend and frontend:

```env
# Backend (.env)
NODE_ENV=production
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/DATABASE
REPOSITORY_DRIVER=postgres
ATLAS_REGISTRY_PROGRAM_ID=<REGISTRY_PROGRAM_ID>
SOLANA_RPC_URL=https://api.devnet.solana.com
HELIUS_API_KEY=your-helius-api-key
HELIUS_WEBHOOK_SECRET=your-webhook-secret
CIRCUIT_BREAKER_ENABLED=false
ORACLE_LOOP_ENABLED=false
CORS_ORIGINS=https://your-frontend.vercel.app
METRICS_ENABLED=true

# Frontend (NEXT_PUBLIC_*)
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
```

## Cost Breakdown (Free Tier)

| Service | Cost |
|---------|------|
| Solana Devnet | Free (free SOL via airdrop) |
| Supabase DB | Free ($0, 500MB) |
| Render Backend | Free ($0, 750hrs/mo) |
| Vercel Frontend | Free ($0, hobby plan) |
| Helius | Free ($0, 100K req/mo) |
| **Total** | **$0/month** |

## Testing the Deployment

### Check Health
```bash
curl https://your-backend.onrender.com/health/ready
```

### View On-Chain Accounts
```bash
solana account <PROGRAM_ID> --url https://api.devnet.solana.com
```

### Use the Frontend
1. Visit your Vercel deployment URL
2. Connect Phantom/Solflare wallet
3. Switch wallet to Devnet mode
4. Navigate the dashboard

## Troubleshooting

### "Insufficient funds for fee"
- Fund your wallet: `solana airdrop 2 --keypair deploy/deployer.json`

### "Program not found"
- Ensure programs deployed to devnet, not localnet
- Check Solana config: `solana config get`

### "IDL not found"
- Run `anchor build` from the `programs/` directory
- Ensure `programs/target/idl/*.json` files exist

### "Invalid program ID"
- Verify the program ID in your environment matches the deployed one
- Check `deploy/devnet-config.json` for auto-detected IDs

## Security Notes

⚠️ **CRITICAL**: This is a testnet deployment. Do NOT:
- Use real funds on mainnet
- Expose the deployer private key publicly
- Use the default fee configuration in production
- Skip governance decentralization

⚠️ The deployer keypair (`deploy/deployer.json`) controls all program configurations. Keep it secure.

---

For full details, see `RUNBOOK.md` in this directory.
