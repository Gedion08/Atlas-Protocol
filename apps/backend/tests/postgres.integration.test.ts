import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createPostgresRepositories } from "../src/db/repositories-pg.js";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { loadEnv } from "../src/env.js";

const hasExplicitDatabaseUrl =
  typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim() !== "";
const env = loadEnv({
  NODE_ENV: "test",
  REPOSITORY_DRIVER: "postgres",
  DATABASE_URL: process.env.DATABASE_URL,
});
const dbUrl = env.DATABASE_URL;

const pool = new Pool({ connectionString: dbUrl, max: 5, idleTimeoutMillis: 30_000 });

const describeIfPostgres = hasExplicitDatabaseUrl ? describe : describe.skip;

describeIfPostgres("Postgres integration (schema + connectivity)", () => {
  let repos: Awaited<ReturnType<typeof createPostgresRepositories>>;

  beforeAll(async () => {
    repos = await createPostgresRepositories();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("connects to Postgres and migrations are applied", async () => {
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
    // time_series is managed by PgTimeSeriesStore (in-memory default; Postgres impl optional)
  });

  it("managers table exists and is queryable", async () => {
    const count = await pool.query("SELECT count(*) FROM managers");
    expect(Number(count.rows[0].count)).toBeGreaterThanOrEqual(0);
  });

  it("in-memory repos work for isolated unit tests", async () => {
    const mem = createMemoryRepositories();
    const mgr = await mem.managers.get("mgr_quantum");
    expect(mgr?.id).toBe("mgr_quantum");
  });
});
