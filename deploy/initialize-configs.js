#!/usr/bin/env node
/**
 * Atlas Protocol — On-Chain Configuration Initialization Script (v2)
 *
 * This script initializes the two main on-chain protocol configurations after
 * deploying the Anchor programs to Solana devnet:
 *
 * 1. Registry Config (manager-registry program)
 *    - Governance authority
 *    - Oracle key (who can submit scores)
 *    - Slash authority
 *    - Bond mint and amount
 *
 * 2. Vault Config (vault program)
 *    - M-of-N oracle set (3+ oracles for NAV marks)
 *    - Risk engine address
 *    - Treasury, insurance, veatlas addresses
 *
 * 3. Staking Config (staking program)
 *    - Vault program reference
 *    - Premium mint reference
 *
 * 4. Treasury Config (treasury program)
 *    - Oracle set, revenue mint, atlas mint
 *
 * 5. Governance Config (governance program)
 *    - Atlas mint reference
 *
 * Prerequisites:
 * - Programs built and deployed (anchor deploy)
 * - IDLs available at target/idl/
 * - Deployer wallet funded on devnet
 * - Node.js dependencies installed: @solana/web3.js @solana/spl-token @coral-xyz/anchor
 *
 * Usage:
 *   node deploy/initialize-configs.js \
 *     --deployer ./deploy/deployer.json \
 *     --oracle1 ./deploy/oracle1.json \
 *     --oracle2 ./deploy/oracle2.json \
 *     --oracle3 ./deploy/oracle3.json \
 *     --staking <PROGRAM_ID> \
 *     --registry <PROGRAM_ID> \
 *     --vault <PROGRAM_ID> \
 *     --treasury <PROGRAM_ID> \
 *     --governance <PROGRAM_ID> \
 *     --rpc https://api.devnet.solana.com
 */

import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import anchor from "@coral-xyz/anchor";
import fs from "node:fs";
import path from "node:path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

const { Program, BN, AnchorProvider, Wallet } = anchor;

const argv = yargs(hideBin(process.argv))
  .option("deployer", {
    describe: "Path to deployer keypair JSON file",
    type: "string",
    demandOption: true,
  })
  .option("oracle1", {
    describe: "Path to oracle1 keypair JSON file",
    type: "string",
    demandOption: true,
  })
  .option("oracle2", {
    describe: "Path to oracle2 keypair JSON file",
    type: "string",
    demandOption: true,
  })
  .option("oracle3", {
    describe: "Path to oracle3 keypair JSON file",
    type: "string",
    demandOption: true,
  })
  .option("staking", {
    describe: "Staking program ID",
    type: "string",
    demandOption: true,
  })
  .option("registry", {
    describe: "Manager registry program ID",
    type: "string",
    demandOption: true,
  })
  .option("vault", {
    describe: "Vault program ID",
    type: "string",
    demandOption: true,
  })
  .option("treasury", {
    describe: "Treasury program ID",
    type: "string",
    demandOption: true,
  })
  .option("governance", {
    describe: "Governance program ID",
    type: "string",
    demandOption: true,
  })
  .option("rpc", {
    describe: "Solana RPC URL",
    type: "string",
    default: "https://api.devnet.solana.com",
  })
  .option("idl-dir", {
    describe: "Path to IDL directory (default: programs/target/idl)",
    type: "string",
    default: path.resolve(process.cwd(), "programs/target/idl"),
  })
  .parseSync();

const colors = {
  info: "\x1b[36m",
  success: "\x1b[32m",
  warning: "\x1b[33m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
};

function logInfo(msg) {
  console.log(`${colors.info}[INFO]${colors.reset} ${msg}`);
}
function logSuccess(msg) {
  console.log(`${colors.success}[SUCCESS]${colors.reset} ${msg}`);
}
function logWarning(msg) {
  console.log(`${colors.warning}[WARNING]${colors.reset} ${msg}`);
}
function logError(msg) {
  console.log(`${colors.error}[ERROR]${colors.reset} ${msg}`);
}

