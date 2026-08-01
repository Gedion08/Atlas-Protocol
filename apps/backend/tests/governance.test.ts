import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";

describe("governance API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", REPOSITORY_DRIVER: "memory" }),
      repositories: createMemoryRepositories(),
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
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals",
      payload: {
        proposer: "QmNTvXQv3xkDQrQkNZjk8XoVPL5DyxwC3KqMxKzQLdK",
        class: "parametric",
        title: "Raise max drawdown tolerance to 20%",
        targetProgram: "9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8",
      },
    });
    expect(res.statusCode).toBe(201);
    const proposal = res.json().data;
    expect(proposal.status).toBe("active");
    expect(proposal.forVotes).toBe(0);
    expect(proposal.quorumWeight).toBeGreaterThan(0);
  });

  it("casts a vote with ve-lock weight", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/1/votes",
      payload: {
        voter: "QmNTvXQv3xkDQrQkNZjk8XoVPL5DyxwC3KqMxKzQLdK",
        inFavor: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const proposal = res.json().data;
    expect(proposal.forVotes).toBeGreaterThan(0);
  });

  it("ignores votes from wallets without an active lock", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/governance/proposals/1/votes",
      payload: { voter: "walletWithNoLock123456789", inFavor: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.forVotes).toBeGreaterThanOrEqual(1_100_000);
  });

  it("lists ve-locks", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/governance/locks" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThan(0);
  });
});
