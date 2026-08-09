import { describe, expect, it, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildAuthMessage, newNonce, sha256Hex } from "../src/services/auth/signature.js";

describe("emergency-exit route", () => {
  let app: FastifyInstance;
  let governanceKeypair: Keypair;
  let owner: string;

  beforeEach(async () => {
    governanceKeypair = Keypair.generate();
    owner = governanceKeypair.publicKey.toBase58();
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        REPOSITORY_DRIVER: "memory",
        KAFKA_ENABLED: "false",
        ORACLE_LOOP_ENABLED: "false",
        CIRCUIT_BREAKER_ENABLED: "false",
        METRICS_ENABLED: "false",
      }),
      repositories: createMemoryRepositories(),
      logger: false,
      governanceKeypair,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 404 for unknown vault with valid auth", async () => {
    const nonce = newNonce();
    const payload = { vaultAddress: "unknown" };
    const payloadSha256 = sha256Hex(JSON.stringify(payload));
    const message = buildAuthMessage({ owner, nonce, payloadSha256 });
    const signature = bs58.encode(
      nacl.sign.detached(Buffer.from(message, "utf8"), governanceKeypair.secretKey),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/emergency-exit",
      headers: {
        "x-atlas-owner": owner,
        "x-atlas-nonce": nonce,
        "x-atlas-signature": signature,
        "content-type": "application/json",
      },
      payload,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("vault_not_found");
  });
});
