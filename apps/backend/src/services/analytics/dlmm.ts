import type { Strategy } from "atlas-types";

export interface BinState {
  binId: number;
  baseAmount: number;
  quoteAmount: number;
  active?: boolean;
}

export interface DlmmSnapshot {
  strategyId: string;
  pool: string;
  pair: string;
  protocol: string;
  binStep: number;
  bins: BinState[];
  timestamp: number;
  feePerActiveBin?: number;
  priceDrift?: number;
}

export interface DlmmAnalytics {
  strategyId: string;
  pool: string;
  pair: string;
  protocol: string;
  timestamp: number;
  totalBins: number;
  activeBin: number | null;
  activeBinPct: number;
  topDecileConcentration: number;
  halfLiquidityBins: number;
  inventorySkew: number;
  totalValue: number;
  binCrossingFrequency: number;
  rebalanceFrequency: number;
  feePerActiveBin: number;
  priceDrift: number;
}

const PROTOCOL_FEE_BPS = 25;
const DEFAULT_SKIP_BPS = 120;

export function estimateBinCount(binStep: number): number {
  if (binStep <= 0) return 0;
  const skip = (DEFAULT_SKIP_BPS + binStep) / binStep;
  return Math.max(1, Math.round(10_000 / (binStep * skip)));
}

export function binPrice(binId: number, binStep: number): number {
  return Math.pow(1 + binStep / 10_000, binId);
}

function binValue(bin: BinState, binStep: number): number {
  const price = binPrice(bin.binId, binStep);
  return bin.baseAmount * price + bin.quoteAmount;
}

export function analyzeDlmm(snapshot: DlmmSnapshot): DlmmAnalytics {
  const bins = snapshot.bins
    .filter((b) => b.baseAmount > 0 || b.quoteAmount > 0)
    .sort((a, b) => a.binId - b.binId);
  const totalBins = bins.length;

  if (totalBins === 0) {
    return {
      strategyId: snapshot.strategyId,
      pool: snapshot.pool,
      pair: snapshot.pair,
      protocol: snapshot.protocol,
      timestamp: snapshot.timestamp,
      totalBins: 0,
      activeBin: null,
      activeBinPct: 0,
      topDecileConcentration: 0,
      halfLiquidityBins: 0,
      inventorySkew: 0,
      totalValue: 0,
      binCrossingFrequency: 0,
      rebalanceFrequency: 0,
      feePerActiveBin: snapshot.feePerActiveBin ?? 0,
      priceDrift: snapshot.priceDrift ?? 0,
    };
  }

  const values = bins.map((b) => binValue(b, snapshot.binStep));
  const totalValue = values.reduce((a, b) => a + b, 0);

  const activeBin =
    bins.find((b) => b.active) ??
    bins.find((b) => b.baseAmount > 0 && b.quoteAmount > 0) ??
    null;
  const activeIndex = activeBin ? bins.indexOf(activeBin) : -1;
  const activeBinPct = activeIndex >= 0 ? (activeIndex / Math.max(1, totalBins - 1)) * 100 : 0;

  const sortedValues = [...values].sort((a, b) => b - a);
  const topDecileCount = Math.max(1, Math.ceil(totalBins / 10));
  const topDecileValue = sortedValues.slice(0, topDecileCount).reduce((a, b) => a + b, 0);
  const topDecileConcentration = topDecileValue / Math.max(1, totalValue);

  let accumulated = 0;
  let halfLiquidityBins = 0;
  for (const value of sortedValues) {
    accumulated += value;
    halfLiquidityBins += 1;
    if (accumulated >= totalValue / 2) break;
  }

  let inventorySkew = 0;
  if (activeBin) {
    const price = binPrice(activeBin.binId, snapshot.binStep);
    const baseValue = activeBin.baseAmount * price;
    const quoteValue = activeBin.quoteAmount;
    inventorySkew =
      (baseValue + quoteValue) > 0
        ? Math.abs(baseValue - quoteValue) / (baseValue + quoteValue)
        : 0;
  }

  return {
    strategyId: snapshot.strategyId,
    pool: snapshot.pool,
    pair: snapshot.pair,
    protocol: snapshot.protocol,
    timestamp: snapshot.timestamp,
    totalBins,
    activeBin: activeBin?.binId ?? null,
    activeBinPct,
    topDecileConcentration,
    halfLiquidityBins,
    inventorySkew,
    totalValue,
    binCrossingFrequency: 0,
    rebalanceFrequency: 0,
    feePerActiveBin: snapshot.feePerActiveBin ?? 0,
    priceDrift: snapshot.priceDrift ?? 0,
  };
}

