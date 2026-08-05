import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { OnchainVaultMeta } from "atlas-types";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";
import { VaultClient } from "../src/services/vault/index.js";
import {
  DEPOSIT_DISCRIMINATOR,
  REQUEST_WITHDRAW_DISCRIMINATOR,
  SETTLE_WITHDRAW_DISCRIMINATOR,
  VAULT_PROGRAM_ID,
  escrowPda,
  sharesMintPda,
  vaultPda,
  withdrawRequestPda,
} from "../src/services/vault/solana.js";

const authority = Keypair.generate();
const baseMint = Keypair.generate();
const managerProfile = Keypair.generate();
const investor = Keypair.fromSeed(
  createHash("sha256").update("atlas-onchain-investor").digest(),
);

const BLOCKHASH = "11111111111111111111111111111111";

function putU64(buf: Buffer, offset: number, value: number | bigint): void {
  buf.writeBigUInt64LE(BigInt(value), offset);
}

function putPubkey(buf: Buffer, offset: number, key: PublicKey): void {
  key.toBuffer().copy(buf, offset);
}

/** 297-byte on-chain Vault account with totalValue=50k tokens, 25k shares. */
function buildVaultAccount(): Buffer {
  const [vault] = vaultPda(authority.publicKey, baseMint.publicKey);
  const [sharesMint] = sharesMintPda(vault);
  const buf = Buffer.alloc(297);
  putPubkey(buf, 8, authority.publicKey);
  putPubkey(buf, 40, authority.publicKey);
  putPubkey(buf, 72, managerProfile.publicKey);
  putPubkey(buf, 104, sharesMint);
  putPubkey(buf, 136, baseMint.publicKey);
  buf[169] = 0; // Active
  putU64(buf, 176, 10_000); // minDeposit base units
  putU64(buf, 184, 50_000_000_000); // totalValue (50k * 1e6)
  putU64(buf, 192, 25_000_000_000); // sharesOutstanding (25k * 1e9)
  putU64(buf, 248, Math.floor(Date.now() / 1000)); // lastAccrualTs
  putU64(buf, 272, Math.floor(Date.now() / 1000)); // createdAt
  return buf;
}

/** 98-byte WithdrawalRequest account with 1k shares pending. */
function buildRequestAccount(vault: PublicKey, user: PublicKey): Buffer {
  const buf = Buffer.alloc(98);
  putPubkey(buf, 8, vault);
  putPubkey(buf, 40, user);
  putU64(buf, 72, 1_000);
  putU64(buf, 80, 0);
  putU64(buf, 88, 1_000_000);
  buf[96] = 0; // not settled
  buf[97] = 1;
  return buf;
}

function buildMeta(): OnchainVaultMeta {
  const [vault] = vaultPda(authority.publicKey, baseMint.publicKey);
  const [sharesMint] = sharesMintPda(vault);
  const [escrow] = escrowPda(vault, baseMint.publicKey);
  return {
    programId: VAULT_PROGRAM_ID.toBase58(),
    vaultPda: vault.toBase58(),
    authority: authority.publicKey.toBase58(),
    managerProfile: managerProfile.publicKey.toBase58(),
    baseMint: baseMint.publicKey.toBase58(),
    escrowPda: escrow.toBase58(),
    sharesMint: sharesMint.toBase58(),
    decimals: 6,
  };
}

const vaultAccount = buildVaultAccount();
const meta = buildMeta();
const [vaultPdaPubkey] = vaultPda(authority.publicKey, baseMint.publicKey);
const [sharesMintPubkey] = sharesMintPda(vaultPdaPubkey);
const [requestPdaPubkey] = withdrawRequestPda(vaultPdaPubkey, investor.publicKey);

function mockConnection(): Connection {
  return {
    getLatestBlockhash: async () => ({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1_000_000,
    }),
    getSlot: async () => 2_000_000,
    getAccountInfo: async (key: PublicKey) => {
      if (key.equals(vaultPdaPubkey)) return { data: vaultAccount, owner: VAULT_PROGRAM_ID } as never;
      if (key.equals(requestPdaPubkey))
        return { data: buildRequestAccount(vaultPdaPubkey, investor.publicKey), owner: VAULT_PROGRAM_ID } as never;
      return null;
    },
    getTokenAccountBalance: async (key: PublicKey) => {
      const shares = key.equals(
        await getAta(sharesMintPubkey, investor.publicKey),
      );
      return {
        value: {
          amount: shares ? "1000000" : "0",
          decimals: 9,
          uiAmount: shares ? 1 : 0,
        },
      } as never;
    },
  } as unknown as Connection;
}

import { getAssociatedTokenAddress } from "@solana/spl-token";
const getAta = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddress(mint, owner, true);