function loadKeypair(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} keypair not found: ${filePath}`);
  }
  const secretKey = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (secretKey.length !== 64) {
    throw new Error(
      `${label} keypair should have 64 elements, got ${secretKey.length}`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(
    seeds.map((s) => (s instanceof PublicKey ? s.toBuffer() : Buffer.from(s))),
    typeof programId === "string" ? new PublicKey(programId) : programId,
  );
}

async function main() {
  logInfo("=== Atlas Protocol On-Chain Initialization ===");
  logInfo(`RPC: ${argv.rpc}`);

  // Load keypairs
  const deployer = loadKeypair(argv.deployer, "Deployer");
  const oracle1 = loadKeypair(argv.oracle1, "Oracle 1");
  const oracle2 = loadKeypair(argv.oracle2, "Oracle 2");
  const oracle3 = loadKeypair(argv.oracle3, "Oracle 3");

  logInfo(`Deployer: ${deployer.publicKey.toBase58()}`);
  logInfo(`Oracle 1: ${oracle1.publicKey.toBase58()}`);
  logInfo(`Oracle 2: ${oracle2.publicKey.toBase58()}`);
  logInfo(`Oracle 3: ${oracle3.publicKey.toBase58()}`);

  // Program IDs
  const STAKING_PID = new PublicKey(argv.staking);
  const REGISTRY_PID = new PublicKey(argv.registry);
  const VAULT_PID = new PublicKey(argv.vault);
  const TREASURY_PID = new PublicKey(argv.treasury);
  const GOVERNANCE_PID = new PublicKey(argv.governance);

  // Connection
  const connection = new Connection(argv.rpc, "confirmed");

  // Check deployer balance
  const balance = await connection.getBalance(deployer.publicKey);
  const sol = balance / 1e9;
  logInfo(`Deployer balance: ${sol.toFixed(4)} SOL`);
  if (sol < 0.5) {
    logWarning("Deployer has low SOL balance. You may need to airdrop.");
    logInfo("Run: solana airdrop 2 " + deployer.publicKey.toBase58());
  }

  // Load IDLs
  const idlDir = argv.idlDir;
  logInfo(`Using IDL directory: ${idlDir}`);

  function loadIDL(name) {
    const idlPath = path.join(idlDir, `${name}.json`);
    if (!fs.existsSync(idlPath)) {
      throw new Error(`IDL not found: ${idlPath}`);
    }
    return JSON.parse(fs.readFileSync(idlPath, "utf8"));
  }

  const provider = new AnchorProvider(
    connection,
    new Wallet(deployer),
    {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    },
  );

  function createProgram(idl, programId) {
    return new Program(idl, programId, provider);
  }

  // ============================================================================
  // STEP 1: Create Mints
  // ============================================================================

  logInfo("\n--- Step 1: Creating Token Mints ---");

  // Create BOND mint (used for manager registration bond)
  const bondMint = await createMint(
    connection,
    deployer,
    deployer.publicKey,
    deployer.publicKey,
    6, // 6 decimals
  );
  logSuccess(`Bond mint created: ${bondMint.toBase58()}`);

  // Create ATLAS mint (for governance voting)
  const atlasMint = await createMint(
    connection,
    deployer,
    deployer.publicKey,
    deployer.publicKey,
    6,
  );
  logSuccess(`ATLAS mint created: ${atlasMint.toBase58()}`);

  // Create revenue mint (for treasury revenue)
  const revenueMint = await createMint(
    connection,
    deployer,
    deployer.publicKey,
    deployer.publicKey,
    6,
  );
  logSuccess(`Revenue mint created: ${revenueMint.toBase58()}`);

  // ============================================================================
  // STEP 2: Initialize Staking Config
  // ============================================================================

  logInfo("\n--- Step 2: Initializing Staking Config ---");

  const [stakingConfigPDA] = findPDA([Buffer.from("atlas_staking_config")], STAKING_PID);

  const stakingIDL = loadIDL("atlas_staking");
  const stakingProgram = createProgram(stakingIDL, STAKING_PID);

  try {
    await stakingProgram.methods
      .initialize(VAULT_PID, bondMint)
      .accounts({
        config: stakingConfigPDA,
        deployer: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc({ skipPreflight: true });
    await connection.confirmTransaction(
      await connection.getLatestBlockhash().then((b) => b.signature),
    );
    logSuccess("Staking config initialized");
    logInfo(`  Vault Program: ${VAULT_PID.toBase58()}`);
    logInfo(`  Premium/Bond Mint: ${bondMint.toBase58()}`);
  } catch (error) {
    if (error.message.includes("already initialized") || error.message.includes("already in use")) {
      logInfo("Staking config already initialized (skipping)");
    } else {
      logError(`Failed to initialize staking config: ${error.message}`);
    }
  }

  // ============================================================================
  // STEP 3: Initialize Registry Config (manager-registry)
  // ============================================================================

  logInfo("\n--- Step 3: Initializing Registry Config ---");

  const [registryConfigPDA] = findPDA(
    [Buffer.from("atlas_registry_config")],
    REGISTRY_PID,
  );

  const registryIDL = loadIDL("atlas_manager_registry");
  const registryProgram = createProgram(registryIDL, REGISTRY_PID);

  // Registry Config parameters:
  // - oracle: oracle1 (who can submit manager scores on-chain)
  // - slash_authority: deployer (can slash managers for misconduct)
  // - bond_mint: bondMint (token used for manager registration bond)
  // - bond_amount: 100 * 1_000_000 = 100 tokens (6 decimals)
  // - score_threshold: 40 (managers scoring below this are auto-suspended)

  const BOND_AMOUNT = new BN(100 * 1_000_000); // 100 tokens

  try {
    await registryProgram.methods
      .initializeConfig({
        oracle: oracle1.publicKey,
        slashAuthority: deployer.publicKey,
        bondMint: bondMint,
        bondAmount: BOND_AMOUNT,
        scoreThreshold: 40,
      })
      .accounts({
        config: registryConfigPDA,
        governance: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc({ skipPreflight: true });
    await connection.confirmTransaction(
      await connection.getLatestBlockhash().then((b) => b.signature),
    );
    logSuccess("Registry config initialized");
    logInfo(`  Governance Authority: ${deployer.publicKey.toBase58()}`);
    logInfo(`  Score Oracle:         ${oracle1.publicKey.toBase58()}`);
    logInfo(`  Slash Authority:      ${deployer.publicKey.toBase58()}`);
    logInfo(`  Bond Mint:            ${bondMint.toBase58()}`);
    logInfo(`  Bond Amount:          100 tokens (${BOND_AMOUNT.toString()} base units)`);
    logInfo(`  Score Threshold:      40`);
  } catch (error) {
    if (error.message.includes("already initialized") || error.message.includes("already in use")) {
      logInfo("Registry config already initialized (updating with new values...)");
      try {
        await registryProgram.methods
          .updateConfig({
            oracle: oracle1.publicKey,
            slashAuthority: deployer.publicKey,
            bondMint: bondMint,
            bondAmount: BOND_AMOUNT,
            scoreThreshold: 40,
          })
          .accounts({
            config: registryConfigPDA,
            governance: deployer.publicKey,
          })
          .signers([deployer])
          .rpc({ skipPreflight: true });
        logSuccess("Registry config updated successfully");
      } catch (updateError) {
        logError(`Failed to update registry config: ${updateError.message}`);
      }
    } else {
      logError(`Failed to initialize registry config: ${error.message}`);
    }
  }

  // ============================================================================
  // STEP 4: Initialize Vault Config
  // ============================================================================

  logInfo("\n--- Step 4: Initializing Vault Config ---");

  const [vaultConfigPDA] = findPDA([Buffer.from("vault_config")], VAULT_PID);

  const vaultIDL = loadIDL("atlas_vault");
  const vaultProgram = createProgram(vaultIDL, VAULT_PID);

  // Vault Config parameters:
  // - oracles: [oracle1, oracle2, oracle3] (M-of-3 oracle set for NAV marks)
  // - min_oracle_signatures: 3 (all 3 must sign each NAV mark)
  // - risk_engine: deployer (for testing - in production this is the risk engine program)
  // - treasury: deployer (receives treasury share of fees)
  // - insurance: deployer (receives insurance share of fees)
  // - veatlas: deployer (receives veAtlas revenue share)
  // - reserve_target: 0 (no reserve target for testing)

  const ORACLE_SET = [oracle1.publicKey, oracle2.publicKey, oracle3.publicKey];

  try {
    await vaultProgram.methods
      .initializeConfig({
        oracles: ORACLE_SET,
        minOracleSignatures: 3,
        riskEngine: deployer.publicKey,
        treasury: deployer.publicKey,
        insurance: deployer.publicKey,
        veatlas: deployer.publicKey,
        reserveTarget: new BN(0),
      })
      .accounts({
        config: vaultConfigPDA,
        governance: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc({ skipPreflight: true });
    await connection.confirmTransaction(
      await connection.getLatestBlockhash().then((b) => b.signature),
    );
    logSuccess("Vault config initialized");
    logInfo(`  Governance Authority:    ${deployer.publicKey.toBase58()}`);
    logInfo(`  Oracle Set (M-of-N):     ${ORACLE_SET.length} of ${ORACLE_SET.length}`);
    logInfo(`    Oracle 1: ${oracle1.publicKey.toBase58()}`);
    logInfo(`    Oracle 2: ${oracle2.publicKey.toBase58()}`);
    logInfo(`    Oracle 3: ${oracle3.publicKey.toBase58()}`);
    logInfo(`  Min Oracle Signatures:   3`);
    logInfo(`  Risk Engine:             ${deployer.publicKey.toBase58()}`);
    logInfo(`  Treasury:                ${deployer.publicKey.toBase58()}`);
    logInfo(`  Insurance:               ${deployer.publicKey.toBase58()}`);
    logInfo(`  veAtlas:                 ${deployer.publicKey.toBase58()}`);
    logInfo(`  Reserve Target:          0`);
    logInfo(`  Fee Caps (defaults from state.rs):`);
    logInfo(`    Mgmt Fee Cap:          1500 bps (15%)`);
    logInfo(`    Perf Fee Cap:          2000 bps (20%)`);
    logInfo(`    Insurance Premium Cap: 300 bps (3%)`);
  } catch (error) {
    if (error.message.includes("already initialized") || error.message.includes("already in use")) {
      logInfo("Vault config already initialized (skipping)");
    } else {
      logError(`Failed to initialize vault config: ${error.message}`);
    }
  }

  // ============================================================================
  // STEP 5: Initialize Treasury Config
  // ============================================================================

  logInfo("\n--- Step 5: Initializing Treasury Config ---");

  const [treasuryConfigPDA] = findPDA([Buffer.from("atlas_treasury")], TREASURY_PID);

  const treasuryIDL = loadIDL("atlas_treasury");
  const treasuryProgram = createProgram(treasuryIDL, TREASURY_PID);

  // Create deployer's associated token account for revenue mint
  const deployerRevenueToken = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    revenueMint,
    deployer.publicKey,
  );

  // Treasury Config parameters:
  // - intrinsic_price_bps: 10_000 (1:1 intrinsic price for ATLAS)
  // - oracles: [oracle1, oracle2, oracle3] (price attestation oracles)
  // - min_oracle_signatures: 3
  // - revenue_mint: revenueMint
  // - atlas_mint: atlasMint

  const [treasuryRevenueEscrowPDA] = findPDA(
    [Buffer.from("revenue_escrow"), treasuryConfigPDA.toBuffer()],
    TREASURY_PID,
  );

  try {
    await treasuryProgram.methods
      .initialize(
        new BN(10_000), // intrinsic_price_bps = 100%
        ORACLE_SET,
        3, // min_oracle_signatures
      )
      .accounts({
        config: treasuryConfigPDA,
        revenueEscrow: treasuryRevenueEscrowPDA,
        revenueMint: revenueMint,
        atlasMint: atlasMint,
        deployer: deployer.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([deployer])
      .rpc({ skipPreflight: true });
    await connection.confirmTransaction(
      await connection.getLatestBlockhash().then((b) => b.signature),
    );
    logSuccess("Treasury config initialized");
    logInfo(`  Governance:          ${deployer.publicKey.toBase58()}`);
    logInfo(`  Buyback Authority:   ${deployer.publicKey.toBase58()}`);
    logInfo(`  Oracles (M-of-N):    ${ORACLE_SET.length} of ${ORACLE_SET.length}`);
    logInfo(`  Intrinsic Price:     10,000 bps (1:1)`);
    logInfo(`  Revenue Mint:        ${revenueMint.toBase58()}`);
    logInfo(`  ATLAS Mint:          ${atlasMint.toBase58()}`);
  } catch (error) {
    if (error.message.includes("already initialized") || error.message.includes("already in use")) {
      logInfo("Treasury config already initialized (skipping)");
    } else {
      logError(`Failed to initialize treasury: ${error.message}`);
    }
  }

  // ============================================================================
  // STEP 6: Initialize Governance Config
  // ============================================================================

  logInfo("\n--- Step 6: Initializing Governance Config ---");

  const [governanceConfigPDA] = findPDA(
    [Buffer.from("atlas_governance")],
    GOVERNANCE_PID,
  );

  const governanceIDL = loadIDL("atlas_governance");
  const governanceProgram = createProgram(governanceIDL, GOVERNANCE_PID);

  // Mint ATLAS tokens to deployer for governance testing
  const deployerAtlasToken = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    atlasMint,
    deployer.publicKey,
  );

  try {
    await mintTo(
      connection,
      deployer,
      atlasMint,
      deployerAtlasToken.address,
      deployer.publicKey,
      new BN(1_000_000_000_000), // 1,000,000 ATLAS tokens (6 decimals)
    );
    logInfo(`Minted 1,000,000 ATLAS tokens to ${deployer.publicKey.toBase58()}`);
  } catch (error) {
    logError(`Failed to mint ATLAS tokens: ${error.message}`);
  }

  try {
    await governanceProgram.methods
      .initialize()
      .accounts({
        config: governanceConfigPDA,
        atlasMint: atlasMint,
        deployer: deployer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc({ skipPreflight: true });
    await connection.confirmTransaction(
      await connection.getLatestBlockhash().then((b) => b.signature),
    );
    logSuccess("Governance config initialized");
    logInfo(`  Governance:  ${deployer.publicKey.toBase58()}`);
    logInfo(`  ATLAS Mint:  ${atlasMint.toBase58()}`);
  } catch (error) {
    if (error.message.includes("already initialized") || error.message.includes("already in use")) {
      logInfo("Governance config already initialized (skipping)");
    } else {
      logError(`Failed to initialize governance: ${error.message}`);
    }
  }

  // ============================================================================
  // STEP 7: Output Summary
  // ============================================================================

  logInfo("\n" + "=".repeat(60));
  logSuccess("=== Initialization Complete ===");
  logInfo("=".repeat(60));

  const summary = {
    rpcUrl: argv.rpc,
    deployer: deployer.publicKey.toBase58(),
    programs: {
      vault: VAULT_PID.toBase58(),
      registry: REGISTRY_PID.toBase58(),
      staking: STAKING_PID.toBase58(),
      governance: GOVERNANCE_PID.toBase58(),
      treasury: TREASURY_PID.toBase58(),
    },
    pdas: {
      registryConfig: registryConfigPDA.toBase58(),
      vaultConfig: vaultConfigPDA.toBase58(),
      stakingConfig: stakingConfigPDA.toBase58(),
      treasuryConfig: treasuryConfigPDA.toBase58(),
      governanceConfig: governanceConfigPDA.toBase58(),
    },
    mints: {
      bond: bondMint.toBase58(),
      atlas: atlasMint.toBase58(),
      revenue: revenueMint.toBase58(),
    },
    oracles: [
      { keypair: argv.oracle1, pubkey: oracle1.publicKey.toBase58() },
      { keypair: argv.oracle2, pubkey: oracle2.publicKey.toBase58() },
      { keypair: argv.oracle3, pubkey: oracle3.publicKey.toBase58() },
    ],
    config: {
      bondAmount: BOND_AMOUNT.toString(),
      scoreThreshold: 40,
      minOracleSignatures: 3,
      reserveTarget: "0",
    },
  };

  console.log(`
