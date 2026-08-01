import { describe, expect, it } from "vitest";
import {
  annualized,
  computePerfMetrics,
  dailyReturns,
  maxDrawdown,
  ulcerIndex,
  winRate,
} from "../src/services/perf-metrics/index.js";

describe("perf metrics", () => {
  it("computes daily returns between NAV points", () => {
    expect(dailyReturns([100, 110, 99])).toHaveLength(2);
    expect(dailyReturns([100, 110, 99])[0]).toBeCloseTo(0.1);
  });

  it("annualizes a mean daily return", () => {
    expect(annualized(0.001)).toBeCloseTo(0.365);
  });

  it("computes max drawdown from the running peak", () => {
    expect(maxDrawdown([100, 90, 80])).toBeCloseTo(0.2);
    expect(maxDrawdown([80, 100, 95, 120])).toBeCloseTo(0.05);
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });

  it("computes the ulcer index as RMS of drawdowns", () => {
    expect(ulcerIndex([100, 90])).toBeCloseTo(0.0707);
    expect(ulcerIndex([100, 100, 100])).toBe(0);
  });

  it("computes win rate", () => {
    expect(winRate([0.01, -0.01, 0.02, 0])).toBeCloseTo(0.5);
    expect(winRate([])).toBe(0);
  });

  it("computes the full suite on a trending series", () => {
    const navs: number[] = [];
    let nav = 100;
    for (let i = 0; i < 180; i++) {
      nav *= i % 10 === 5 ? 0.96 : 1.006;
      navs.push(nav);
    }
    const metrics = computePerfMetrics(navs, 0.05);

    expect(metrics.apy).toBeGreaterThan(0);
    expect(metrics.sharpe).toBeGreaterThan(0);
    expect(metrics.sortino).toBeGreaterThan(metrics.sharpe);
    expect(metrics.calmar).toBeGreaterThan(0);
    expect(metrics.ulcerIndex).toBeGreaterThan(0);
    expect(metrics.winRate).toBeGreaterThan(0.5);
    expect(metrics.recoveryFactor).toBeGreaterThan(0);
    expect(metrics.capitalEfficiency).toBe(0.05);
    expect(metrics.maxDrawdown).toBeGreaterThan(0.02);
  });

  it("returns zeros for a flat or single-point series", () => {
    const flat = computePerfMetrics([100, 100, 100]);
    expect(flat.sharpe).toBe(0);
    expect(flat.maxDrawdown).toBe(0);
    expect(flat.winRate).toBe(0);

    const single = computePerfMetrics([100]);
    expect(single.apy).toBe(0);
    expect(single.sharpe).toBe(0);
  });

  it("distinguishes downside deviation from total volatility", () => {
    const trend = Array.from({ length: 200 }, (_, i) => 100 * (1 + i * 0.001));
    const metrics = computePerfMetrics(trend);
    expect(metrics.volatility).toBeCloseTo(0);
    expect(metrics.downsideDeviation).toBe(0);
  });
});
