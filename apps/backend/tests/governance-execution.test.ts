import { describe, expect, it, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";
import { Keypair } from "@solana/web3.js";

describe("governance-execution route", () => {
  let app: FastifyInstance;
  let governanceKeypair: Keypair;

  beforeEach(async () => {
    governanceKeypair = Keypair.generate();
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

  it("returns 404 for unknown proposal", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/unknown/execute",
      payload: { proposalId: "unknown" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("proposal_not_found");
  });
});
