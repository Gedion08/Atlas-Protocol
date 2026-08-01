import { describe, expect, it } from "vitest";
import {
  analyzeDlmm,
  binPrice,
  estimateBinCount,
  type DlmmSnapshot,
} from "../src/services/analytics/dlmms.js";

const snapshot: DlmmSnapshot = {
  pool: "BTC-SOL",
  binStep: 40,
  timestamp: 1_700_000_000_000,
  bins: [
    { binId: -3, baseAmount: 100, quoteAmount: 0 },
    { binId: -2, baseAmount: 200, quoteAmount: 0 },
    { binId: -1, baseAmount: 400, quoteAmount: 0 },
    { binId: 0, baseAmount: 300, quoteAmount: 300, active: true },
    { binId: 1, baseAmount: 0, quoteAmount: 400 },
    { binId: 2, baseAmount: 0, quoteAmount: 200 },
    { binId: 3, baseAmount: 0, quoteAmount: 100 },
  ],
};

describe("DLMM analytics", () => {
  it("estimates bin counts from the bin step", () => {
    expect(estimateBinCount(40)).toBe(63);
    expect(estimateBinCount(0)).toBe(0);
  });

  it("prices bins exponentially from the bin step", () => {
    expect(binPrice(0, 40)).toBe(1);
    expect(binPrice(2, 40)).toBeCloseTo(Math.pow(1.004, 2));
  });

  it("detects the active bin and its position", () => {
    const analytics = analyzeDlmm(snapshot);
    expect(analytics.activeBin).toBe(0);
    expect(analytics.activeBinPct).toBeCloseTo(50);
    expect(analytics.totalBins).toBe(7);
  });

  it("measures liquidity concentration and inventory skew", () => {
    const analytics = analyzeDlmm(snapshot);
    expect(analytics.totalValue).toBeGreaterThan(0);
    expect(analytics.topDecileConcentration).toBeGreaterThan(0);
    expect(analytics.halfLiquidityBins).toBeGreaterThan(0);
    expect(analytics.inventorySkew).toBeGreaterThanOrEqual(0);
  });

  it("handles empty and fully-imbalanced pools", () => {
    const empty = analyzeDlmm({ ...snapshot, bins: [] });
    expect(empty.totalBins).toBe(0);
    expect(empty.activeBin).toBeNull();

    const oneSided = analyzeDlmm({ ...snapshot, bins: snapshot.bins.map((b) => ({ ...b, quoteAmount: 0 })) });
    expect(oneSided.inventorySkew).toBe(1);
  });
});
