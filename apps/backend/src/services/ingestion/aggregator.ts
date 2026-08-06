import type { AtlasEvent } from "../indexer/helius.js";
import type { ManagerMetricsPoint, TimeSeriesStore } from "./timeseries.js";

interface BucketAccum {
  tvl: number;
  pnl: number;
  pnlEvents: number;
  fees: number;
  pools: Set<string>;
  protocols: Set<string>;
  governanceActions: number;
  lastTvl: number;
}

function dayStart(timestamp: number): number {
  return Math.floor(timestamp / 86_400_000) * 86_400_000;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Consumes normalized on-chain events and aggregates them into per-manager,
 * per-day metric snapshots that feed the oracle loop and the leaderboard.
 */
export class MetricsAggregator {
  private buckets = new Map<string, BucketAccum>();

  constructor(private readonly store: TimeSeriesStore) {}

  async ingest(events: AtlasEvent[]): Promise<void> {
    for (const event of events) {
      const managerId = event.managerId;
      if (!managerId) continue;
      this.apply(event, managerId);
    }
  }

  private apply(event: AtlasEvent, managerId: string): void {
    const key = `${managerId}:${dayStart(event.timestamp)}`;
    const bucket = this.buckets.get(key) ?? {
      tvl: 0,
      pnl: 0,
      pnlEvents: 0,
      fees: 0,
      pools: new Set<string>(),
      protocols: new Set<string>(),
      governanceActions: 0,
      lastTvl: 0,
    };

    const amount = Number(event.payload.amount ?? 0);
    switch (event.type) {
      case "deposit":
      case "withdraw":
        bucket.tvl += event.type === "deposit" ? amount : -amount;
        bucket.lastTvl += event.type === "deposit" ? amount : -amount;
        break;
      case "swap":
      case "rebalance": {
        const pnl = Number(event.payload.pnl ?? amount ?? 0);
        bucket.pnl += pnl;
        bucket.pnlEvents += 1;
        if (event.payload.pool) bucket.pools.add(String(event.payload.pool));
        break;
      }
      case "fee_collected":
        bucket.fees += amount;
        break;
      case "position_open":
        if (event.payload.pool) bucket.pools.add(String(event.payload.pool));
        if (event.payload.protocol) bucket.protocols.add(String(event.payload.protocol));
        break;
      case "emergency_exit":
        bucket.pnl -= Math.abs(amount);
        bucket.pnlEvents += 1;
        break;
    }
    if (event.payload.protocol) bucket.protocols.add(String(event.payload.protocol));

    this.buckets.set(key, bucket);
  }

  /** Emit one aggregated point per (manager, day) and clear pending buckets. */
  async flush(): Promise<ManagerMetricsPoint[]> {
    const points: ManagerMetricsPoint[] = [];
    for (const [key, bucket] of this.buckets) {
      const [managerId, day] = key.split(":");
      const navGrowth = bucket.lastTvl > 0 && bucket.pnlEvents > 0 ? bucket.pnl / bucket.lastTvl : 0;
      points.push({
        managerId,
        timestamp: Number(day),
        tvl: Math.max(0, bucket.lastTvl),
        nav: 1 + clamp(navGrowth, -0.5, 2),
        feesGenerated: bucket.fees,
        dailyPnl: bucket.pnl,
        maxDrawdown: 0,
        volatility: 0,
        protocolsUsed: bucket.protocols.size,
        poolsTraded: bucket.pools.size,
        governanceActions: bucket.governanceActions,
        poolConcentration: 0,
        tokenConcentration: 0,
        protocolConcentration: 0,
        memecoinConcentration: 0,
        stablePoolConcentration: 0,
        slippage: 0,
        feeDecay: 0,
        oracleHealth: 0,
        utilization: 0,
        inventoryImbalance: 0,
      });
    }
    this.buckets.clear();
    if (points.length > 0) {
      await this.store.appendMetrics(points);
    }
    return points;
  }

  async flushCompletedBuckets(now = Date.now()): Promise<ManagerMetricsPoint[]> {
    const points: ManagerMetricsPoint[] = [];
    const currentDayStart = Math.floor(now / 86_400_000) * 86_400_000;
    for (const [key, bucket] of this.buckets) {
      const [managerId, day] = key.split(":");
      if (Number(day) < currentDayStart) {
        const navGrowth = bucket.lastTvl > 0 && bucket.pnlEvents > 0 ? bucket.pnl / bucket.lastTvl : 0;
        points.push({
          managerId,
          timestamp: Number(day),
          tvl: Math.max(0, bucket.lastTvl),
          nav: 1 + clamp(navGrowth, -0.5, 2),
          feesGenerated: bucket.fees,
          dailyPnl: bucket.pnl,
          maxDrawdown: 0,
          volatility: 0,
          protocolsUsed: bucket.protocols.size,
          poolsTraded: bucket.pools.size,
          governanceActions: bucket.governanceActions,
          poolConcentration: 0,
          tokenConcentration: 0,
          protocolConcentration: 0,
          memecoinConcentration: 0,
          stablePoolConcentration: 0,
          slippage: 0,
          feeDecay: 0,
          oracleHealth: 0,
          utilization: 0,
          inventoryImbalance: 0,
        });
        this.buckets.delete(key);
      }
    }
    if (points.length > 0) {
      await this.store.appendMetrics(points);
    }
    return points;
  }

  get pendingBucketCount(): number {
    return this.buckets.size;
  }
}
