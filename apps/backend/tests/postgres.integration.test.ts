import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Pool } from "pg";
import { createPostgresRepositories, type PostgresRepositoriesOptions } from "../src/db/repositories-pg.js";
import type { Repositories } from "../src/db/repositories.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { buildPgPool } from "../src/db/bootstrap.js";
import { loadEnv } from "../src/env.js";

const hasExplicitDatabaseUrl =
  typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim() !== "";
const env = loadEnv({
  NODE_ENV: "test",
  REPOSITORY_DRIVER: "postgres",
  DATABASE_URL: process.env.DATABASE_URL,
});
const dbUrl = env.DATABASE_URL;

const describeIfPostgres = hasExplicitDatabaseUrl ? describe : describe.skip;

type R = Awaited<ReturnType<typeof createPostgresRepositories>>;

describeIfPostgres("Postgres repositories (integration)", () => {
  let pool: Pool;
  let repos: R;

  beforeAll(async () => {
    pool = buildPgPool(dbUrl, { max: 5 });
    const options: PostgresRepositoriesOptions = { connectionString: dbUrl };
    repos = await createPostgresRepositories(options);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("connects, applies migrations, and exposes all tables", async () => {
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    const names = tables.rows.map((r) => r.table_name).sort();
    expect(names).toContain("vaults");
    expect(names).toContain("managers");
    expect(names).toContain("strategies");
    expect(names).toContain("proposals");
    expect(names).toContain("proposal_votes");
    expect(names).toContain("ve_locks");
    expect(names).toContain("investor_positions");
    expect(names).toContain("oracle_submissions");
    expect(names).toContain("performance_points");
    expect(names).toContain("schema_migrations");
  });

  it("bootstraps demo data when empty (managers, strategies, vaults)", async () => {
    const managers = await repos.managers.list();
    expect(managers.length).toBeGreaterThanOrEqual(5);
    const strategies = await repos.strategies.list({});
    expect(strategies.length).toBeGreaterThanOrEqual(5);
    const vaults = await repos.vaults.list();
    expect(vaults.length).toBeGreaterThanOrEqual(4);
  });

  it("returns managers sorted by total score with leaderboard ranks", async () => {
    const [top, second] = await repos.managers.list();
    expect(top.score.total).toBeGreaterThanOrEqual(second.score.total);

    const board = await repos.managers.leaderboard(3);
    expect(board).toHaveLength(3);
    expect(board[0].rank).toBe(1);
    expect(board[0].id).toBe(top.id);
  });

  it("computes manager performance from seeded performance points", async () => {
    const perf = await repos.managers.performance("mgr_quantum", 90);
    expect(perf).not.toBeNull();
    expect(perf?.series.length).toBeGreaterThan(0);
    expect(perf?.sharpe).toBeGreaterThanOrEqual(0);
  });

  it("creates and version-increments strategies for a manager", async () => {
    const created = await repos.strategies.create({
      managerId: "mgr_quantum",
      name: "Integration Test Strategy",
      type: "passive",
      protocol: "meteora",
      pool: "TEST-SOL DLMM",
      pair: "TEST/SOL",
      fees: { managementBps: 25, performanceBps: 1000 },
      riskTier: 1,
      description: "created by integration test",
      params: { bins: 20 },
    });
    expect(created.id).toMatch(/^str_/);
    expect(created.version).toBeGreaterThanOrEqual(1);
    expect(created.status).toBe("active");
    expect(created.params).toEqual({ bins: 20 });

    const again = await repos.strategies.create({
      managerId: "mgr_quantum",
      name: "Integration Test Strategy",
      type: "passive",
      protocol: "meteora",
      pool: "TEST-SOL DLMM",
      pair: "TEST/SOL",
      fees: { managementBps: 25, performanceBps: 1000 },
      riskTier: 1,
    });
    expect(again.version).toBe(created.version + 1);

    const filtered = await repos.strategies.list({ managerId: "mgr_quantum" });
    expect(filtered.some((s) => s.id === created.id)).toBe(true);
  });

  it("processes a full deposit -> withdraw lifecycle against a real vault", async () => {
    const vault = (await repos.vaults.get("VaU1tXYb7mX8G5w3eRkQzKj4nLpDcVfBqHtSwXcYaZx"))!;
    expect(vault).not.toBeNull();

    const investor = "F7xM5JxPcNU4RtQdVa9zr2QYhfULSKmdKcAcgBejWvT6";
    const position = await repos.investors.deposit(vault, {
      investor,
      amount: 2_500,
      strategyId: "str_btc_sol_conservative",
    });
    expect(position.shares).toBeGreaterThan(0);
    expect(position.vaultAddress).toBe(vault.address);
    expect(position.status).toBe("active");

    const updated = await repos.vaults.update({
      ...vault,
      tvl: vault.tvl + position.amount,
      sharesOutstanding: vault.sharesOutstanding + position.shares,
      lastRebalanceAt: Date.now(),
    });
    expect(updated.tvl).toBeGreaterThan(vault.tvl);

    const listed = await repos.investors.listPositions(investor);
    expect(listed.some((p) => p.id === position.id)).toBe(true);

    const result = await repos.investors.withdraw(position.id, updated, position.shares);
    expect(result).not.toBeNull();
    expect(result!.proceeds).toBeCloseTo(position.amount, 2);
    expect(result!.sharesRedeemed).toBeCloseTo(position.shares, 6);
  });

  it("records and retrieves oracle submissions", async () => {
    const submission = {
      managerId: "mgr_apex",
      score: {
        total: 66,
        breakdown: {
          feeGeneration: 80,
          risk: 30,
          drawdown: 20,
          capitalRetention: 70,
          consistency: 75,
          tvlGrowth: 88,
          governanceParticipation: 40,
        },
        weights: {
          feeGeneration: 0.25,
          risk: 0.2,
          drawdown: 0.15,
          capitalRetention: 0.1,
          consistency: 0.1,
          tvlGrowth: 0.1,
          governanceParticipation: 0.1,
        },
      },
      riskTier: 3 as const,
      action: "ok" as const,
      period: "2026-08-04",
      submittedAt: Date.now(),
    };
    await repos.oracle.recordSubmission(submission);
    const latest = await repos.oracle.latestSubmissions("mgr_apex", 5);
    expect(latest.some((s) => s.score.total === 66 && s.period === submission.period)).toBe(true);
  });

  it("creates proposals and casts weighted ve-lock votes", async () => {
    const proposer = "HoPrXWPH3naKVZEftnckQVpd2bSNRnSiFS2TysDiv5Ff";
    const proposal = await repos.governance.createProposal({
      proposer,
      class: "parametric",
      title: "Integration test: lower max exposure",
    });
    expect(proposal.status).toBe("active");
    expect(proposal.quorumWeight).toBeGreaterThan(0);

    const voted = await repos.governance.castVote(proposal.id, {
      voter: proposer,
      inFavor: true,
    });
    expect(voted?.forVotes).toBeGreaterThan(0);

    const votes = await repos.governance.listVotes(proposal.id);
    expect(votes.some((v) => v.proposalId === proposal.id && v.inFavor)).toBe(true);
  });

  it("in-memory repos still work for isolated unit tests", async () => {
    const mem: Repositories = createMemoryRepositories();
    const mgr = await mem.managers.get("mgr_quantum");
    expect(mgr?.id).toBe("mgr_quantum");
  });
});

