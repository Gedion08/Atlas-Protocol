#!/usr/bin/env node
/**
 * Live devnet E2E for the on-chain vault (Phase 4).
 *
 * Runs a full deposit -> request_withdraw -> settle_withdraw cycle against the
 * vault bootstrapped by `scripts/bootstrap.ts`, asserting chain state after
 * each step. Optionally verifies the backend API when `ATLAS_API_URL` is set.
 *
 *   pnpm --filter atlas-backend e2e:devnet
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildAtaCreationInstruction,
  buildDepositInstruction,
  buildRequestWithdrawInstruction,
  buildSettleWithdrawInstruction,
  decodeVaultAccount,
  decodeWithdrawalRequest,
  escrowPda,
  fetchUserPosition,
  sharesMintPda,
  vaultConfigPda,
  vaultPda,
  withdrawRequestPda,
} from "../src/services/vault/solana.js";
import type { BootstrapState } from "../src/db/bootstrap-state.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const statePath = resolve(ROOT, "deploy", "bootstrap-state.json");

function loadKeypair(filePath: string): Keypair {
  if (!existsSync(filePath)) throw new Error(`keypair not found: ${filePath}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(filePath, "utf8"))));
}

const log = (msg: string): void => console.log(`[INFO] ${msg}`);
const ok = (msg: string): void => console.log(`[ OK ] ${msg}`);

async function main(): Promise<void> {
  if (!existsSync(statePath)) {
    throw new Error("deploy/bootstrap-state.json missing; run `pnpm --filter atlas-backend bootstrap:devnet` first");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8")) as BootstrapState;
  const connection = new Connection(state.rpcUrl, "confirmed");
  const programId = new PublicKey(state.vault.programId);

  const deployer = loadKeypair(resolve(ROOT, "deploy", "deployer.json"));
  const investor = loadKeypair(resolve(ROOT, "deploy", "bootstrap-keys", "investor.json"));

  const [config] = vaultConfigPda(programId);
  const [vault] = vaultPda(new PublicKey(state.vault.authority), new PublicKey(state.vault.baseMint), programId);
  const [sharesMint] = sharesMintPda(vault, programId);
  const [escrow] = escrowPda(vault, new PublicKey(state.vault.baseMint), programId);
  const [requestPda] = withdrawRequestPda(vault, investor.publicKey, programId);

  const baseMint = new PublicKey(state.vault.baseMint);
  const meta = {
    programId: state.vault.programId,
    vaultPda: state.vault.address,
    authority: state.vault.authority,
    managerProfile: state.vault.managerProfile,
    baseMint: state.vault.baseMint,
    escrowPda: state.vault.escrowPda,
    sharesMint: state.vault.sharesMint,
    decimals: 6,
  };

  const userToken = getAssociatedTokenAddressSync(baseMint, investor.publicKey);
  const userShares = getAssociatedTokenAddressSync(sharesMint, investor.publicKey);

  const balance = async (ata: PublicKey): Promise<bigint> => {
    try {
      const res = await connection.getTokenAccountBalance(ata);
      return BigInt(res.value.amount);
    } catch {
      return 0n;
    }
  };

  const send = async (instructions: TransactionInstruction[], label: string): Promise<void> => {
    const bh = await connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.add(...instructions);
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = investor.publicKey;
    tx.sign(investor);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    const result = await connection.confirmTransaction(
      { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed",
    );
    if (result.value.err) throw new Error(`${label} failed: ${JSON.stringify(result.value.err)} (${sig})`);
    ok(`${label} ${sig}`);
  };

  // -- A. deposit -----------------------------------------------------------
  const baseBefore = await balance(userToken);
  log(`base before: ${baseBefore}  vault=${vault.toBase58()}`);

  const depositAmount = 5_000_000n; // 5 base tokens
  const createAtas: TransactionInstruction[] = [];
  if (await balance(userToken) === 0n) {
    createAtas.push(buildAtaCreationInstruction({
      payer: investor.publicKey, mint: baseMint, owner: investor.publicKey,
    }));
  }
  if (await balance(userShares) === 0n) {
    createAtas.push(buildAtaCreationInstruction({
      payer: investor.publicKey, mint: sharesMint, owner: investor.publicKey,
    }));
  }
  await send(
    [
      ...createAtas,
      buildDepositInstruction({
        programId,
        accounts: {
          config,
          vault,
          managerProfile: new PublicKey(state.vault.managerProfile),
          user: investor.publicKey,
          userToken,
          vaultEscrow: escrow,
          sharesMint,
          userShares,
        },
        amount: depositAmount,
      }),
    ],
    "deposit",
  );

  const baseAfter = await balance(userToken);
  const sharesAfter = await balance(userShares);
  ok(`base ${baseBefore} -> ${baseAfter}; shares=${sharesAfter}`);
  if (baseAfter !== baseBefore - depositAmount) throw new Error("deposit base delta mismatch");
  if (sharesAfter === 0n) throw new Error("no shares issued");

  let vaultState = decodeVaultAccount((await connection.getAccountInfo(vault))!.data);
  ok(`vault tvl=${vaultState.totalValue} shares=${vaultState.sharesOutstanding}`);
  if (vaultState.totalValue !== Number(depositAmount)) throw new Error("vault total_value mismatch");

  const posAfterDeposit = await fetchUserPosition(connection, meta, investor.publicKey);
  if (!posAfterDeposit || posAfterDeposit.shares === 0) throw new Error("position not visible after deposit");

  // -- B. request_withdraw --------------------------------------------------
  await send(
    [
      buildRequestWithdrawInstruction({
        programId,
        accounts: {
          config,
          vault,
          request: requestPda,
          user: investor.publicKey,
          userShares,
          sharesMint,
        },
        shares: posAfterDeposit.shares,
      }),
    ],
    "request_withdraw",
  );

  const reqInfo = await connection.getAccountInfo(requestPda);
  if (!reqInfo) throw new Error("withdrawal request account missing");
  const req = decodeWithdrawalRequest(reqInfo.data);
  const currentSlot = await connection.getSlot();
  ok(`requested ${req.shares} shares, settlement slot ${req.settlementSlot} (now ${currentSlot})`);
  if (req.settled) throw new Error("request already settled");

  // -- C. wait for settlement window then settle ----------------------------
  while (await connection.getSlot() < req.settlementSlot) {
    await new Promise((r) => setTimeout(r, 5000));
  }
  ok(`settlement window reached`);

  await send(
    [
      buildSettleWithdrawInstruction({
        programId,
        accounts: {
          config,
          vault,
          request: requestPda,
          user: investor.publicKey,
          vaultEscrow: escrow,
          userToken,
          userShares,
          sharesMint,
        },
      }),
    ],
    "settle_withdraw",
  );

  const baseFinal = await balance(userToken);
  const sharesFinal = await balance(userShares);
  vaultState = decodeVaultAccount((await connection.getAccountInfo(vault))!.data);
  ok(`base ${baseAfter} -> ${baseFinal}; shares ${sharesAfter} -> ${sharesFinal}; vault tvl=${vaultState.totalValue}`);
  if (baseFinal !== baseBefore) throw new Error("settled payout did not restore the balance");
  if (sharesFinal !== 0n) throw new Error("shares were not burned");

  // -- D. optional API verification -----------------------------------------
  const apiUrl = process.env.ATLAS_API_URL;
  if (apiUrl) {
    const res = await fetch(`${apiUrl}/api/v1/vaults/${state.vault.address}`);
    if (!res.ok) throw new Error(`GET /vaults/${state.vault.address} -> ${res.status}`);
    const { data } = (await res.json()) as { data: Record<string, unknown> };
    ok(`API vault: name=${String(data.name)} onchain=${JSON.stringify(data.onchain) !== "undefined"}`);
    if (!data.onchain) throw new Error("API vault missing onchain metadata");
  } else {
    log("ATLAS_API_URL not set; skipping API verification");
  }

  ok("E2E PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
