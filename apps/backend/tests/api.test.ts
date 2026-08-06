import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";

describe("atlas API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        REPOSITORY_DRIVER: "memory",
        HELIUS_WEBHOOK_SECRET: "test-secret",
        KAFKA_ENABLED: "false",
        ORACLE_LOOP_ENABLED: "false",
        CIRCUIT_BREAKER_ENABLED: "false",
      }),
      repositories: createMemoryRepositories(),
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves liveness", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("serves readiness", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().driver).toBe("memory");
  });

  it("lists managers sorted by score", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/managers" });
    expect(res.statusCode).toBe(200);
    const managers = res.json().data;
    expect(managers.length).toBeGreaterThan(0);
    expect(managers[0].score.total).toBeGreaterThanOrEqual(managers[1].score.total);
  });

  it("returns 404 for unknown managers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/managers/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("manager_not_found");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });

  it("computes manager scores", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/managers/score",
      payload: {
        feeGeneration: 100,
        risk: 0,
        drawdown: 0,
        capitalRetention: 100,
        consistency: 100,
        tvlGrowth: 100,
        governanceParticipation: 100,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(100);
  });

  it("rejects invalid score payloads", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/managers/score",
      payload: { feeGeneration: 500 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });

  it("lists strategies with filters", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/strategies?protocol=meteora" });
    expect(res.statusCode).toBe(200);
    const strategies = res.json().data;
    expect(strategies.length).toBeGreaterThan(0);
    expect(strategies.every((s: { protocol: string }) => s.protocol === "meteora")).toBe(true);
  });

  it("lists leaderboard", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/leaderboard" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });

  it("reallocates a vault with capped allocations", async () => {
    const vaults = await app.inject({ method: "GET", url: "/api/v1/vaults" });
    const address = vaults.json().data[0].address;
    const res = await app.inject({ method: "POST", url: `/api/v1/vaults/${address}/reallocate` });
    expect(res.statusCode).toBe(200);
    const allocation = res.json().data.allocation;
    expect(allocation.shares.length).toBeGreaterThan(0);
    expect(Math.max(...allocation.shares.map((s: { share: number }) => s.share))).toBeLessThanOrEqual(0.3);
  });

  it("evaluates manager risk", async () => {
    const managers = await app.inject({ method: "GET", url: "/api/v1/managers" });
    const id = managers.json().data[0].id;
    const res = await app.inject({ method: "GET", url: `/api/v1/managers/${id}/risk` });
    expect(res.statusCode).toBe(200);
    expect(["ok", "reduce", "pause"]).toContain(res.json().data.action);
  });

  it("rejects unsigned webhooks", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/helius",
      payload: { transactions: [{ signature: "abc" }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts signed webhooks", async () => {
    const body = { transactions: [{ signature: "sig1", timestamp: 1, slot: 1 }] };
    const signature = createHmac("sha256", "test-secret").update(JSON.stringify(body)).digest("hex");
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/helius",
      headers: { "x-webhook-signature": signature },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().processed).toBe(1);
  });
});
