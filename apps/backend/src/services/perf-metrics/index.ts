export interface PerfMetrics {
  /** Annualized simple return (mean daily return × 365). */
  apy: number;
  /** Annualized Sharpe: mean/std of daily returns × √365. */
  sharpe: number;
  /** Annualized Sortino: mean/downside deviation × √365. */
  sortino: number;
  /** Calmar: annualized return ÷ max drawdown. */
  calmar: number;
  /** Ulcer index: RMS of drawdowns from running peak. */
  ulcerIndex: number;
  /** Fraction of days with positive return. */
  winRate: number;
  /** Recovery factor: cumulative return ÷ max drawdown. */
  recoveryFactor: number;
  /** Capital efficiency: fees generated ÷ average TVL. */
  capitalEfficiency: number;
  maxDrawdown: number;
  volatility: number;
  downsideDeviation: number;
}

const DAYS_PER_YEAR = 365;

/** Simple annualization of a mean daily return. */
export function annualized(meanDaily: number): number {
  return meanDaily * DAYS_PER_YEAR;
}

/** Max drawdown of a NAV series (0 if flat/up-only). */
export function maxDrawdown(navs: number[]): number {
  let peak = 0;
  let worst = 0;
  for (const nav of navs) {
    peak = Math.max(peak, nav);
    if (peak > 0) worst = Math.max(worst, (peak - nav) / peak);
  }
  return worst;
}

export function dailyReturns(navs: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < navs.length; i++) {
    const prev = navs[i - 1];
    if (prev > 0) returns.push((navs[i] - prev) / prev);
  }
  return returns;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[], sampleMean = mean(values)): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, r) => acc + (r - sampleMean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function downsideDeviation(returns: number[], target = 0): number {
  if (returns.length < 2) return 0;
  const downside = returns.filter((r) => r < target);
  if (downside.length === 0) return 0;
  return Math.sqrt(
    downside.reduce((acc, r) => acc + (r - target) ** 2, 0) / (returns.length - 1),
  );
}

/** RMS of drawdowns from the running peak (ulcer index of the NAV series). */
export function ulcerIndex(navs: number[]): number {
  if (navs.length < 2) return 0;
  let peak = 0;
  let sumSquares = 0;
  for (const nav of navs) {
    peak = Math.max(peak, nav);
    if (peak > 0) sumSquares += ((peak - nav) / peak) ** 2;
  }
  return Math.sqrt(sumSquares / navs.length);
}

export function winRate(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.filter((r) => r > 0).length / returns.length;
}

/**
 * Full performance suite over a NAV series (spec §2.1 "Performance Oracle").
 * `capitalEfficiency` is supplied separately (fees ÷ average TVL).
 */
export function computePerfMetrics(
  navs: number[],
  capitalEfficiency = 0,
): PerfMetrics {
  const returns = dailyReturns(navs);
  const meanReturn = mean(returns);
  const volatility = std(returns, meanReturn);
  const dd = maxDrawdown(navs);
  const downside = downsideDeviation(returns);
  const annualizedReturn = annualized(meanReturn);

  return {
    apy: annualizedReturn,
    sharpe: volatility > 0 ? (meanReturn / volatility) * Math.sqrt(DAYS_PER_YEAR) : 0,
    sortino: downside > 0 ? (meanReturn / downside) * Math.sqrt(DAYS_PER_YEAR) : 0,
    calmar: dd > 0 ? annualizedReturn / dd : 0,
    ulcerIndex: ulcerIndex(navs),
    winRate: winRate(returns),
    recoveryFactor: dd > 0 ? annualizedReturn / dd : 0,
    capitalEfficiency,
    maxDrawdown: dd,
    volatility,
    downsideDeviation: downside,
  };
}
