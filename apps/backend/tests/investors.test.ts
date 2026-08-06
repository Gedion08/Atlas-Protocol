import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";

const investorKeypair = Keypair.fromSeed(
  createHash("sha256").update("atlas-investor-test").digest(),
);

/** Builds wallet-signature headers for a request body (spec §7.1). */
function signedHeaders(body: unknown, keypair: Keypair): Record<string, string> {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payloadSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const message = ["atlas.request v1", keypair.publicKey.toBase58(), nonce, payloadSha256].join("\n");
  const signature = nacl.sign.detached(Buffer.from(message, "utf8"), keypair.secretKey);
  return {
    "x-atlas-owner": keypair.publicKey.toBase58(),
    "x-atlas-nonce": nonce,
    "x-atlas-signature": bs58.encode(signature),
  };
}

describe("investor positions", () => {
  let app: FastifyInstance;
  let vaultAddress: string;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", REPOSITORY_DRIVER: "memory", KAFKA_ENABLED: "false", ORACLE_LOOP_ENABLED: "false", CIRCUIT_BREAKER_ENABLED: "false" }),
      repositories: createMemoryRepositories(),
      logger: false,
    });
    await app.ready();
    const vaults = await app.inject({ method: "GET", url: "/api/v1/vaults" });
    vaultAddress = vaults.json().data[0].address;
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects unsigned deposits", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${vaultAddress}/deposit`,
      payload: { investor: investorKeypair.publicKey.toBase58(), amount: 1_000 },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_signature_headers");
  });

  it("rejects deposits below the minimum", async () => {
    const body = { investor: investorKeypair.publicKey.toBase58(), amount: 1 };
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${vaultAddress}/deposit`,
      payload: body,
      headers: signedHeaders(body, investorKeypair),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("below_min_deposit");
  });

  it("deposits into a vault and mints priced shares", async () => {
    const body = { investor: investorKeypair.publicKey.toBase58(), amount: 50_000 };
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${vaultAddress}/deposit`,
      payload: body,
      headers: signedHeaders(body, investorKeypair),
    });
    expect(res.statusCode).toBe(201);
    const { position, vault } = res.json().data;
    expect(position.investor).toBe(body.investor);
    expect(position.status).toBe("active");
    expect(position.shares).toBeGreaterThan(0);
    expect(position.sharePrice).toBeGreaterThan(0);
    expect(vault.tvl).toBeGreaterThan(31_000_000);
    expect(vault.sharesOutstanding).toBeGreaterThan(position.shares);
  });

  it("lists the investor positions", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/investors/${investorKeypair.publicKey.toBase58()}/positions`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });

  it("summarizes the investor portfolio", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/investors/${investorKeypair.publicKey.toBase58()}`,
    });
    expect(res.statusCode).toBe(200);
    const summary = res.json().data;
    expect(summary.totalInvested).toBe(50_000);
    expect(summary.currentValue).toBeGreaterThan(0);
    expect(summary.vaults).toContain(vaultAddress);
  });

  it("withdraws shares and credits proceeds", async () => {
    const positions = await app.inject({
      method: "GET",
      url: `/api/v1/investors/${investorKeypair.publicKey.toBase58()}/positions`,
    });
    const position = positions.json().data[0];
    const body = { investor: investorKeypair.publicKey.toBase58(), shares: position.shares };
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${vaultAddress}/withdraw`,
      payload: body,
      headers: signedHeaders(body, investorKeypair),
    });
    expect(res.statusCode).toBe(200);
    const { position: updated, proceeds } = res.json().data;
    expect(updated.status).toBe("withdrawn");
    expect(proceeds).toBeGreaterThan(0);
  });

  it("rejects withdrawals when there is no active position", async () => {
    const body = { investor: investorKeypair.publicKey.toBase58(), shares: 10 };
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/vaults/${vaultAddress}/withdraw`,
      payload: body,
      headers: signedHeaders(body, investorKeypair),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("position_not_found");
  });

  it("returns 404 for unknown vault deposits", async () => {
    const body = { investor: investorKeypair.publicKey.toBase58(), amount: 5_000 };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/vaults/nope/deposit",
      payload: body,
      headers: signedHeaders(body, investorKeypair),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("vault_not_found");
  });
});
