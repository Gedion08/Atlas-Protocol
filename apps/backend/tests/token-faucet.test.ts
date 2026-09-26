import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { Keypair } from "@solana/web3.js";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { env, loadEnv } from "../src/env.js";

const sendFaucetTransaction = vi.fn(async () => "sig_faucet");
vi.mock("../src/services/token/distribution.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/services/token/distribution.js")>()),
  sendFaucetTransaction: (...args: unknown[]) => sendFaucetTransaction(...(args as [])),
}));

describe("token faucet", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    sendFaucetTransaction.mockClear();
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        REPOSITORY_DRIVER: "memory",
        KAFKA_ENABLED: "false",
        ORACLE_LOOP_ENABLED: "false",
        CIRCUIT_BREAKER_ENABLED: "false",
      }),
      repositories: createMemoryRepositories(),
      logger: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const drip = (recipient: string, amount?: number) =>
    app.inject({
      method: "POST",
      url: "/api/v1/token/faucet",
      payload: amount === undefined ? { recipient } : { recipient, amount },
    });

  it("rejects amounts above the configured faucet amount", async () => {
    const res = await drip(Keypair.generate().publicKey.toBase58(), env.ATLAS_FAUCET_AMOUNT + 1);
    expect(res.statusCode).toBe(400);
    expect(sendFaucetTransaction).not.toHaveBeenCalled();
  });

  it("enforces the cooldown per recipient and per client", async () => {
    const first = await drip(Keypair.generate().publicKey.toBase58());
    expect(first.statusCode).toBe(200);

    // Same client IP, different wallet: still cooling down.
    const second = await drip(Keypair.generate().publicKey.toBase58());
    expect(second.statusCode).toBe(429);
    expect(second.json().error).toBe("faucet_cooldown");
    expect(sendFaucetTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not start the cooldown when the transfer fails", async () => {
    sendFaucetTransaction.mockRejectedValueOnce(new Error("rpc down"));
    const recipient = Keypair.generate().publicKey.toBase58();
    expect((await drip(recipient)).statusCode).toBe(503);
    expect((await drip(recipient)).statusCode).toBe(200);
  });
});
