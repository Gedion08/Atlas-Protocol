import type {
  LeaderboardEntry,
  ManagerPerformance,
  ManagerProfile,
  RiskDecision,
  Strategy,
  StrategyUpload,
  Vault,
} from "atlas-types";

export interface AtlasClientOptions {
  /** Base URL of the Atlas API. Defaults to http://localhost:4000. */
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Wallet capability required for authenticated (write) calls. */
export interface WalletSigner {
  /** Base58 ed25519 public key (the manager's on-chain owner). */
  publicKey: string;
  /** Signs the UTF-8 message bytes and returns the detached signature (base58). */
  signMessage(message: string): Promise<string> | string;
}

export interface UploadStrategyOptions {
  /** Wallet that owns the manager profile; signs the request (spec §7.1). */
  signer?: WalletSigner;
}

const AUTH_PREFIX = "atlas.request v1";

/** SHA-256 via Web Crypto (browser + Node ≥18), hex-encoded. */
async function sha256Hex(data: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Builds the canonical signed message: the server re-derives it from the exact
 * request-body JSON and verifies the detached ed25519 signature.
 */
export function buildAuthMessage(args: {
  owner: string;
  nonce: string;
  payloadSha256: string;
}): string {
  return [AUTH_PREFIX, args.owner, args.nonce, args.payloadSha256].join("\n");
}

interface ApiEnvelope<T> {
  data: T;
}

/** Typed client for the Atlas Protocol REST API (works in Node and browsers). */
export class AtlasClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AtlasClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:4000").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async getVaults(): Promise<Vault[]> {
    return this.request<Vault[]>("/api/v1/vaults");
  }

  async getVault(address: string): Promise<Vault | null> {
    return this.request<Vault | null>(`/api/v1/vaults/${encodeURIComponent(address)}`);
  }

  async getStrategies(filter?: { managerId?: string; protocol?: string }): Promise<Strategy[]> {
    const query = new URLSearchParams();
    if (filter?.managerId) query.set("managerId", filter.managerId);
    if (filter?.protocol) query.set("protocol", filter.protocol);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.request<Strategy[]>(`/api/v1/strategies${suffix}`);
  }

  async getStrategy(id: string): Promise<Strategy | null> {
    return this.request<Strategy | null>(`/api/v1/strategies/${encodeURIComponent(id)}`);
  }

  async getStrategyRankings(): Promise<Strategy[]> {
    return this.request<Strategy[]>("/api/v1/strategies/rankings");
  }

  async uploadStrategy(upload: StrategyUpload, options: UploadStrategyOptions = {}): Promise<Strategy> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.signer) {
      const nonce = newNonce();
      const payloadSha256 = await sha256Hex(JSON.stringify(upload));
      const message = buildAuthMessage({
        owner: options.signer.publicKey,
        nonce,
        payloadSha256,
      });
      const signature = await options.signer.signMessage(message);
      headers["x-atlas-owner"] = options.signer.publicKey;
      headers["x-atlas-nonce"] = nonce;
      headers["x-atlas-signature"] = signature;
    }
    return this.request<Strategy>("/api/v1/strategies", {
      method: "POST",
      headers,
      body: JSON.stringify(upload),
    });
  }

  async getManagers(): Promise<ManagerProfile[]> {
    return this.request<ManagerProfile[]>("/api/v1/managers");
  }

  async getManager(id: string): Promise<ManagerProfile | null> {
    return this.request<ManagerProfile | null>(`/api/v1/managers/${encodeURIComponent(id)}`);
  }

  async getManagerPerformance(id: string, days = 90): Promise<ManagerPerformance | null> {
    return this.request<ManagerPerformance | null>(
      `/api/v1/managers/${encodeURIComponent(id)}/performance?days=${days}`,
    );
  }

  async getManagerRisk(id: string): Promise<RiskDecision | null> {
    return this.request<RiskDecision | null>(`/api/v1/managers/${encodeURIComponent(id)}/risk`);
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    return this.request<LeaderboardEntry[]>("/api/v1/leaderboard");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
      if (!response.ok) {
        throw new ApiError(
          response.status,
          (body as { error?: string; message?: string })?.message ??
            (body as { error?: string })?.error ??
            `Request failed with status ${response.status}`,
        );
      }
      return (body?.data ?? null) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
