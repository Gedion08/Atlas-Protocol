import { describe, expect, it } from "vitest";
import type { AtlasEvent } from "../src/services/indexer/helius.js";
import { MetricsAggregator } from "../src/services/ingestion/aggregator.js";
import { InMemoryTimeSeriesStore } from "../src/services/ingestion/timeseries.js";
import { computeScoreInputs, buildSubmission, decideOracleAction, OracleLoop, InMemoryOracleSubmissionStore, DryRunSubmitter, AUTO_SUSPEND_THRESHOLD } from "../src/services/oracle/index.js";

const DAY = 86_400_000;
const now = Date.now();

function event(partial: Partial<AtlasEvent> & Pick<AtlasEvent, "type" | "managerId" | "signature">): AtlasEvent {
  return {
    timestamp: now,
    slot: 1,
    vaultAddress: "vault",
    payload: {},
    ...partial,
  };
}

describe("MetricsAggregator", () => {
  it("aggregates deposits, fees and pools into daily points", async () => {
    const store = new InMemoryTimeSeriesStore();
    const aggregator = new MetricsAggregator(store);

    await aggregator.ingest([
      event({ type: "deposit", managerId: "m1", signature: "s1", payload: { amount: 1000 } }),
      event({ type: "deposit", managerId: "m1", signature: "s2", payload: { amount: 500 } }),
      event({ type: "fee_collected", managerId: "m1", signature: "s3", payload: { amount: 25 } }),
      event({ type: "position_open", managerId: "m1", signature: "s4", payload: { pool: "SOL-USDC", protocol: "meteora" } }),
    ]);

    expect(aggregator.pendingBucketCount).toBe(1);
    const points = await aggregator.flush();
    expect(points).toHaveLength(1);
    expect(points[0].tvl).toBe(1500);
    expect(points[0].feesGenerated).toBe(25);
    expect(points[0].poolsTraded).toBe(1);
    expect(points[0].protocolsUsed).toBe(1);
    expect(aggregator.pendingBucketCount).toBe(0);
  });

  it("separates buckets by manager and day", async () => {
    const store = new InMemoryTimeSeriesStore();
    const aggregator = new MetricsAggregator(store);

    await aggregator.ingest([
      event({ type: "deposit", managerId: "m1", signature: "a", timestamp: now, payload: { amount: 100 } }),
      event({ type: "deposit", managerId: "m2", signature: "b", timestamp: now, payload: { amount: 200 } }),
      event({ type: "deposit", managerId: "m1", signature: "c", timestamp: now - DAY - 1, payload: { amount: 300 } }),
    ]);

    const points = await aggregator.flush();
    expect(points).toHaveLength(3);
  });

  it("persists flushed points to the store", async () => {
    const store = new InMemoryTimeSeriesStore();
    const aggregator = new MetricsAggregator(store);

    await aggregator.ingest([
      event({ type: "deposit", managerId: "m1", signature: "a", payload: { amount: 1000 } }),
    ]);
    await aggregator.flush();

    const ids = await store.managerIds();
    expect(ids).toEqual(["m1"]);
    expect(await store.latestMetrics("m1")).not.toBeNull();
  });
});

describe("oracle scoring", () => {
  it("derives score inputs from real metric series", () => {
    const points = [
      { managerId: "m1", timestamp: now - 2 * DAY, tvl: 1_000_000, nav: 1, feesGenerated: 5000, dailyPnl: 10_000, maxDrawdown: 0.05, volatility: 0.08, protocolsUsed: 3, poolsTraded: 5, governanceActions: 2, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
      { managerId: "m1", timestamp: now - DAY, tvl: 1_100_000, nav: 1.05, feesGenerated: 0, dailyPnl: 15_000, maxDrawdown: 0.05, volatility: 0.08, protocolsUsed: 3, poolsTraded: 6, governanceActions: 0, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
      { managerId: "m1", timestamp: now, tvl: 1_200_000, nav: 1.1, feesGenerated: 0, dailyPnl: 12_000, maxDrawdown: 0.05, volatility: 0.08, protocolsUsed: 3, poolsTraded: 6, governanceActions: 1, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
    ];

    const inputs = computeScoreInputs(points);
    expect(inputs.tvlGrowth).toBeGreaterThan(50);
    expect(inputs.risk).toBeGreaterThan(0);
    expect(inputs.capitalRetention).toBeGreaterThan(90);

    const submission = buildSubmission("m1", points);
    expect(submission).not.toBeNull();
    expect(submission!.score.total).toBeGreaterThan(0);
    expect(submission!.action).toBe("ok");
  });

  it("auto-pauses managers at or below the suspend threshold", () => {
    expect(decideOracleAction(AUTO_SUSPEND_THRESHOLD)).toBe("pause");
    expect(decideOracleAction(AUTO_SUSPEND_THRESHOLD + 1)).toBe("ok");
  });

  it("returns null when a manager has no data", () => {
    expect(buildSubmission("m1", [])).toBeNull();
  });

  it("runs a loop tick over managers in the store", async () => {
    const store = new InMemoryTimeSeriesStore();
    await store.appendMetrics([
      { managerId: "m1", timestamp: now - DAY, tvl: 1_000_000, nav: 1, feesGenerated: 100, dailyPnl: 100, maxDrawdown: 0.1, volatility: 0.2, protocolsUsed: 2, poolsTraded: 3, governanceActions: 0, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
      { managerId: "m1", timestamp: now, tvl: 1_010_000, nav: 1.01, feesGenerated: 0, dailyPnl: 100, maxDrawdown: 0.1, volatility: 0.2, protocolsUsed: 2, poolsTraded: 3, governanceActions: 0, poolConcentration: 0, tokenConcentration: 0, protocolConcentration: 0, memecoinConcentration: 0, stablePoolConcentration: 0, slippage: 0, feeDecay: 0, oracleHealth: 0, utilization: 0, inventoryImbalance: 0 },
    ]);

    const submissions = new InMemoryOracleSubmissionStore();
    const submitter = new DryRunSubmitter();
    const loop = new OracleLoop({ store, submissions, submitter });

    const results = await loop.tick();
    expect(results).toHaveLength(1);
    expect(results[0].managerId).toBe("m1");
    expect(submitter.sent).toHaveLength(1);
    expect((await submissions.latestSubmissions("m1")).length).toBe(1);
  });

  it("is a no-op when the store has no managers", async () => {
    const store = new InMemoryTimeSeriesStore();
    const loop = new OracleLoop({
      store,
      submissions: new InMemoryOracleSubmissionStore(),
      submitter: new DryRunSubmitter(),
    });
    expect(await loop.tick()).toHaveLength(0);
  });
});
