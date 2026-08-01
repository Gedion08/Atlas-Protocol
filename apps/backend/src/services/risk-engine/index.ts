import type { RiskDecision, RiskMetrics, RiskRuleViolation } from "atlas-types";

export type { RiskDecision } from "atlas-types";

export interface RiskLimits {
  maxDrawdown: number;
  dailyLoss: number;
  weeklyLoss: number;
  maxPerManager: number;
  maxPerProtocol: number;
  maxPerToken: number;
  maxMemecoins: number;
  maxStablePools: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxDrawdown: 0.15,
  dailyLoss: 0.05,
  weeklyLoss: 0.1,
  maxPerManager: 0.3,
  maxPerProtocol: 0.4,
  maxPerToken: 0.2,
  maxMemecoins: 0.1,
  maxStablePools: 0.25,
};

export function computeDailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev === 0) continue;
    returns.push((prices[i] - prev) / prev);
  }
  return returns;
}

export function computeVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

export function computeHistoricalVaR(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.max(0, Math.floor(sorted.length * (1 - confidence)) - 1);
  return -sorted[index];
}

export function computeExpectedShortfall(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const tailCount = Math.max(1, Math.floor(sorted.length * (1 - confidence)));
  const tail = sorted.slice(0, tailCount);
  return -tail.reduce((a, b) => a + b, 0) / tail.length;
}

export function computeVaR(returns: number[], confidence = 0.95): number {
  return computeHistoricalVaR(returns, confidence);
}

export function computeMaxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;
  let peak = prices[0];
  let maxDrawdown = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    if (price < peak) {
      maxDrawdown = Math.max(maxDrawdown, (peak - price) / peak);
    }
  }
  return maxDrawdown;
}

function violation(rule: string, limit: number, current: number): RiskRuleViolation | null {
  if (current <= limit) return null;
  return {
    rule,
    limit,
    current,
    severity: current > limit * 1.5 ? "critical" : "warning",
  };
}

export function evaluateRiskRules(
  metrics: RiskMetrics,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): RiskDecision {
  const violations: RiskRuleViolation[] = [
    violation("max_drawdown", limits.maxDrawdown, metrics.maxDrawdown),
    violation("daily_loss", limits.dailyLoss, Math.max(0, -metrics.dailyPnl)),
    violation("weekly_loss", limits.weeklyLoss, Math.max(0, -metrics.weeklyPnl)),
    violation("max_per_manager", limits.maxPerManager, metrics.poolConcentration),
    violation("max_per_protocol", limits.maxPerProtocol, metrics.protocolConcentration),
    violation("max_per_token", limits.maxPerToken, metrics.tokenConcentration),
    violation("memecoin_exposure", limits.maxMemecoins, metrics.memecoinConcentration),
    violation("stable_pool_exposure", limits.maxStablePools, metrics.stablePoolConcentration),
  ].filter((v): v is RiskRuleViolation => v !== null);

  const critical = violations.some((v) => v.severity === "critical");
  const action = critical ? "pause" : violations.length > 0 ? "reduce" : "ok";

  const score = Math.max(
    0,
    100 -
      violations.reduce((acc, v) => acc + (v.severity === "critical" ? 40 : 20), 0),
  );

  return { action, violations, score, evaluatedAt: Date.now() };
}

export function evaluateStrategyRisk(
  prices: number[],
  metrics: Omit<RiskMetrics, "var95" | "var99" | "expectedShortfall" | "volatility" | "maxDrawdown">,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
): RiskDecision {
  const returns = computeDailyReturns(prices);
  const full: RiskMetrics = {
    ...metrics,
    var95: computeVaR(returns, 0.95),
    var99: computeVaR(returns, 0.99),
    expectedShortfall: computeExpectedShortfall(returns, 0.95),
    volatility: computeVolatility(returns),
    maxDrawdown: computeMaxDrawdown(prices),
  };
  return evaluateRiskRules(full, limits);
}
