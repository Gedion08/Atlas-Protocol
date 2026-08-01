import { describe, expect, it } from "vitest";
import {
  computeDailyReturns,
  computeExpectedShortfall,
  computeHistoricalVaR,
  computeMaxDrawdown,
  computeVolatility,
  evaluateRiskRules,
  evaluateStrategyRisk,
} from "../src/services/risk-engine/index.js";
import type { RiskMetrics } from "atlas-types";

function trendingSeries(n: number): number[] {
  const prices: number[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price *= 1 + (i % 7 === 0 ? -0.03 : 0.005);
    prices.push(price);
  }
  return prices;
}

describe("risk metrics", () => {
  it("computes daily returns", () => {
    const returns = computeDailyReturns([100, 110, 99]);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1);
  });

  it("computes volatility", () => {
    const returns = computeDailyReturns([100, 101, 100, 99, 102, 101]);
    expect(computeVolatility(returns)).toBeGreaterThan(0);
  });

  it("computes VaR and expected shortfall", () => {
    const returns = computeDailyReturns(trendingSeries(250));
    const var95 = computeHistoricalVaR(returns, 0.95);
    const es = computeExpectedShortfall(returns, 0.95);
    expect(var95).toBeGreaterThan(0);
    expect(es).toBeGreaterThanOrEqual(var95);
  });

  it("computes max drawdown", () => {
    expect(computeMaxDrawdown([100, 90, 80])).toBeCloseTo(0.2);
    expect(computeMaxDrawdown([80, 100, 95, 120])).toBeCloseTo(0.05);
  });
});

describe("evaluateRiskRules", () => {
  const healthy: RiskMetrics = {
    var95: 0.01,
    var99: 0.02,
    expectedShortfall: 0.015,
    volatility: 0.1,
    impermanentLoss: 0.01,
    maxDrawdown: 0.05,
    dailyPnl: -0.01,
    weeklyPnl: -0.03,
    poolConcentration: 0.2,
    tokenConcentration: 0.15,
    protocolConcentration: 0.3,
    memecoinConcentration: 0.02,
    stablePoolConcentration: 0.1,
    slippage: 0.002,
    feeDecay: 0.01,
    oracleHealth: 1,
    utilization: 0.8,
    inventoryImbalance: 0.03,
  };

  it("passes healthy managers", () => {
    const decision = evaluateRiskRules(healthy);
    expect(decision.action).toBe("ok");
    expect(decision.violations).toEqual([]);
  });

  it("pauses when drawdown exceeds limit", () => {
    const decision = evaluateRiskRules({ ...healthy, maxDrawdown: 0.25 });
    expect(decision.action).toBe("pause");
    expect(decision.violations.some((v) => v.rule === "max_drawdown")).toBe(true);
  });

  it("reduces on warning-level violations", () => {
    const decision = evaluateRiskRules({ ...healthy, protocolConcentration: 0.45 });
    expect(decision.action).toBe("reduce");
  });

  it("pauses when memecoin exposure exceeds limit", () => {
    const decision = evaluateRiskRules({ ...healthy, memecoinConcentration: 0.35 });
    expect(decision.action).toBe("pause");
    expect(decision.violations.some((v) => v.rule === "memecoin_exposure")).toBe(true);
  });

  it("reduces when stable-pool exposure exceeds limit", () => {
    const decision = evaluateRiskRules({ ...healthy, stablePoolConcentration: 0.3 });
    expect(decision.action).toBe("reduce");
    expect(decision.violations.some((v) => v.rule === "stable_pool_exposure")).toBe(true);
  });

  it("pauses when stable-pool exposure exceeds 1.5x the limit", () => {
    const decision = evaluateRiskRules({ ...healthy, stablePoolConcentration: 0.5 });
    expect(decision.action).toBe("pause");
  });

  it("does not treat positive returns as daily/weekly losses", () => {
    const decision = evaluateRiskRules({ ...healthy, dailyPnl: 0.06, weeklyPnl: 0.2 });
    expect(decision.action).toBe("ok");
    expect(decision.violations).toEqual([]);
  });

  it("flags actual daily losses only", () => {
    const decision = evaluateRiskRules({ ...healthy, dailyPnl: -0.06 });
    expect(decision.violations.some((v) => v.rule === "daily_loss")).toBe(true);
  });

  it("evaluates from a price series", () => {
    const decision = evaluateStrategyRisk(trendingSeries(180), healthy);
    expect(["ok", "reduce", "pause"]).toContain(decision.action);
  });
});
