import type { ScoreInputs, ScoreResult, ScoreWeights } from "atlas-types";

export const SCORE_WEIGHTS: ScoreWeights = {
  feeGeneration: 0.3,
  risk: 0.2,
  drawdown: 0.15,
  capitalRetention: 0.1,
  consistency: 0.1,
  tvlGrowth: 0.1,
  governanceParticipation: 0.05,
};

export const MAX_SCORE = 100;

function clamp(value: number, min = 0, max = MAX_SCORE): number {
  return Math.min(max, Math.max(min, value));
}

export function assertValidInputs(inputs: ScoreInputs): void {
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`Invalid score input: ${key} is not a number`);
    }
  }
}

export function computeManagerScore(inputs: ScoreInputs): ScoreResult {
  assertValidInputs(inputs);

  const riskSubscore = clamp(MAX_SCORE - inputs.risk, 0, MAX_SCORE);
  const drawdownSubscore = clamp(MAX_SCORE - inputs.drawdown, 0, MAX_SCORE);

  const breakdown = {
    feeGeneration: clamp(inputs.feeGeneration),
    risk: riskSubscore,
    drawdown: drawdownSubscore,
    capitalRetention: clamp(inputs.capitalRetention),
    consistency: clamp(inputs.consistency),
    tvlGrowth: clamp(inputs.tvlGrowth),
    governanceParticipation: clamp(inputs.governanceParticipation),
  };

  const total = Math.round(
    breakdown.feeGeneration * SCORE_WEIGHTS.feeGeneration +
      breakdown.risk * SCORE_WEIGHTS.risk +
      breakdown.drawdown * SCORE_WEIGHTS.drawdown +
      breakdown.capitalRetention * SCORE_WEIGHTS.capitalRetention +
      breakdown.consistency * SCORE_WEIGHTS.consistency +
      breakdown.tvlGrowth * SCORE_WEIGHTS.tvlGrowth +
      breakdown.governanceParticipation * SCORE_WEIGHTS.governanceParticipation,
  );

  return { total, breakdown, weights: SCORE_WEIGHTS };
}

export function riskTierFromScore(total: number): 1 | 2 | 3 | 4 | 5 {
  if (total >= 85) return 1;
  if (total >= 70) return 2;
  if (total >= 55) return 3;
  if (total >= 40) return 4;
  return 5;
}
