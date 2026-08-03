#!/bin/bash
# =============================================================================
# Atlas Protocol — Full Stack Deployment Script (Solana Devnet)
# =============================================================================
# This script deploys all 5 Anchor programs to Solana devnet and initializes
# the two on-chain protocol configurations (Registry Config + Vault Config).
#
# Prerequisites:
#   1. Solana CLI installed (https://docs.solana.com/cli/install-solana-cli-tools)
#   2. Anchor CLI installed: cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli
#   3. Rust toolchain installed
#   4. Node.js 20+ and pnpm 9+
#   5. The deployment wallet funded on devnet
#
# Usage:
#   bash deploy/deploy.sh
#
# =============================================================================

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Atlas Protocol Deployment Script ===${NC}"
echo -e "${YELLOW}Target: Solana Devnet${NC}"
echo ""

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="${PROJECT_ROOT}/deploy"
PROGRAMS_DIR="${PROJECT_ROOT}/programs"

# Deployment wallet (from deploy/deployer.json)
DEPLOYER_KEYPAIR="${DEPLOY_DIR}/deployer.json"
DEPLOYER_PUBKEY="AqsVGUdZKd7cKr3KJSW7mTM1BwTyyS4pKqDAT5qDQBnu"

# Generated oracle keypairs (for testing)
ORACLE1_KEYPAIR="${DEPLOY_DIR}/oracle1.json"
ORACLE2_KEYPAIR="${DEPLOY_DIR}/oracle2.json"
ORACLE3_KEYPAIR="${DEPLOY_DIR}/oracle3.json"
ORACLE1_KEYPAIR_REL="oracle1.json"
ORACLE2_KEYPAIR_REL="oracle2.json"
ORACLE3_KEYPAIR_REL="oracle3.json"

# Output file for deployed program IDs
OUTPUT_FILE="${DEPLOY_DIR}/deployed-program-ids.md"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Step 0: Verify Prerequisites
# =============================================================================

log_info "Checking prerequisites..."

if ! command -v cargo &> /dev/null; then
    log_error "Rust/Cargo not found. Please install Rust: https://rustup.rs"
    exit 1
fi

if ! command -v solana &> /dev/null; then
    log_error "Solana CLI not found. Please install: https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
fi

if ! command -v anchor &> /dev/null; then
    log_error "Anchor CLI not found. Installing Anchor CLI..."
    cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked
    if [ $? -ne 0 ]; then
        log_error "Failed to install Anchor CLI. Manual installation:"
        log_error "cargo install --git https://github.com/coral-xyz/anchor --tag v0.30.1 anchor-cli --locked"
        exit 1
    fi
fi

if ! command -v pnpm &> /dev/null; then
    log_error "pnpm not found. Please install: npm install -g pnpm"
    exit 1
fi

log_success "All prerequisites installed."

# =============================================================================
# Step 1: Configure Solana RPC
# =============================================================================

RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"

log_info "Configuring Solana RPC endpoint..."
log_info "Using RPC URL: ${RPC_URL}"
solana config set --url "${RPC_URL}"
solana config set --keypair "${DEPLOYER_KEYPAIR}"

log_info "Checking deployer wallet balance..."
BALANCE=$(solana balance "${DEPLOYER_PUBKEY}" --url "${RPC_URL}" 2>/dev/null || echo "0")
log_info "Deployer balance: ${BALANCE} SOL"

if [ "${BALANCE}" = "0" ] || [ "${BALANCE}" = "SOL 0.000090000" ]; then
    log_warning "Insufficient SOL balance. Requesting airdrop..."
    solana airdrop 2 "${DEPLOYER_PUBKEY}" --url "${RPC_URL}" || true
    sleep 5
fi

# =============================================================================
# Step 2: Generate Oracle Keypairs (for testing)
# =============================================================================

log_info "Generating oracle keypairs..."

if [ ! -f "${ORACLE1_KEYPAIR}" ]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "${ORACLE1_KEYPAIR}" --force
    log_success "Generated oracle1 keypair"
else
    log_info "Oracle1 keypair already exists"
fi

