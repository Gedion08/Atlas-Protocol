/** Meteora DLMM bin analytics (roadmap §Phase 2): bin distribution, active bin
 * behaviour, crossing/rebalance frequency and inventory skew from bin snapshots. */

export interface BinState {
  /** Bin index (price = binStep compounding). */
  binId: number;
  /** Amount of base token in the bin. */
  baseAmount: number;
  /** Amount of quote token in the bin. */
  quoteAmount: number;
  /** Bin is active when it contains both tokens (price sits inside it). */
  active?: boolean;
}

export interface DlmmSnapshot {
  pool: string;
  /** Bin step in bps (price = 1 + binStep / 10_000 per bin). */
  binStep: number;
  bins: BinState[];
  /** Timestamp in ms. */
  timestamp: number;
}

export interface DlmmAnalytics {
  pool: string;
  timestamp: number;
  totalBins: number;
  activeBin: number | null;
  activeBinPct: number;
  /** Liquidity distribution: share of total value locked in the top-10% of bins. */
  topDecileConcentration: number;
  /** Share of bins carrying ≥ 50% of total liquidity. */
  halfLiquidityBins: number;
  /** Inventory skew: |baseValue - quoteValue| / totalValue in the active bin. */
  inventorySkew: number;
  totalValue: number;
}

const PROTOCOL_FEE_BPS = 25;
const DEFAULT_SKIP_BPS = 120;

/** Estimated bin count for a full DLMM range given the bin step. */
export function estimateBinCount(binStep: number): number {
  if (binStep <= 0) return 0;
  const skip = (DEFAULT_SKIP_BPS + binStep) / binStep;
  return Math.max(1, Math.round(10_000 / (binStep * skip)));
}

export function binPrice(binId: number, binStep: number): number {
  return Math.pow(1 + binStep / 10_000, binId);
}

/** Bin value in quote terms at the snapshot's midpoint price. */
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
      pool: snapshot.pool,
      timestamp: snapshot.timestamp,
      totalBins: 0,
      activeBin: null,
      activeBinPct: 0,
      topDecileConcentration: 0,
      halfLiquidityBins: 0,
      inventorySkew: 0,
      totalValue: 0,
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
    pool: snapshot.pool,
    timestamp: snapshot.timestamp,
    totalBins,
    activeBin: activeBin?.binId ?? null,
    activeBinPct,
    topDecileConcentration,
    halfLiquidityBins,
    inventorySkew,
    totalValue,
  };
}

export { PROTOCOL_FEE_BPS };
