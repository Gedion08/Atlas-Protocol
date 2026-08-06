import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";

/** Seed owners are derived deterministically (see db/seed.ts). */
function managerKeypair(ownerName: string): Keypair {
  return Keypair.fromSeed(createHash("sha256").update(`atlas-${ownerName}`).digest());
}

/** Builds the wallet-signature headers for a request body (spec §7.1). */
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

describe("strategy uploads", () => {
  let app: FastifyInstance;
  const quantum = managerKeypair("quantum");

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", REPOSITORY_DRIVER: "memory", KAFKA_ENABLED: "false", ORACLE_LOOP_ENABLED: "false", CIRCUIT_BREAKER_ENABLED: "false" }),
      repositories: createMemoryRepositories(),
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const validUpload = {
    managerId: "mgr_quantum",
    name: "BTC/SOL Conservative",
    type: "passive",
    protocol: "meteora",
    pool: "BTC-SOL DLMM",
    pair: "BTC/SOL",
    fees: { managementBps: 50, performanceBps: 1500 },
    riskTier: 1,
    description: "Concentrated passive range",
    params: { rebalanceThresholdBps: 50, spreadBps: 30, bins: 40 },
  };

  it("creates a strategy with 201 and defaults", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: validUpload,
      headers: signedHeaders(validUpload, quantum),
    });
    expect(res.statusCode).toBe(201);
    const strategy = res.json().data;
    expect(strategy.id).toContain("mgr_quantum");
    expect(strategy.version).toBe(4);
    expect(strategy.status).toBe("active");
    expect(strategy.tvl).toBe(0);
    expect(strategy.params).toEqual({
      rebalanceThresholdBps: 50,
      spreadBps: 30,
      bins: 40,
      maxSlippageBps: 10,
      allowedProtocols: [],
    });
  });

  it("bumps the version for a same-named re-upload", async () => {
    const body = { ...validUpload, name: "Range Rotation" };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: body,
      headers: signedHeaders(body, quantum),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.version).toBe(4);
  });

  it("rejects uploads for unknown managers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: { ...validUpload, managerId: "mgr_ghost" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("manager_not_found");
  });

  it("rejects uploads for non-active managers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: { ...validUpload, managerId: "mgr_nova" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("manager_not_active");
  });

  it("enforces risk-tier gating on uploads", async () => {
    const body = { ...validUpload, riskTier: 3 };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: body,
      headers: signedHeaders(body, quantum),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("risk_tier_exceeded");
  });

  it("rejects malformed bodies", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: { ...validUpload, riskTier: 9 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects unsigned uploads with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: validUpload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_signature_headers");
  });

  it("rejects signatures from a wallet that is not the manager owner", async () => {
    const stranger = Keypair.generate();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: validUpload,
      headers: signedHeaders(validUpload, stranger),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("signer_mismatch");
  });

  it("rejects tampered signatures", async () => {
    const body = { ...validUpload, name: "Tampered" };
    const headers = signedHeaders(body, quantum);
    const tampered = { ...validUpload, name: "Actually Different" };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: tampered,
      headers,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid_signature");
  });

  it("rejects nonce reuse", async () => {
    const body = { ...validUpload, name: "Nonce Replay" };
    const headers = signedHeaders(body, quantum);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: body,
      headers,
    });
    expect(first.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/strategies",
      payload: body,
      headers,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error).toBe("stale_or_reused_nonce");
  });
});
