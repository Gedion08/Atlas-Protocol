import type { AtlasEvent } from "../indexer/helius.js";
import { analyzeDlmm, type DlmmAnalytics, type DlmmAnalyticsStore } from "./dlmm.js";
import { DlmmFetcher } from "./dlmm-fetcher.js";

const METEORA_API = process.env.METEORA_API_URL ?? "https://api.meteora.ag/v1/dlmm";

export class DlmmEnricher {
  private readonly fetcher: DlmmFetcher;
  private readonly seen = new Set<string>();

  constructor(private readonly store: DlmmAnalyticsStore) {
    this.fetcher = new DlmmFetcher({ baseUrl: METEORA_API, fetchImpl: fetch.bind(globalThis) });
  }

  async enrich(event: AtlasEvent): Promise<DlmmAnalytics | null> {
    if (event.payload.protocol !== "meteora") return null;
    if (!event.vaultAddress && !event.payload.pool) return null;

    const pool = (event.payload.pool as string | undefined) ?? event.vaultAddress;
    const key = `${pool}:${event.timestamp}`;
    if (this.seen.has(key)) return null;

    const snapshot = await this.fetcher.fetchBinSnapshot(pool);
    if (!snapshot) return null;

    this.seen.add(key);
    const analytics = analyzeDlmm({
      ...snapshot,
      strategyId: event.managerId ?? pool,
      pair: (event.payload.pair as string | undefined) ?? snapshot.pair,
      timestamp: event.timestamp,
    });

    await this.store.append(analytics);
    return analytics;
  }

  clearCache(): void {
    this.seen.clear();
  }
}
