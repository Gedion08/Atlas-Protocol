import { Pool } from "pg";

export interface ManagerMetricsPoint {
  managerId: string;
  timestamp: number;
  tvl: number;
  nav: number;
  feesGenerated: number;
  dailyPnl: number;
  maxDrawdown: number;
  volatility: number;
  protocolsUsed: number;
  poolsTraded: number;
  governanceActions: number;
}

export interface TimeSeriesStore {
  appendMetrics(points: ManagerMetricsPoint[]): Promise<void>;
  metricsFor(managerId: string, from: number, to: number): Promise<ManagerMetricsPoint[]>;
  latestMetrics(managerId: string): Promise<ManagerMetricsPoint | null>;
  managerIds(): Promise<string[]>;
  close(): Promise<void>;
}

export class InMemoryTimeSeriesStore implements TimeSeriesStore {
  private points = new Map<string, ManagerMetricsPoint[]>();

  async appendMetrics(points: ManagerMetricsPoint[]): Promise<void> {
    for (const point of points) {
      const list = this.points.get(point.managerId) ?? [];
      list.push(point);
      this.points.set(point.managerId, list);
    }
  }

  async metricsFor(managerId: string, from: number, to: number): Promise<ManagerMetricsPoint[]> {
    return (this.points.get(managerId) ?? []).filter(
      (p) => p.timestamp >= from && p.timestamp <= to,
    );
  }

  async latestMetrics(managerId: string): Promise<ManagerMetricsPoint | null> {
    const list = this.points.get(managerId) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async managerIds(): Promise<string[]> {
    return [...this.points.keys()];
  }

  async close(): Promise<void> {}
}

export class PgTimeSeriesStore implements TimeSeriesStore {
  constructor(private readonly pool: Pool) {}

  async appendMetrics(points: ManagerMetricsPoint[]): Promise<void> {
    if (points.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of points) {
        await client.query(
          `INSERT INTO performance_points
             (manager_id, timestamp, tvl, nav, fees_generated, daily_pnl,
              max_drawdown, volatility, protocols_used, pools_traded, governance_actions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (manager_id, timestamp) DO UPDATE SET
             tvl = EXCLUDED.tvl, nav = EXCLUDED.nav,
             fees_generated = EXCLUDED.fees_generated, daily_pnl = EXCLUDED.daily_pnl,
             max_drawdown = EXCLUDED.max_drawdown, volatility = EXCLUDED.volatility,
             protocols_used = EXCLUDED.protocols_used, pools_traded = EXCLUDED.pools_traded,
             governance_actions = EXCLUDED.governance_actions`,
          [
            p.managerId,
            p.timestamp,
            p.tvl,
            p.nav,
            p.feesGenerated,
            p.dailyPnl,
            p.maxDrawdown,
            p.volatility,
            p.protocolsUsed,
            p.poolsTraded,
            p.governanceActions,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async metricsFor(managerId: string, from: number, to: number): Promise<ManagerMetricsPoint[]> {
    const result = await this.pool.query(
      `SELECT * FROM performance_points
       WHERE manager_id = $1 AND timestamp >= $2 AND timestamp <= $3
       ORDER BY timestamp ASC`,
      [managerId, from, to],
    );
    return result.rows.map(rowToMetricsPoint);
  }

  async latestMetrics(managerId: string): Promise<ManagerMetricsPoint | null> {
    const result = await this.pool.query(
      `SELECT * FROM performance_points
       WHERE manager_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [managerId],
    );
    return result.rows[0] ? rowToMetricsPoint(result.rows[0]) : null;
  }

  async managerIds(): Promise<string[]> {
    const result = await this.pool.query("SELECT DISTINCT manager_id FROM performance_points");
    return result.rows.map((r) => r.manager_id as string);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class ClickHouseTimeSeriesStore implements TimeSeriesStore {
  constructor(
    private readonly url: string,
    private readonly database = "atlas",
    private readonly table = "manager_metrics",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get endpoint(): string {
    return `${this.url}/?query=${encodeURIComponent(
      `INSERT INTO ${this.database}.${this.table} FORMAT JSONEachRow`,
    )}`;
  }

  async appendMetrics(points: ManagerMetricsPoint[]): Promise<void> {
    if (points.length === 0) return;
    const body = points
      .map((p) =>
        JSON.stringify({
          manager_id: p.managerId,
          timestamp: p.timestamp,
          tvl: p.tvl,
          nav: p.nav,
          fees_generated: p.feesGenerated,
          daily_pnl: p.dailyPnl,
          max_drawdown: p.maxDrawdown,
          volatility: p.volatility,
          protocols_used: p.protocolsUsed,
          pools_traded: p.poolsTraded,
          governance_actions: p.governanceActions,
        }),
      )
      .join("\n");

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      throw new Error(`ClickHouse insert failed: ${response.status} ${response.statusText}`);
    }
  }

  async metricsFor(managerId: string, from: number, to: number): Promise<ManagerMetricsPoint[]> {
    const query = `SELECT * FROM ${this.database}.${this.table} WHERE manager_id = '${managerId}' AND timestamp >= ${from} AND timestamp <= ${to} ORDER BY timestamp ASC`;
    const response = await this.fetchImpl(`${this.url}/?query=${encodeURIComponent(query)}`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`ClickHouse query failed: ${response.status} ${response.statusText}`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    return rows.map((row) => ({
      managerId: String(row.manager_id),
      timestamp: Number(row.timestamp),
      tvl: Number(row.tvl),
      nav: Number(row.nav),
      feesGenerated: Number(row.fees_generated),
      dailyPnl: Number(row.daily_pnl),
      maxDrawdown: Number(row.max_drawdown),
      volatility: Number(row.volatility),
      protocolsUsed: Number(row.protocols_used),
      poolsTraded: Number(row.pools_traded),
      governanceActions: Number(row.governance_actions),
    }));
  }

  async latestMetrics(managerId: string): Promise<ManagerMetricsPoint | null> {
    const points = await this.metricsFor(managerId, 0, Number.MAX_SAFE_INTEGER);
    return points.length > 0 ? points[points.length - 1] : null;
  }

  async managerIds(): Promise<string[]> {
    const response = await this.fetchImpl(
      `${this.url}/?query=${encodeURIComponent(
        `SELECT DISTINCT manager_id FROM ${this.database}.${this.table}`,
      )}`,
      { method: "POST" },
    );
    if (!response.ok) {
      throw new Error(`ClickHouse query failed: ${response.status} ${response.statusText}`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    return rows.map((r) => String(r.manager_id));
  }

  async close(): Promise<void> {}
}

function rowToMetricsPoint(row: Record<string, unknown>): ManagerMetricsPoint {
  return {
    managerId: row.manager_id as string,
    timestamp: Number(row.timestamp),
    tvl: Number(row.tvl),
    nav: Number(row.nav),
    feesGenerated: Number(row.fees_generated),
    dailyPnl: Number(row.daily_pnl),
    maxDrawdown: Number(row.max_drawdown),
    volatility: Number(row.volatility),
    protocolsUsed: Number(row.protocols_used),
    poolsTraded: Number(row.pools_traded),
    governanceActions: Number(row.governance_actions),
  };
}
