import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../src/db/repositories.js";
import { InMemoryTimeSeriesStore } from "../src/services/ingestion/timeseries.js";

const DAY = 86_400_000;
const now = Date.now();

describe("leaderboard from real data", () => {
  it("ranks by score and surfaces computed apy/sharpe deterministically", async () => {
    const store = new InMemoryTimeSeriesStore();
    const repos = createMemoryRepositories(store);

    const entries = await repos.managers.leaderboard();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].rank).toBe(1);
    expect(entries[0].score.total).toBeGreaterThanOrEqual(entries[1].score.total);

    const second = await repos.managers.leaderboard();
    expect(entries).toEqual(second);
  });

  it("derives performance series from ingested metrics", async () => {
    const store = new InMemoryTimeSeriesStore();
    await store.appendMetrics([
      { managerId: "mgr_quantum", timestamp: now - 2 * DAY, tvl: 10_000_000, nav: 1, feesGenerated: 1000, dailyPnl: 5000, maxDrawdown: 0.05, volatility: 0.1, protocolsUsed: 4, poolsTraded: 14, governanceActions: 1, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
      { managerId: "mgr_quantum", timestamp: now - DAY, tvl: 11_000_000, nav: 1.05, feesGenerated: 0, dailyPnl: 6000, maxDrawdown: 0.05, volatility: 0.1, protocolsUsed: 4, poolsTraded: 14, governanceActions: 0, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
      { managerId: "mgr_quantum", timestamp: now, tvl: 12_000_000, nav: 1.1, feesGenerated: 0, dailyPnl: 7000, maxDrawdown: 0.05, volatility: 0.1, protocolsUsed: 4, poolsTraded: 14, governanceActions: 0, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
    ]);

    const repos = createMemoryRepositories(store);
    const performance = await repos.managers.performance("mgr_quantum");
    expect(performance).not.toBeNull();
    expect(performance!.series.length).toBe(3);
    expect(performance!.series[2].nav).toBe(1.1);
    expect(performance!.apy).toBeGreaterThan(0);
  });

  it("falls back to a deterministic seed series when no metrics exist", async () => {
    const repos = createMemoryRepositories();
    const performance = await repos.managers.performance("mgr_harbor");
    expect(performance).not.toBeNull();
    expect(performance!.series.length).toBe(91);
  });
});
