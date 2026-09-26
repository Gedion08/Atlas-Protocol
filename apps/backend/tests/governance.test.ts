import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories, InMemoryGovernanceRepository } from "../src/db/repositories.js";
import { seedLocks, seedProposals } from "../src/db/seed.js";
import { loadEnv } from "../src/env.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildAuthMessage, newNonce, sha256Hex } from "../src/services/auth/signature.js";

function signedHeaders(signer: Keypair, payload: unknown) {
  const owner = signer.publicKey.toBase58();
  const nonce = newNonce();
  const message = buildAuthMessage({ owner, nonce, payloadSha256: sha256Hex(JSON.stringify(payload)) });
  return {
    "x-atlas-owner": owner,
    "x-atlas-nonce": nonce,
    "x-atlas-signature": bs58.encode(nacl.sign.detached(Buffer.from(message, "utf8"), signer.secretKey)),
    "content-type": "application/json",
  };
}

describe("governance API", () => {
  let app: FastifyInstance;
  const holder = Keypair.generate();
  const noLock = Keypair.generate();

  beforeAll(async () => {
    // Give a keypair we control an active ve-lock so it can sign votes.
    const repositories = createMemoryRepositories();
    repositories.governance = new InMemoryGovernanceRepository(seedProposals, [
      ...seedLocks,
      {
        holder: holder.publicKey.toBase58(),
        amount: 500_000,
        weight: 1_250_000,
        unlockAt: Math.floor(Date.now() / 1000) + 400 * 86_400,
        swept: false,
      },
    ]);
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", REPOSITORY_DRIVER: "memory", KAFKA_ENABLED: "false", ORACLE_LOOP_ENABLED: "false", CIRCUIT_BREAKER_ENABLED: "false" }),
      repositories,
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists seeded proposals", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/governance/proposals" });
    expect(res.statusCode).toBe(200);
    const proposals = res.json().data;
    expect(proposals.length).toBeGreaterThanOrEqual(3);
    expect(proposals.some((p: { status: string }) => p.status === "succeeded")).toBe(true);
  });

  it("filters proposals by status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/governance/proposals?status=active",
    });
    expect(res.json().data.every((p: { status: string }) => p.status === "active")).toBe(true);
  });

  it("gets a proposal", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/governance/proposals/1" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe("1");
  });

  it("returns 404 for unknown proposals", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/governance/proposals/999" });
    expect(res.statusCode).toBe(404);
  });

  it("creates a proposal", async () => {
    const payload = {
      proposer: holder.publicKey.toBase58(),
      class: "parametric",
      title: "Raise max drawdown tolerance to 20%",
      targetProgram: "9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8",
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals",
      headers: signedHeaders(holder, payload),
      payload,
    });
    expect(res.statusCode).toBe(201);
    const proposal = res.json().data;
    expect(proposal.status).toBe("active");
    expect(proposal.forVotes).toBe(0);
    expect(proposal.quorumWeight).toBeGreaterThan(0);
  });

  it("casts a vote with ve-lock weight", async () => {
    const payload = { voter: holder.publicKey.toBase58(), inFavor: true };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/1/votes",
      headers: signedHeaders(holder, payload),
      payload,
    });
    expect(res.statusCode).toBe(200);
    const proposal = res.json().data;
    expect(proposal.forVotes).toBeGreaterThan(0);
  });

  it("ignores votes from wallets without an active lock", async () => {
    const payload = { voter: noLock.publicKey.toBase58(), inFavor: true };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/1/votes",
      headers: signedHeaders(noLock, payload),
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.forVotes).toBeGreaterThanOrEqual(1_100_000);
  });

  it("rejects unsigned votes and proposals", async () => {
    const vote = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/1/votes",
      payload: { voter: holder.publicKey.toBase58(), inFavor: false },
    });
    expect(vote.statusCode).toBe(401);
    const proposal = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals",
      payload: { proposer: holder.publicKey.toBase58(), class: "parametric", title: "x" },
    });
    expect(proposal.statusCode).toBe(401);
  });

  it("rejects a vote signed by someone other than the voter", async () => {
    const payload = { voter: holder.publicKey.toBase58(), inFavor: false };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/1/votes",
      headers: signedHeaders(noLock, payload),
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("signer_mismatch");
  });

  it("lists ve-locks", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/governance/locks" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });
});
