import { describe, expect, it } from "vitest";
import { analyzeDlmm, estimateBinCount, binPrice, ClickHouseDlmmAnalyticsStore } from "../src/services/analytics/dlmm.js";

describe("DLMM analytics", () => {
  it("estimates bin count from bin step", () => {
    expect(estimateBinCount(10)).toBeGreaterThan(0);
    expect(estimateBinCount(0)).toBe(0);
  });

  it("computes monotonic bin prices", () => {
    expect(binPrice(0, 10)).toBeCloseTo(1, 6);
    expect(binPrice(1, 10)).toBeGreaterThan(binPrice(0, 10));
  });

  it("analyzes a simple DLMM snapshot", () => {
    const snapshot = {
      strategyId: "str_1",
      pool: "SOL-USDC",
      pair: "SOL/USDC",
      protocol: "meteora",
      binStep: 10,
      bins: [
        { binId: 0, baseAmount: 1000, quoteAmount: 0, active: true },
        { binId: 1, baseAmount: 500, quoteAmount: 500, active: true },
        { binId: 2, baseAmount: 0, quoteAmount: 1000, active: true },
      ],
      timestamp: Date.now(),
    };

    const analytics = analyzeDlmm(snapshot);
    expect(analytics.strategyId).toBe("str_1");
    expect(analytics.totalBins).toBe(3);
    expect(analytics.activeBin).toBe(0);
    expect(analytics.activeBinPct).toBeCloseTo(0, 5);
    expect(analytics.totalValue).toBeGreaterThan(0);
    expect(analytics.inventorySkew).toBeGreaterThan(0);
    expect(analytics.topDecileConcentration).toBeGreaterThan(0);
    expect(analytics.halfLiquidityBins).toBeGreaterThan(0);
  });

  it("returns zeros for empty bins", () => {
    const analytics = analyzeDlmm({
      strategyId: "str_empty",
      pool: "TEST",
      pair: "TEST/TEST",
      protocol: "meteora",
      binStep: 10,
      bins: [],
      timestamp: Date.now(),
    });

    expect(analytics.totalBins).toBe(0);
    expect(analytics.activeBin).toBeNull();
    expect(analytics.totalValue).toBe(0);
  });
});

describe("ClickHouseDlmmAnalyticsStore", () => {
  it("is constructable with default options", () => {
    const store = new ClickHouseDlmmAnalyticsStore("http://localhost:8123");
    expect(store).toBeDefined();
  });
});
