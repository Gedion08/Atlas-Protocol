import type { ScoreInputs, ScoreResult } from "atlas-types";
import { computeManagerScore, riskTierFromScore } from "../scoring/index.js";
import type { ManagerMetricsPoint, TimeSeriesStore } from "../ingestion/timeseries.js";

/** Composite score at or below which the oracle auto-suspends a manager (registry §3.3). */
export const AUTO_SUSPEND_THRESHOLD = 40;
export const DAY_MS = 86_400_000;

export type OracleAction = "ok" | "pause";

export interface OracleSubmission {
  managerId: string;
  score: ScoreResult;
  riskTier: 1 | 2 | 3 | 4 | 5;
  action: OracleAction;
  period: string;
  submittedAt: number;
}

export interface OracleSubmitter {
  submit(submission: OracleSubmission): Promise<void>;
}

export interface OracleSubmissionStore {
  recordSubmission(submission: OracleSubmission): Promise<void>;
  latestSubmissions(managerId?: string, limit?: number): Promise<OracleSubmission[]>;
}

export interface OracleLoopOptions {
  store: TimeSeriesStore;
  submissions: OracleSubmissionStore;
  submitter?: OracleSubmitter;
  threshold?: number;
  intervalMs?: number;
  onError?: (err: unknown) => void;
}

/** Maps aggregated on-chain metrics into score inputs (spec §3.1 scoring model). */
export function computeScoreInputs(points: ManagerMetricsPoint[]): ScoreInputs {
  const tvls = points.map((p) => p.tvl);
  const maxTvl = Math.max(0, ...tvls);
  const startTvl = points[0]?.tvl ?? 0;
  const endTvl = points[points.length - 1]?.tvl ?? 0;

  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].nav;
    if (prev > 0) returns.push((points[i].nav - prev) / prev);
  }

  const feesGenerated = points.reduce((a, p) => a + p.feesGenerated, 0);
  const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1)
      : 0;
  const volatility = Math.sqrt(variance);

  const drawdowns: number[] = [];
  let peak = 0;
  for (const p of points) {
    peak = Math.max(peak, p.nav);
    if (peak > 0) drawdowns.push((peak - p.nav) / peak);
  }
  const maxDrawdown = drawdowns.length > 0 ? Math.max(0, ...drawdowns) : 0;

  const consistency =
    returns.length > 1 && mean !== 0 ? 1 - variance / Math.abs(mean) : returns.length > 0 ? 1 : 0;
  const tvlGrowth = startTvl > 0 ? (endTvl - startTvl) / startTvl : 0;
  const governance = points.reduce((a, p) => a + p.governanceActions, 0);

  return {
    feeGeneration: capScore(feesGenerated / Math.max(1, maxTvl) * 100),
    risk: capScore(volatility * 100),
    drawdown: capScore(maxDrawdown * 100),
    capitalRetention: capScore(100 - maxDrawdown * 100),
    consistency: capScore(consistency * 100),
    tvlGrowth: capScore(tvlGrowth * 50 + 50),
    governanceParticipation: capScore(governance * 10),
  };
}

export function decideOracleAction(total: number, threshold = AUTO_SUSPEND_THRESHOLD): OracleAction {
  return total <= threshold ? "pause" : "ok";
}

export function buildSubmission(
  managerId: string,
  points: ManagerMetricsPoint[],
  threshold = AUTO_SUSPEND_THRESHOLD,
  now = Date.now(),
): OracleSubmission | null {
  if (points.length === 0) return null;
  const score = computeManagerScore(computeScoreInputs(points));
  return {
    managerId,
    score,
    riskTier: riskTierFromScore(score.total),
    action: decideOracleAction(score.total, threshold),
    period: new Date(points[points.length - 1].timestamp).toISOString().slice(0, 10),
    submittedAt: now,
  };
}

function capScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** No-op submitter: records submissions for observation without sending on-chain. */
export class DryRunSubmitter implements OracleSubmitter {
  readonly sent: OracleSubmission[] = [];

  async submit(submission: OracleSubmission): Promise<void> {
    this.sent.push(submission);
  }
}

/**
 * Background loop that recomputes manager scores from ingested metrics on a
 * cadence and records submissions (dry-run or relayed on-chain by a signer).
 */
export class OracleLoop {
  private timer: NodeJS.Timeout | null = null;
  private readonly threshold: number;
  private readonly intervalMs: number;
  private readonly onError: (err: unknown) => void;

  constructor(private readonly options: OracleLoopOptions) {
    this.threshold = options.threshold ?? AUTO_SUSPEND_THRESHOLD;
    this.intervalMs = options.intervalMs ?? 3_600_000;
    this.onError = options.onError ?? ((err) => console.error("oracle loop error", err));
  }

  start(): void {
    if (this.timer) return;
    void this.tick().catch(this.onError);
    this.timer = setInterval(() => void this.tick().catch(this.onError), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<OracleSubmission[]> {
    const { store, submissions, submitter } = this.options;
    const managerIds = await store.managerIds();
    const results: OracleSubmission[] = [];

    for (const managerId of managerIds) {
      const points = await store.metricsFor(managerId, 0, Date.now());
      const submission = buildSubmission(managerId, points, this.threshold);
      if (!submission) continue;
      await submissions.recordSubmission(submission);
      if (submitter) await submitter.submit(submission);
      results.push(submission);
    }
    return results;
  }
}

export function isOracleAction(value: string): value is OracleAction {
  return value === "ok" || value === "pause";
}

/** Export alias for memory-backed submissions tracking across the app. */
export class InMemoryOracleSubmissionStore implements OracleSubmissionStore {
  private records: OracleSubmission[] = [];

  async recordSubmission(submission: OracleSubmission): Promise<void> {
    this.records.push(submission);
  }

  async latestSubmissions(managerId?: string, limit = 20): Promise<OracleSubmission[]> {
    const filtered = managerId
      ? this.records.filter((s) => s.managerId === managerId)
      : this.records;
    return filtered.slice(-limit).reverse();
  }
}