${colors.success}On-Chain Configuration Summary:${colors.reset}

${colors.info}Program Addresses:${colors.reset}
  Vault:            ${VAULT_PID.toBase58()}
  Manager Registry: ${REGISTRY_PID.toBase58()}
  Staking:          ${STAKING_PID.toBase58()}
  Governance:       ${GOVERNANCE_PID.toBase58()}
  Treasury:         ${TREASURY_PID.toBase58()}

${colors.info}PDAs:${colors.reset}
  Registry Config:  ${registryConfigPDA.toBase58()}
  Vault Config:     ${vaultConfigPDA.toBase58()}
  Staking Config:   ${stakingConfigPDA.toBase58()}
  Treasury Config:  ${treasuryConfigPDA.toBase58()}
  Governance Config:${governanceConfigPDA.toBase58()}

${colors.info}Mints:${colors.reset}
  Bond Mint:  ${bondMint.toBase58()}
  ATLAS Mint: ${atlasMint.toBase58()}
  Revenue Mint: ${revenueMint.toBase58()}

${colors.info}Oracles:${colors.reset}
  Oracle 1: ${oracle1.publicKey.toBase58()}
  Oracle 2: ${oracle2.publicKey.toBase58()}
  Oracle 3: ${oracle3.publicKey.toBase58()}