if [ ! -f "${ORACLE2_KEYPAIR}" ]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "${ORACLE2_KEYPAIR}" --force
    log_success "Generated oracle2 keypair"
else
    log_info "Oracle2 keypair already exists"
fi

if [ ! -f "${ORACLE3_KEYPAIR}" ]; then
    solana-keygen new --no-bip39-passphrase --silent --outfile "${ORACLE3_KEYPAIR}" --force
    log_success "Generated oracle3 keypair"
else
    log_info "Oracle3 keypair already exists"
fi

cd "${DEPLOY_DIR}"
ORACLE1_PUBKEY=$(solana-keygen pubkey "${ORACLE1_KEYPAIR_REL}" 2>/dev/null || true)
ORACLE2_PUBKEY=$(solana-keygen pubkey "${ORACLE2_KEYPAIR_REL}" 2>/dev/null || true)
ORACLE3_PUBKEY=$(solana-keygen pubkey "${ORACLE3_KEYPAIR_REL}" 2>/dev/null || true)
cd "${PROJECT_ROOT}"

log_info "Oracle 1: ${ORACLE1_PUBKEY}"
log_info "Oracle 2: ${ORACLE2_PUBKEY}"
log_info "Oracle 3: ${ORACLE3_PUBKEY}"

# =============================================================================
# Step 3: Build All Programs
# =============================================================================

log_info "Building Solana programs..."

cd "${PROGRAMS_DIR}"

# Build all programs
anchor build 2>&1 | tee deploy_build.log

if [ $? -ne 0 ]; then
    log_error "Build failed. Check deploy_build.log for details."
    exit 1
fi

log_success "All programs built successfully."

# =============================================================================
# Step 4: Deploy Programs (in dependency order)
# =============================================================================

log_info "Deploying programs to devnet in dependency order..."

# Deploy order: staking → manager-registry → vault → treasury → governance
# (because manager-registry depends on staking for CPI, vault depends on manager-registry)

cd "${PROGRAMS_DIR}"

# 4.1 Deploy staking (no dependencies)
log_info "Deploying atlas_staking..."
STAKING_RESULT=$(anchor deploy --program-name atlas-staking 2>&1)
echo "${STAKING_RESULT}"
STAKING_PID=$(echo "${STAKING_RESULT}" | grep -oP 'Program ID: \K[a-zA-Z0-9]+')
if [ -z "${STAKING_PID}" ]; then
    # Try to parse from deploy output
    STAKING_PID=$(echo "${STAKING_RESULT}" | grep -oP 'Deploying \K[a-zA-Z0-9]+' | head -1)
fi
log_success "atlas_staking deployed: ${STAKING_PID}"

# 4.2 Deploy manager-registry (depends on staking)
log_info "Deploying atlas_manager_registry..."
REGISTRY_RESULT=$(anchor deploy --program-name atlas-manager-registry 2>&1)
echo "${REGISTRY_RESULT}"
REGISTRY_PID=$(echo "${REGISTRY_RESULT}" | grep -oP 'Program ID: \K[a-zA-Z0-9]+')
if [ -z "${REGISTRY_PID}" ]; then
    REGISTRY_PID=$(echo "${REGISTRY_RESULT}" | grep -oP 'Deploying \K[a-zA-Z0-9]+' | head -1)
fi
log_success "atlas_manager_registry deployed: ${REGISTRY_PID}"

# 4.3 Deploy vault (depends on manager-registry)
log_info "Deploying atlas_vault..."
VAULT_RESULT=$(anchor deploy --program-name atlas-vault 2>&1)
echo "${VAULT_RESULT}"
VAULT_PID=$(echo "${VAULT_RESULT}" | grep -oP 'Program ID: \K[a-zA-Z0-9]+')
if [ -z "${VAULT_PID}" ]; then
    VAULT_PID=$(echo "${VAULT_RESULT}" | grep -oP 'Deploying \K[a-zA-Z0-9]+' | head -1)
fi
log_success "atlas_vault deployed: ${VAULT_PID}"

