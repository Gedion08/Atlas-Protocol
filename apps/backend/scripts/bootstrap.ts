#!/usr/bin/env node
/**
 * Devnet bootstrap for the on-chain vault (Phase 4).
 *
 * Runs the full registry + vault initialization against the deployed devnet
 * programs and writes `deploy/bootstrap-state.json`, which the backend then
 * merges into its seed so the API lists the on-chain vault.
 *
 *   pnpm --filter atlas-backend bootstrap:devnet
 *
 * Steps (idempotent; each is skipped when the target account exists):
 *   1. Fresh base mint (vault deposit token) + bond mint owned by the deployer.
 *   2. Registry config: oracle set, slash authority, bond mint/amount, threshold.
 *   3. Register the manager on-chain (first locks the ATLAS bond via staking `bond`,
 *      then `register` verifies the pre-existing bond).
 *   4. Vault config: M-of-N oracles, risk engine, treasury, insurance, veAtlas.
 *   5. Vault initialize: shares mint + escrow, fees, min deposit.
 *   6. update_config: fast settlement window for the E2E.
 *   7. Mint base tokens to the investor wallet for the E2E deposit.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  buildInitializeConfigInstruction as buildVaultInitializeConfig,
  buildInitializeInstruction,
  buildUpdateConfigInstruction,
  escrowPda,
  sharesMintPda,
  vaultConfigPda,
  vaultPda,
} from "../src/services/vault/solana.js";
import {
  buildRegisterManagerInstruction,
  buildRegistryInitializeConfigInstruction,
  managerProfilePda,
  registryConfigPda,
} from "../src/services/registry/solana.js";
import {
  bondPda as stakingBondPda,
  bondEscrowPda as stakingBondEscrowPda,
  buildBondInstruction,
} from "../src/services/staking/solana.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const deployDir = resolve(ROOT, "deploy");
const keysDir = resolve(deployDir, "bootstrap-keys");

function loadKeypair(filePath: string): Keypair {
  if (!existsSync(filePath)) throw new Error(`keypair not found: ${filePath}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(filePath, "utf8"))));
}

function loadOrCreateKeypair(filePath: string, label: string): Keypair {
  if (existsSync(filePath)) return loadKeypair(filePath);
  mkdirSync(keysDir, { recursive: true });
  const kp = Keypair.generate();
  writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`[INFO] created ${label}: ${kp.publicKey.toBase58()}`);
  return kp;
}

const DEVNET_CONFIG_PATH = resolve(deployDir, "devnet-config.json");

interface DevnetConfig {
  rpcUrl: string;
  deployer: string;
  programs: { vault: string; registry: string; staking: string };
  oracles: { pubkey: string }[];
  config: { bondAmount: string; scoreThreshold: number; minOracleSignatures: number };
}

function loadDevnetConfig(): DevnetConfig {
  return JSON.parse(readFileSync(DEVNET_CONFIG_PATH, "utf8")) as DevnetConfig;
}

const log = (msg: string): void => console.log(`[INFO] ${msg}`);
const ok = (msg: string): void => console.log(`[ OK ] ${msg}`);

async function main(): Promise<void> {
  const config = loadDevnetConfig();
  const rpcUrl = process.env.RPC_URL ?? config.rpcUrl;
  const connection = new Connection(rpcUrl, "confirmed");

  const deployer = loadKeypair(resolve(deployDir, "deployer.json"));
  const manager = loadOrCreateKeypair(resolve(keysDir, "manager.json"), "manager keypair");
  const investor = loadOrCreateKeypair(resolve(keysDir, "investor.json"), "investor keypair");

  const vaultProgramId = new PublicKey(config.programs.vault);
  const registryProgramId = new PublicKey(config.programs.registry);
  const stakingProgramId = new PublicKey(config.programs.staking);
  const oracles = config.oracles.map((o) => new PublicKey(o.pubkey));

  const balance = await connection.getBalance(deployer.publicKey);
  log(`deployer=${deployer.publicKey.toBase58()} balance=${(balance / 1e9).toFixed(3)} SOL`);
  if (balance < 1e9) throw new Error("deployer needs at least 1 SOL");

  const send = async (
    instructions: TransactionInstruction[],
    payer: Keypair,
    signers: Keypair[],
    label: string,
  ): Promise<string> => {
    const bh = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.add(...instructions);
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer, ...signers);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const result = await connection.confirmTransaction(
      { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed",
    );
    if (result.value.err) throw new Error(`${label} failed: ${JSON.stringify(result.value.err)} (${sig})`);
    ok(`${label} ${sig}`);
    return sig;
  };

  const ensureFunded = async (kp: Keypair, label: string): Promise<void> => {
    const bal = await connection.getBalance(kp.publicKey);
    if (bal > 10_000_000) return; // >= 0.01 SOL
    try {
      await connection.requestAirdrop(kp.publicKey, 2e9);
      log(`airdropped 2 SOL to ${label} ${kp.publicKey.toBase58()}`);
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      await send(
        [
          SystemProgram.transfer({
            fromPubkey: deployer.publicKey,
            toPubkey: kp.publicKey,
            lamports: 5e8,
          }),
        ],
        deployer,
        [],
        `fund ${label} from deployer`,
      );
    }
  };

  // -- 1. fresh mints owned by the deployer (persisted across re-runs) ------
  const mintsPath = resolve(keysDir, "mints.json");
  let bondMint: PublicKey;
  let baseMint: PublicKey;
  if (existsSync(mintsPath)) {
    const saved = JSON.parse(readFileSync(mintsPath, "utf8")) as {
      bondMint: string;
      baseMint: string;
    };
    bondMint = new PublicKey(saved.bondMint);
    baseMint = new PublicKey(saved.baseMint);
    ok(`reusing bond mint ${bondMint.toBase58()}`);
    ok(`reusing base mint ${baseMint.toBase58()}`);
  } else {
    bondMint = await createMint(connection, deployer, deployer.publicKey, deployer.publicKey, 6);
    ok(`bond mint: ${bondMint.toBase58()}`);
    baseMint = await createMint(connection, deployer, deployer.publicKey, deployer.publicKey, 6);
    ok(`base mint: ${baseMint.toBase58()}`);
    writeFileSync(
      mintsPath,
      JSON.stringify({ bondMint: bondMint.toBase58(), baseMint: baseMint.toBase58() }, null, 2),
    );
  }

  // -- PDAs ----------------------------------------------------------------
  const [registryConfigPdaKey] = registryConfigPda(registryProgramId);
  const [profilePda] = managerProfilePda(manager.publicKey, registryProgramId);
  // The bond/escrow live in the staking program's domain: created by
  // `atlas_staking::bond` at staking-derived PDAs, verified by `register`.
  const [bondPdaKey] = stakingBondPda(manager.publicKey);
  const [bondEscrowPdaKey] = stakingBondEscrowPda(bondPdaKey);
  const [vaultConfigPdaKey] = vaultConfigPda(vaultProgramId);
  const [vaultPdaKey] = vaultPda(deployer.publicKey, baseMint);
  const [sharesMintPdaKey] = sharesMintPda(vaultPdaKey, vaultProgramId);
  const [vaultEscrowPdaKey] = escrowPda(vaultPdaKey, baseMint, vaultProgramId);

  const accountInfo = (k: PublicKey) => connection.getAccountInfo(k);

  // -- 2. registry config --------------------------------------------------
  if (!(await accountInfo(registryConfigPdaKey))) {
    await send(
      [
        buildRegistryInitializeConfigInstruction({
          programId: registryProgramId,
          accounts: { config: registryConfigPdaKey, governance: deployer.publicKey },
          oracle: oracles[0],
          slashAuthority: deployer.publicKey,
          bondMint,
          bondAmount: BigInt(config.config.bondAmount),
          scoreThreshold: config.config.scoreThreshold,
        }),
      ],
      deployer,
      [],
      "registry initialize_config",
    );
  } else {
    ok("registry config already initialized (skip)");
  }

  // -- 3. register manager (requires a staking bond) -----------------------
  if (!(await accountInfo(profilePda))) {
    await ensureFunded(manager, "manager");
    const managerToken = await getOrCreateAssociatedTokenAccount(
      connection, manager, bondMint, manager.publicKey,
    );
    await mintTo(
      connection, deployer, bondMint, managerToken.address, deployer.publicKey,
      1_000_000_000n,
    );
    ok(`minted 1000 bond tokens to manager`);
    // 3a. lock the bond via `atlas_staking::bond` (creates bond + escrow).
    if (!(await accountInfo(bondPdaKey))) {
      await send(
        [
          buildBondInstruction({
            owner: manager.publicKey,
            bondMint,
            ownerToken: managerToken.address,
            amount: BigInt(config.config.bondAmount),
            programId: stakingProgramId,
          }),
        ],
        manager,
        [],
        "staking bond",
      );
    } else {
      ok("staking bond already created (skip)");
    }
    // 3b. register the manager against the pre-existing bond.
    await send(
      [
        buildRegisterManagerInstruction({
          programId: registryProgramId,
          accounts: {
            config: registryConfigPdaKey,
            profile: profilePda,
            bond: bondPdaKey,
            bondEscrow: bondEscrowPdaKey,
            bondMint,
            owner: manager.publicKey,
          },
          name: "Atlas Onchain",
        }),
      ],
      manager,
      [],
      "registry register",
    );
  } else {
    ok("manager already registered (skip)");
  }

  // -- 4. vault config -----------------------------------------------------
  if (!(await accountInfo(vaultConfigPdaKey))) {
    await send(
      [
        buildVaultInitializeConfig({
          programId: vaultProgramId,
          accounts: { config: vaultConfigPdaKey, governance: deployer.publicKey },
          oracles,
          minOracleSignatures: config.config.minOracleSignatures,
          riskEngine: deployer.publicKey,
          treasury: deployer.publicKey,
          insurance: deployer.publicKey,
          veatlas: deployer.publicKey,
          reserveTarget: 0n,
        }),
      ],
      deployer,
      [],
      "vault initialize_config",
    );
  } else {
    ok("vault config already initialized (skip)");
  }

  // -- 5. vault initialize -------------------------------------------------
  if (!(await accountInfo(vaultPdaKey))) {
    await send(
      [
        buildInitializeInstruction({
          programId: vaultProgramId,
          accounts: {
            vault: vaultPdaKey,
            sharesMint: sharesMintPdaKey,
            vaultEscrow: vaultEscrowPdaKey,
            config: vaultConfigPdaKey,
            managerProfile: profilePda,
            baseMint,
            authority: deployer.publicKey,
          },
          manager: manager.publicKey,
          managementFeeBps: 200,
          performanceFeeBps: 1000,
          insurancePremiumBps: 10,
          minDeposit: 1_000_000n,
        }),
      ],
      deployer,
      [],
      "vault initialize",
    );
  } else {
    ok("vault already initialized (skip)");
  }

  // -- 6. fast settlement window ------------------------------------------
  await send(
    [
      buildUpdateConfigInstruction({
        programId: vaultProgramId,
        accounts: { config: vaultConfigPdaKey, governance: deployer.publicKey },
        input: { settlementSlots: 60 },
      }),
    ],
    deployer,
    [],
    "vault update_config (settlement_slots=60)",
  );

  // -- 7. fund investor for the E2E deposit --------------------------------
  await ensureFunded(investor, "investor");
  const investorToken = await getOrCreateAssociatedTokenAccount(
    connection, investor, baseMint, investor.publicKey,
  );
  await mintTo(connection, deployer, baseMint, investorToken.address, deployer.publicKey, 100_000_000n);
  ok(`minted 100 base tokens to investor ${investor.publicKey.toBase58()}`);

  // -- 8. write bootstrap state --------------------------------------------
  const state = {
    generatedAt: Date.now(),
    rpcUrl,
    deployer: deployer.publicKey.toBase58(),
    manager: {
      owner: manager.publicKey.toBase58(),
      name: "Atlas Onchain",
      profilePda: profilePda.toBase58(),
      bondPda: bondPdaKey.toBase58(),
    },
    vault: {
      address: vaultPdaKey.toBase58(),
      name: "Atlas Onchain",
      baseAsset: "ATLAS",
      authority: deployer.publicKey.toBase58(),
      managerProfile: profilePda.toBase58(),
      baseMint: baseMint.toBase58(),
      escrowPda: vaultEscrowPdaKey.toBase58(),
      sharesMint: sharesMintPdaKey.toBase58(),
      programId: vaultProgramId.toBase58(),
      decimals: 6,
      managementFeeBps: 200,
      performanceFeeBps: 1000,
      minDeposit: 1_000_000,
    },
  };
  writeFileSync(resolve(deployDir, "bootstrap-state.json"), JSON.stringify(state, null, 2));
  ok(`wrote deploy/bootstrap-state.json`);
  ok(`vault: ${vaultPdaKey.toBase58()}`);
  log(`next: pnpm --filter atlas-backend e2e:devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