export interface DlmmAnalyticsStore {
  append(analytics: DlmmAnalytics): Promise<void>;
  latestForStrategy(strategyId: string): Promise<DlmmAnalytics | null>;
  historyForStrategy(strategyId: string, from: number, to: number): Promise<DlmmAnalytics[]>;
}

export class ClickHouseDlmmAnalyticsStore implements DlmmAnalyticsStore {
  constructor(
    private readonly url: string,
    private readonly database = "atlas",
    private readonly table = "bin_activity",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get endpoint(): string {
    return `${this.url}/?query=${encodeURIComponent(
      `INSERT INTO ${this.database}.${this.table} FORMAT JSONEachRow`,
    )}`;
  }

  async append(analytics: DlmmAnalytics): Promise<void> {
    const body = JSON.stringify({
      timestamp: new Date(analytics.timestamp).toISOString().slice(0, 19).replace("T", " "),
      strategy_id: analytics.strategyId,
      protocol: analytics.protocol,
      active_bins: analytics.activeBinPct > 0 ? 1 : 0,
      total_bins: analytics.totalBins,
      bin_distribution: JSON.stringify({
        activeBinPct: analytics.activeBinPct,
        topDecileConcentration: analytics.topDecileConcentration,
        halfLiquidityBins: analytics.halfLiquidityBins,
      }),
      bin_crossing_frequency: analytics.binCrossingFrequency,
      rebalance_frequency: analytics.rebalanceFrequency,
      fee_per_active_bin: analytics.feePerActiveBin,
      inventory_skew: analytics.inventorySkew,
      price_drift: analytics.priceDrift,
    });

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      throw new Error(`ClickHouse bin_activity insert failed: ${response.status} ${response.statusText}`);
    }
  }

  async latestForStrategy(strategyId: string): Promise<DlmmAnalytics | null> {
    const query = `SELECT * FROM ${this.database}.${this.table} WHERE strategy_id = '${strategyId}' ORDER BY timestamp DESC LIMIT 1`;
    const response = await this.fetchImpl(`${this.url}/?query=${encodeURIComponent(query)}`, {
      method: "POST",
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    return rowToAnalytics(rows[0]);
  }

  async historyForStrategy(strategyId: string, from: number, to: number): Promise<DlmmAnalytics[]> {
    const fromStr = new Date(from).toISOString().slice(0, 19).replace("T", " ");
    const toStr = new Date(to).toISOString().slice(0, 19).replace("T", " ");
    const query = `SELECT * FROM ${this.database}.${this.table} WHERE strategy_id = '${strategyId}' AND timestamp >= '${fromStr}' AND timestamp <= '${toStr}' ORDER BY timestamp ASC`;
    const response = await this.fetchImpl(`${this.url}/?query=${encodeURIComponent(query)}`, {
      method: "POST",
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as Record<string, unknown>[];
    return rows.map(rowToAnalytics);
  }
}

function rowToAnalytics(row: Record<string, unknown>): DlmmAnalytics {
  let distribution: Record<string, number> = {};
  try {
    distribution = JSON.parse(row.bin_distribution as string) as Record<string, number>;
  } catch {
    // ignore parse errors
  }
  return {
    strategyId: String(row.strategy_id),
    pool: String(row.pool ?? ""),
    pair: String(row.pair ?? ""),
    protocol: String(row.protocol ?? ""),
    timestamp: new Date(row.timestamp as string).getTime(),
    totalBins: Number(row.total_bins),
    activeBin: null,
    activeBinPct: distribution.activeBinPct ?? 0,
    topDecileConcentration: distribution.topDecileConcentration ?? 0,
    halfLiquidityBins: distribution.halfLiquidityBins ?? 0,
    inventorySkew: Number(row.inventory_skew ?? 0),
    totalValue: 0,
    binCrossingFrequency: Number(row.bin_crossing_frequency ?? 0),
    rebalanceFrequency: Number(row.rebalance_frequency ?? 0),
    feePerActiveBin: Number(row.fee_per_active_bin ?? 0),
    priceDrift: Number(row.price_drift ?? 0),
  };
}