${colors.info}Configuration:${colors.reset}
  Governance Authority:   ${deployer.publicKey.toBase58()}
  Score Oracle:           ${oracle1.publicKey.toBase58()}
  Slash Authority:        ${deployer.publicKey.toBase58()}
  Bond Amount:            100 tokens (${BOND_AMOUNT.toString()} base units)
  Score Threshold:        40
  Min Oracle Signatures:  3
  Reserve Target:         0

${colors.warning}NEXT STEPS:${colors.reset}
  1. Update your .env file:
     ATLAS_REGISTRY_PROGRAM_ID=${REGISTRY_PID.toBase58()}

  2. Update frontend env (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_RPC_URL)

  3. Fund oracle wallets with devnet SOL:
     solana airdrop 1 ${oracle1.publicKey.toBase58()} --url https://api.devnet.solana.com
     solana airdrop 1 ${oracle2.publicKey.toBase58()} --url https://api.devnet.solana.com
     solana airdrop 1 ${oracle3.publicKey.toBase58()} --url https://api.devnet.solana.com

  4. Mint bond tokens to a manager wallet:
     spl-token mint ${bondMint.toBase58()} 100 <manager-token-account> --allow-offline

  5. Register a manager on-chain:
     # Use the manager-registry 'register' instruction with the manager's identity

  6. Set up Helius webhook (optional, for indexing):
     - Create Helius project at helius.io
     - Set webhook URL to: https://your-backend.com/webhooks/helius
     - Add HELIUS_API_KEY to your backend env
`);

  // Save config file
  const configPath = path.resolve(__dirname, "devnet-config.json");
  fs.writeFileSync(configPath, JSON.stringify(summary, null, 2));
  logInfo(`Config saved to: ${configPath}`);
}

main().catch((error) => {
  logError(`Deployment failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
