import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool, type PoolConfig } from "pg";
import { bootstrapVault, readBootstrapState } from "./bootstrap-state.js";
import {
  seedLocks,
  seedManagers,
  seedProposals,
  seedStrategies,
  seedVaults,
} from "./seed.js";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../db/migrations");
const DAY_MS = 86_400_000;

/**
 * Creates a pg Pool from a connection string, honoring `sslmode` for managed
 * providers (Supabase requires `sslmode=require`). Local/docker URLs without
 * an sslmode stay plaintext, matching the default pg behavior.
 */
export function buildPgPool(connectionString: string, options?: PoolConfig): Pool {
  const config: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...options,
  };
  const sslmode = sslModeFromUrl(connectionString);
  if (sslmode !== null && sslmode !== "disable") {
    config.ssl = { rejectUnauthorized: false };
  }
  return new Pool(config);
}

function sslModeFromUrl(connectionString: string): string | null {
  const query = connectionString.split("?")[1] ?? "";
  for (const pair of query.split("&")) {
    const [key, value] = pair.split("=");
    if (key === "sslmode") return value || "require";
  }
  return null;
}

/** Applies pending SQL migrations inside per-file transactions (idempotent). */
export async function runMigrations(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);
  const applied = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
      (r) => r.name,
    ),
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const appliedNow: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(resolve(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [
        file,
        Date.now(),
      ]);
      await client.query("COMMIT");
      appliedNow.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${String(err)}`);
    } finally {
      client.release();
    }
  }

  return appliedNow;
}

/** Seeds demo managers/strategies/vaults/governance/performance data (idempotent). */
export async function runSeed(pool: Pool): Promise<void> {
  for (const m of seedManagers) {
    await pool.query(
      `INSERT INTO managers (
        id, owner, name, status,
        score_fee_generation, score_risk, score_drawdown, score_capital_retention,
        score_consistency, score_tvl_growth, score_governance, score_total,
        bond_amount, tvl, assets_under_management, pnl, max_drawdown, fees_generated,
        pools_traded, protocols_used, years_active, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      )
      ON CONFLICT (id) DO NOTHING`,
      [
        m.id, m.owner, m.name, m.status,
        m.score.feeGeneration, m.score.risk, m.score.drawdown, m.score.capitalRetention,
        m.score.consistency, m.score.tvlGrowth, m.score.governanceParticipation, m.score.total,
        m.bondAmount, m.tvl, m.assetsUnderManagement, m.pnl, m.maxDrawdown, m.feesGenerated,
        m.poolsTraded, m.protocolsUsed, m.yearsActive, m.createdAt, m.updatedAt,
      ],
    );
  }

  for (const s of seedStrategies) {
    await pool.query(
      `INSERT INTO strategies (
        id, manager_id, name, type, protocol, pool, pair,
        tvl, apy, apr, max_drawdown, sharpe_ratio, sortino_ratio,
        management_fee_bps, performance_fee_bps, impermanent_loss, utilization,
        age_days, version, risk_tier, status, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      )
      ON CONFLICT (id) DO NOTHING`,
      [
        s.id, s.managerId, s.name, s.type, s.protocol, s.pool, s.pair,
        s.tvl, s.apy, s.apr, s.maxDrawdown, s.sharpeRatio, s.sortinoRatio,
        s.fees.managementBps, s.fees.performanceBps, s.impermanentLoss, s.utilization,
        s.ageDays, s.version, s.riskTier, s.status ?? "active", s.createdAt ?? Date.now(),
      ],
    );
  }

  for (const v of seedVaults) {
    await pool.query(
      `INSERT INTO vaults (
        address, name, base_asset, manager_id, authority, status,
        tvl, apy, shares_outstanding, management_fee_bps, performance_fee_bps,
        min_deposit, created_at, last_rebalance_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (address) DO NOTHING`,
      [
        v.address, v.name, v.baseAsset, v.managerId, v.authority, v.status,
        v.tvl, v.apy, v.sharesOutstanding, v.managementFeeBps, v.performanceFeeBps,
        v.minDeposit, v.createdAt, v.lastRebalanceAt,
      ],
    );
  }

  for (const l of seedLocks) {
    await pool.query(
      `INSERT INTO ve_locks (holder, amount, weight, unlock_at, swept)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (holder) DO NOTHING`,
      [l.holder, l.amount, l.weight, l.unlockAt, l.swept],
    );
  }

  for (const p of seedProposals) {
    await pool.query(
      `INSERT INTO proposals (
        id, proposer, class, title, target_program, instruction_data,
        quorum_weight, for_votes, against_votes, start_voting_at, end_voting_at,
        execution_at, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.proposer, p.class, p.title, p.targetProgram, p.instructionData,
        p.quorumWeight, p.forVotes, p.againstVotes, p.startVotingAt, p.endVotingAt,
        p.executionAt, p.status,
      ],
    );
  }

  for (const m of seedManagers) {
    const now = Date.now();
    let nav = 1;
    for (let i = 30; i >= 0; i -= 1) {
      const ts = now - i * DAY_MS;
      nav *= 1 + (m.score.total / 100) * 0.0008;
      await pool.query(
        `INSERT INTO performance_points (
          manager_id, timestamp, tvl, nav, fees_generated, daily_pnl, max_drawdown,
          volatility, protocols_used, pools_traded, governance_actions
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (manager_id, timestamp) DO NOTHING`,
        [
          m.id, ts, m.tvl * (0.9 + 0.1 * Math.sin(i / 6)),
          nav,
          (m.feesGenerated / 30) * 0.6,
          m.pnl / 30,
          m.maxDrawdown,
          0.08 + m.score.risk / 500,
          m.poolsTraded,
          m.poolsTraded,
          0,
        ],
      );
    }
    await pool.query(
      `INSERT INTO risk_decisions (manager_id, action, score, violations, evaluated_at)
       SELECT $1,$2,$3,'[]'::jsonb,$4
       WHERE NOT EXISTS (SELECT 1 FROM risk_decisions WHERE manager_id = $1)`,
      [
        m.id,
        m.status === "suspended" ? "halt" : m.maxDrawdown > 0.1 ? "reduce" : "ok",
        Math.max(0, 100 - m.score.risk),
        now,
      ],
    );
  }
}

