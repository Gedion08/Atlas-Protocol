#!/bin/bash
# Quick deploy script - runs the full deployment sequence
# Place this in deploy/quick-deploy.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Atlas Protocol Quick Deploy ===${NC}"
echo -e "${YELLOW}Target: Solana Devnet${NC}"
echo ""

# Step 1: Verify wallet exists
if [ ! -f "deploy/deployer.json" ]; then
    echo -e "${RED}ERROR: deploy/deployer.json not found${NC}"
    echo "Please ensure the deployer keypair file exists."
    exit 1
fi

DEPLOYER_PUBKEY=$(python3 -c "
import json
import base58
with open('deploy/deployer.json') as f:
    key = json.load(f)
if len(key) != 64:
    print('Invalid keypair')
    exit(1)
# Derive public key from the last 32 bytes
secret = bytes(key[:32])
pub = bytes(key[32:])
print(base58.b58encode(pub).decode())
")

echo -e "${GREEN}Deployer Pubkey: ${DEPLOYER_PUBKEY}${NC}"

# Step 2: Check balance
echo -e "${YELLOW}Checking balance...${NC}"
BALANCE=$(solana balance "$DEPLOYER_PUBKEY" --url https://api.devnet.solana.com 2>/dev/null | awk '{print $1}' | sed 's/SOL//')
echo "Current balance: ${BALANCE} SOL"

if (( $(echo "$BALANCE < 0.5" | bc -l 2>/dev/null || echo "1") )); then
    echo -e "${YELLOW}Requesting airdrop...${NC}"
    solana airdrop 2 "$DEPLOYER_PUBKEY" --url https://api.devnet.solana.com || true
    sleep 5
fi

# Step 3: Build programs
echo ""
echo -e "${YELLOW}=== Building Solana Programs ===${NC}"
cd programs
anchor build
cd "$PROJECT_ROOT"

# Step 4: Deploy programs
echo ""
echo -e "${YELLOW}=== Deploying Programs ===${NC}"

solana config set --url https://api.devnet.solana.com
solana config set --keypair deploy/deployer.json

echo "Deploying staking..."
anchor deploy --program-name atlas-staking 2>&1 | grep -E "Program ID:|Deploying" || true
STAKING_PID=$(solana program show --output json 2>/dev/null | jq -r '.programs[0].programId' || echo "unknown")

echo "Deploying manager-registry..."
anchor deploy --program-name atlas-manager-registry 2>&1 | grep -E "Program ID:|Deploying" || true

echo "Deploying vault..."
anchor deploy --program-name atlas-vault 2>&1 | grep -E "Program ID:|Deploying" || true

echo "Deploying treasury..."
anchor deploy --program-name atlas-treasury 2>&1 | grep -E "Program ID:|Deploying" || true

echo "Deploying governance..."
anchor deploy --program-name atlas-governance 2>&1 | grep -E "Program ID:|Deploying" || true

# Step 5: Generate oracle keypairs
echo ""
echo -e "${YELLOW}=== Generating Oracle Keypairs ===${NC}"
for i in 1 2 3; do
    if [ ! -f "deploy/oracle${i}.json" ]; then
        solana-keygen new --no-bip39-passphrase --silent --outfile "deploy/oracle${i}.json" --force
        ORACLE_PUBKEY=$(solana-keygen pubkey "deploy/oracle${i}.json" 2>/dev/null || python3 -c "
import json, base58
with open('deploy/oracle${i}.json') as f:
    key = json.load(f)
print(base58.b58encode(bytes(key[32:])).decode())
")
        echo "Generated oracle${i}: ${ORACLE_PUBKEY}"
        solana airdrop 0.5 "$ORACLE_PUBKEY" --url https://api.devnet.solana.com || true
    else
        echo "oracle${i}.json already exists"
    fi
done

# Step 6: Run initialization
echo ""
echo -e "${YELLOW}=== Running On-Chain Initialization ===${NC}"

# Get program IDs from program deploy logs
echo "Extracting program IDs..."
STAKING_PID=$(solana program show --output json-filter 2>/dev/null | grep -A2 atlas-staking | grep programId | grep -oE '[A-Za-z0-9]{32,44}' || echo "")
REGISTRY_PID=$(solana program show --output json-filter 2>/dev/null | grep -A2 atlas_manager_registry | grep programId | grep -oE '[A-Za-z0-9]{32,44}' || echo "")
VAULT_PID=$(solana program show --output json-filter 2>/dev/null | grep -A2 atlas_vault | grep programId | grep -oE '[A-Za-z0-9]{32,44}' || echo "")
TREASURY_PID=$(solana program show --output json-filter 2>/dev/null | grep -A2 atlas_treasury | grep programId | grep -oE '[A-Za-z0-9]{32,44}' || echo "")
GOVERNANCE_PID=$(solana program show --output json-filter 2>/dev/null | grep -A2 atlas_governance | grep programId | grep -oE '[A-Za-z0-9]{32,44}' || echo "")

echo "Found program IDs:"
echo "  Staking: ${STAKING_PID:-not found}"
echo "  Registry: ${REGISTRY_PID:-not found}"
echo "  Vault: ${VAULT_PID:-not found}"
echo "  Treasury: ${TREASURY_PID:-not found}"
echo "  Governance: ${GOVERNANCE_PID:-not found}"

# If we can't auto-detect, provide instructions
if [ -z "$STAKING_PID" ] || [ -z "$REGISTRY_PID" ] || [ -z "$VAULT_PID" ]; then
    echo -e "${RED}WARNING: Could not auto-detect all program IDs${NC}"
    echo "Please run initialization manually with the correct IDs:"
    echo ""
    cat << 'MANUAL'
node deploy/initialize-configs.js \
  --deployer deploy/deployer.json \
  --oracle1 deploy/oracle1.json \
  --oracle2 deploy/oracle2.json \
  --oracle3 deploy/oracle3.json \
  --staking <STAKING_PID> \
  --registry <REGISTRY_PID> \
  --vault <VAULT_PID> \
  --treasury <TREASURY_PID> \
  --governance <GOVERNANCE_PID> \
  --rpc https://api.devnet.solana.com
MANUAL
    exit 1
fi

# Run initialization
node deploy/initialize-configs.js \
    --deployer deploy/deployer.json \
    --oracle1 deploy/oracle1.json \
    --oracle2 deploy/oracle2.json \
    --oracle3 deploy/oracle3.json \
    --staking "$STAKING_PID" \
    --registry "$REGISTRY_PID" \
    --vault "$VAULT_PID" \
    --treasury "$TREASURY_PID" \
    --governance "$GOVERNANCE_PID" \
    --rpc https://api.devnet.solana.com

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "Next steps:"
echo "  1. Update .env with program IDs"
echo "  2. Deploy frontend and backend to hosting (Vercel/Render)"
echo "  3. Set up Helius webhook for indexing"
echo "  4. Run 'pnpm --filter atlas-types build' before deploying TS apps"
