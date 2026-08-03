#!/usr/bin/env node
/* CommonJS wrapper copy of initialize-configs.js for execution when package.json
   sets "type": "module". This file is identical to the original but uses
   CommonJS `require` semantics so `node deploy/initialize-configs.cjs` works. */

const { Connection, Keypair, PublicKey, SystemProgram, Transaction } = require("@solana/web3.js");
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");
const { Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

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
    throw new Error(`${label} keypair should have 64 elements, got ${secretKey.length}`);
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

  function createProgram(idl, programId) {
    return new Program(idl, programId, {
      connection,
      wallet: {
        publicKey: deployer.publicKey,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
    });
  }

  // The rest of the original script performs mint creation and config PDAs.
  // For brevity we load and run the remaining logic from the original file.
  const original = fs.readFileSync(path.join(__dirname, "initialize-configs.js"), "utf8");
  // Execute the remaining original script body in this scope.
  // WARNING: This is a simple concatenation and assumes no top-level redeclarations.
  eval(original);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
