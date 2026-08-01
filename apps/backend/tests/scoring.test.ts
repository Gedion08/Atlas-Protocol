import { describe, expect, it } from "vitest";
import { computeManagerScore, SCORE_WEIGHTS, riskTierFromScore } from "../src/services/scoring/index.js";

describe("computeManagerScore", () => {
  it("computes a weighted total between 0 and 100", () => {
    const result = computeManagerScore({
      feeGeneration: 80,
      risk: 20,
      drawdown: 15,
      capitalRetention: 90,
      consistency: 85,
      tvlGrowth: 70,
      governanceParticipation: 60,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.weights).toEqual(SCORE_WEIGHTS);
  });

  it("inverts risk and drawdown subscores", () => {
    const result = computeManagerScore({
      feeGeneration: 50,
      risk: 100,
      drawdown: 100,
      capitalRetention: 50,
      consistency: 50,
      tvlGrowth: 50,
      governanceParticipation: 50,
    });
    expect(result.breakdown.risk).toBe(0);
    expect(result.breakdown.drawdown).toBe(0);
  });

  it("maxes at 100 for perfect inputs", () => {
    const result = computeManagerScore({
      feeGeneration: 100,
      risk: 0,
      drawdown: 0,
      capitalRetention: 100,
      consistency: 100,
      tvlGrowth: 100,
      governanceParticipation: 100,
    });
    expect(result.total).toBe(100);
  });

  it("rejects non-numeric inputs", () => {
    expect(() =>
      computeManagerScore({
        feeGeneration: NaN,
        risk: 10,
        drawdown: 10,
        capitalRetention: 10,
        consistency: 10,
        tvlGrowth: 10,
        governanceParticipation: 10,
      }),
    ).toThrow();
  });
});

describe("riskTierFromScore", () => {
  it("maps score ranges to tiers", () => {
    expect(riskTierFromScore(90)).toBe(1);
    expect(riskTierFromScore(75)).toBe(2);
    expect(riskTierFromScore(60)).toBe(3);
    expect(riskTierFromScore(45)).toBe(4);
    expect(riskTierFromScore(20)).toBe(5);
  });
});