/** Seeds only when the managers table is empty; returns true when it seeded. */
export async function seedIfEmpty(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::int AS count FROM managers",
  );
  if (Number(rows[0]?.count ?? 0) > 0) return false;
  await runSeed(pool);
  return true;
}

/**
 * Upserts the on-chain vault (and its manager profile key) recorded by
 * `deploy/bootstrap-state.json`, so the API lists it even when the demo seed
 * already ran. No-op when the bootstrap never executed on this checkout.
 */
export async function upsertBootstrapVault(pool: Pool): Promise<void> {
  const state = readBootstrapState();
  if (!state) return;
  const vault = bootstrapVault(state);

  await pool.query(
    `INSERT INTO managers (id, owner, name, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'active', $4, $4)
     ON CONFLICT (id) DO NOTHING`,
    [state.manager.profilePda, state.manager.owner, state.manager.name, state.generatedAt],
  );

  await pool.query(
    `INSERT INTO vaults (
      address, name, base_asset, manager_id, authority, status,
      tvl, apy, shares_outstanding, management_fee_bps, performance_fee_bps,
      min_deposit, created_at, last_rebalance_at, onchain
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (address) DO NOTHING`,
    [
      vault.address, vault.name, vault.baseAsset, vault.managerId, vault.authority, vault.status,
      vault.tvl, vault.apy, vault.sharesOutstanding, vault.managementFeeBps,
      vault.performanceFeeBps, vault.minDeposit, vault.createdAt, vault.lastRebalanceAt,
      JSON.stringify(state.vault),
    ],
  );
}