# 4.4 Deploy treasury (no dependencies)
log_info "Deploying atlas_treasury..."
TREASURY_RESULT=$(anchor deploy --program-name atlas-treasury 2>&1)
echo "${TREASURY_RESULT}"
TREASURY_PID=$(echo "${TREASURY_RESULT}" | grep -oP 'Program ID: \K[a-zA-Z0-9]+')
if [ -z "${TREASURY_PID}" ]; then
    TREASURY_PID=$(echo "${TREASURY_RESULT}" | grep -oP 'Deploying \K[a-zA-Z0-9]+' | head -1)
fi
log_success "atlas_treasury deployed: ${TREASURY_PID}"

# 4.5 Deploy governance (no dependencies)
log_info "Deploying atlas_governance..."
GOVERNANCE_RESULT=$(anchor deploy --program-name atlas-governance 2>&1)
echo "${GOVERNANCE_RESULT}"
GOVERNANCE_PID=$(echo "${GOVERNANCE_RESULT}" | grep -oP 'Program ID: \K[a-zA-Z0-9]+')
if [ -z "${GOVERNANCE_PID}" ]; then
    GOVERNANCE_PID=$(echo "${GOVERNANCE_RESULT}" | grep -oP 'Deploying \K[a-zA-Z0-9]+' | head -1)
fi
log_success "atlas_governance deployed: ${GOVERNANCE_PID}"

# =============================================================================
# Step 5: Initialize On-Chain Configurations
# =============================================================================

log_info "Initializing on-chain configurations..."

# We'll use a TypeScript script for the complex initialization logic
cd "${PROJECT_ROOT}"

# Build types first
log_info "Building shared types..."
pnpm --filter atlas-types build

# Run the initialization script
log_info "Running on-chain configuration initialization..."
node "${DEPLOY_DIR}/initialize-configs.js" \
    --deployer "${DEPLOYER_KEYPAIR}" \
    --oracle1 "${ORACLE1_KEYPAIR}" \
    --oracle2 "${ORACLE2_KEYPAIR}" \
    --oracle3 "${ORACLE3_KEYPAIR}" \
    --staking "${STAKING_PID}" \
    --registry "${REGISTRY_PID}" \
    --vault "${VAULT_PID}" \
    --treasury "${TREASURY_PID}" \
    --governance "${GOVERNANCE_PID}" \
    --rpc "${RPC_URL}"

# =============================================================================
# Step 6: Output Results
# =============================================================================

cat > "${OUTPUT_FILE}" << EOF
# Atlas Protocol — Deployed Program IDs (Solana Devnet)

Deployment Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Wallet: ${DEPLOYER_PUBKEY}

## Program IDs

| Program | Address |
|---------|---------|
| Vault | ${VAULT_PID} |
| Manager Registry | ${REGISTRY_PID} |
| Staking | ${STAKING_PID} |
| Governance | ${GOVERNANCE_PID} |
| Treasury | ${TREASURY_PID} |

## Oracle Keypairs (for testing)

- oracle1: ${DEPLOYER_PUBKEY}
- oracle2: ${DEPLOYER_PUBKEY}
- oracle3: ${DEPLOYER_PUBKEY}

## Next Steps

1. Update your `.env` file with the program IDs above:
   \`\`\`
   ATLAS_REGISTRY_PROGRAM_ID=${REGISTRY_PID}
   \`\`\`

2. Update the frontend environment:
   \`\`\`
   NEXT_PUBLIC_API_URL=https://your-backend-url.com
   NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
   \`\`\`

3. Fund oracle wallets with devnet SOL if needed:
   \`\`\`bash
   solana airdrop 1 ${ORACLE1_PUBKEY} --url https://api.devnet.solana.com
   \`\`\`

EOF

log_success "Deployment complete!"
log_info "Program IDs saved to ${OUTPUT_FILE}"
log_info "Review the file for next steps."

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Atlas Protocol Deployment Complete!  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Deployed Programs:"
echo "  Vault:            ${VAULT_PID}"
echo "  Manager Registry: ${REGISTRY_PID}"
echo "  Staking:          ${STAKING_PID}"
echo "  Governance:        ${GOVERNANCE_PID}"
echo "  Treasury:         ${TREASURY_PID}"
echo ""