describe("on-chain vault routes", () => {
  let app: FastifyInstance;
  let onchainVaultAddress: string;
  let demoVaultAddress: string;

  beforeAll(async () => {
    const repositories = createMemoryRepositories();
    const vaults = await repositories.vaults.list();
    onchainVaultAddress = vaults[0].address;
    demoVaultAddress = vaults[1].address;
    await repositories.vaults.update({ ...vaults[0], onchain: meta });

    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", REPOSITORY_DRIVER: "memory" }),
      repositories,
      logger: false,
      vaultClient: new VaultClient(mockConnection(), VAULT_PROGRAM_ID),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("enriches on-chain vaults in the list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/vaults" });
    expect(res.statusCode).toBe(200);
    const vault = res.json().data.find((v: { address: string }) => v.address === onchainVaultAddress);
    expect(vault.tvl).toBe(50_000_000_000);
    expect(vault.sharesOutstanding).toBe(25_000_000_000);
    expect(vault.sharePrice).toBe(2);
    expect(vault.minDeposit).toBe(0.01);
  });

  it("serves on-chain pricing net of accrued fees", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/vaults/${onchainVaultAddress}/pricing`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.sharePrice).toBe(2);
    expect(res.json().data.sharesOutstanding).toBe(25_000_000_000);
  });

  it("rejects the build endpoint without an owner header", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${onchainVaultAddress}/invest/build`,
      payload: { action: "deposit", amount: 1_000_000 },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("unauthorized");
  });

  it("builds a deposit transaction (ATA creation + deposit instruction)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${onchainVaultAddress}/invest/build`,
      headers: { "x-atlas-owner": investor.publicKey.toBase58() },
      payload: { action: "deposit", amount: 1_000_000 },
    });
    expect(res.statusCode).toBe(200);
    const { transaction, blockhash, ataAccounts } = res.json().data;
    expect(blockhash).toBe(BLOCKHASH);
    expect(ataAccounts.length).toBe(2);
    const tx = Transaction.from(Buffer.from(transaction, "base64"));
    expect(tx.feePayer?.toBase58()).toBe(investor.publicKey.toBase58());
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    const deposit = tx.instructions.find((i) => i.data.subarray(0, 8).equals(DEPOSIT_DISCRIMINATOR));
    expect(deposit).toBeDefined();
    expect(tx.instructions.length).toBe(3);
  });

  it("builds a request_withdraw transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${onchainVaultAddress}/invest/build`,
      headers: { "x-atlas-owner": investor.publicKey.toBase58() },
      payload: { action: "request_withdraw", shares: 1_000 },
    });
    expect(res.statusCode).toBe(200);
    const { transaction, ataAccounts } = res.json().data;
    expect(ataAccounts.length).toBe(1);
    const tx = Transaction.from(Buffer.from(transaction, "base64"));
    expect(tx.instructions.find((i) => i.data.subarray(0, 8).equals(REQUEST_WITHDRAW_DISCRIMINATOR))).toBeDefined();
  });

  it("builds a settle_withdraw transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${onchainVaultAddress}/invest/build`,
      headers: { "x-atlas-owner": investor.publicKey.toBase58() },
      payload: { action: "settle_withdraw" },
    });
    expect(res.statusCode).toBe(200);
    const tx = Transaction.from(Buffer.from(res.json().data.transaction, "base64"));
    expect(tx.instructions.find((i) => i.data.subarray(0, 8).equals(SETTLE_WITHDRAW_DISCRIMINATOR))).toBeDefined();
  });

  it("rejects the build endpoint for demo vaults", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${demoVaultAddress}/invest/build`,
      headers: { "x-atlas-owner": investor.publicKey.toBase58() },
      payload: { action: "deposit", amount: 1_000_000 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("not_onchain_vault");
  });

  it("merges on-chain positions into the investor summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/investors/${investor.publicKey.toBase58()}`,
    });
    expect(res.statusCode).toBe(200);
    const summary = res.json().data;
    expect(summary.vaults).toContain(onchainVaultAddress);
    const chainPos = summary.positions.find((p: { id: string }) => p.id.startsWith("onchain_"));
    expect(chainPos).toBeDefined();
    expect(chainPos.shares).toBe(1_000_000);
    expect(summary.currentValue).toBe(2_000_000);
  });

  it("lists on-chain positions", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/investors/${investor.publicKey.toBase58()}/positions`,
    });
    expect(res.statusCode).toBe(200);
    const positions = res.json().data;
    const chainPos = positions.find((p: { id: string }) => p.id.startsWith("onchain_"));
    expect(chainPos).toBeDefined();
    expect(chainPos.status).toBe("pending");
    expect(chainPos.claimable).toBe(1_000);
    expect(chainPos.pendingShares).toBe(1_000);
    expect(chainPos.settlementSlot).toBe(1_000_000);
  });
});
