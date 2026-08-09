import type { DlmmSnapshot } from "./dlmm.js";

const DEFAULT_METEORA_API = "https://api.meteora.ag/v1/dlmm";

export interface DlmmFetcherOptions {
  /** Base URL for the Meteora DLMM public API. */
  baseUrl?: string;
  /** Optional API key for authenticated endpoints. */
  apiKey?: string;
  /** Custom fetch implementation (useful for tests). */
  fetchImpl?: typeof fetch;
}

export class DlmmFetcher {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DlmmFetcherOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_METEORA_API;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchBinSnapshot(pairAddress: string): Promise<DlmmSnapshot | null> {
    const url = `${this.baseUrl}/${encodeURIComponent(pairAddress)}/bins`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchImpl(url, { headers });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      binStep?: number;
      bins?: Array<{ binId: number; baseAmount: string; quoteAmount: string; active?: boolean }>;
      activeBin?: { binId: number };
    };

    if (!data.bins || data.binStep == null) {
      return null;
    }

    return {
      strategyId: pairAddress,
      pool: pairAddress,
      pair: "",
      protocol: "meteora",
      binStep: data.binStep,
      bins: data.bins.map((b) => ({
        binId: b.binId,
        baseAmount: Number(b.baseAmount),
        quoteAmount: Number(b.quoteAmount),
        active: b.active,
      })),
      timestamp: Date.now(),
    };
  }
}
