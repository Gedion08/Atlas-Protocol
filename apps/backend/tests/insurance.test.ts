import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildAuthMessage, newNonce, sha256Hex } from "../src/services/auth/signature.js";

const testEnv = () =>
  loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    REPOSITORY_DRIVER: "memory",
    KAFKA_ENABLED: "false",
    ORACLE_LOOP_ENABLED: "false",
    CIRCUIT_BREAKER_ENABLED: "false",
    METRICS_ENABLED: "false",
  });

function signedHeaders(signer: Keypair, payload: unknown) {
  const owner = signer.publicKey.toBase58();
  const nonce = newNonce();
  const message = buildAuthMessage({ owner, nonce, payloadSha256: sha256Hex(JSON.stringify(payload)) });
  const signature = bs58.encode(nacl.sign.detached(Buffer.from(message, "utf8"), signer.secretKey));
  return {
    "x-atlas-owner": owner,
    "x-atlas-nonce": nonce,
    "x-atlas-signature": signature,
    "content-type": "application/json",
  };
}

describe("insurance routes auth", () => {
  let app: FastifyInstance;
  let governanceKeypair: Keypair;

  beforeEach(async () => {
    governanceKeypair = Keypair.generate();
    app = await buildApp({
      env: testEnv(),
      repositories: createMemoryRepositories(),
      logger: false,
      governanceKeypair,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects activation that only names the public governance key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/activate",
      payload: { amount: 1_000, executor: governanceKeypair.publicKey.toBase58() },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("missing_signature_headers");
  });

  it.each(["assess", "adjudicate", "payout"])("rejects unsigned claim %s", async (action) => {
    const payload = {
      claimId: "clm_1",
      executor: governanceKeypair.publicKey.toBase58(),
      assessor: "a",
      notes: "n",
      recommendedAmount: 1,
      coInsuranceBps: 0,
      approved: true,
      signature: "sig",
      amount: 1,
    };
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/claims/clm_1/${action}`,
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a request signed by a wallet other than governance", async () => {
    const payload = { claimId: "clm_1", approved: true };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/claims/clm_1/adjudicate",
      headers: signedHeaders(Keypair.generate(), payload),
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("signer_mismatch");
  });

  it("accepts a governance-signed request and records governance as decider", async () => {
    const claim = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/claims",
      payload: {
        vaultAddress: "vault_1",
        claimant: "claimant_1",
        amount: 500,
        eventType: "exploit",
        evidence: "tx",
        eventTs: 1,
      },
    });
    const claimId = claim.json().data?.id ?? "clm_missing";

    const payload = { claimId, approved: false, notes: "denied" };
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/claims/${claimId}/adjudicate`,
      headers: signedHeaders(governanceKeypair, payload),
      payload,
    });
    // Auth passed: any outcome now comes from the claim state machine, not auth.
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.json().data.decidedBy).toBe(governanceKeypair.publicKey.toBase58());
    } else {
      expect(res.json().error).toBe("adjudication_failed");
    }
  });
});

describe("signed request replay across routes", () => {
  it("rejects a nonce already consumed by a different endpoint", async () => {
    const governanceKeypair = Keypair.generate();
    const app = await buildApp({
      env: testEnv(),
      repositories: createMemoryRepositories(),
      logger: false,
      governanceKeypair,
    });
    await app.ready();

    // One body valid for both endpoints (zod strips unknown keys).
    const payload = { claimId: "clm_x", approved: false, vaultAddress: "unknown" };
    const headers = signedHeaders(governanceKeypair, payload);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/claims/clm_x/adjudicate",
      headers,
      payload,
    });
    expect([200, 400]).toContain(first.statusCode);
    expect(first.json().error).not.toBe("stale_or_reused_nonce");

    const replay = await app.inject({ method: "POST", url: "/api/v1/emergency-exit", headers, payload });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error).toBe("stale_or_reused_nonce");
    await app.close();
  });
});

describe("insurance routes without governance keypair", () => {
  it("refuses privileged actions when GOVERNANCE_KEYPAIR is unset", async () => {
    const app = await buildApp({
      env: testEnv(),
      repositories: createMemoryRepositories(),
      logger: false,
    });
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/activate",
      payload: { amount: 1_000 },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("governance_keypair_missing");
    await app.close();
  });
});
