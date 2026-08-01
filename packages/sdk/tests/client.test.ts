import { describe, expect, it, vi } from "vitest";
import { ApiError, AtlasClient } from "../src/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AtlasClient", () => {
  it("gets vaults through the envelope", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ address: "v1" }] }));
    const client = new AtlasClient({ baseUrl: "http://atlas.test", fetchImpl: fetchImpl as typeof fetch });
    await expect(client.getVaults()).resolves.toEqual([{ address: "v1" }]);
    expect(fetchImpl).toHaveBeenCalledWith("http://atlas.test/api/v1/vaults", expect.any(Object));
  });

  it("uploads a strategy with a POST and JSON body", async () => {
    const upload = {
      managerId: "mgr_quantum",
      name: "BTC/SOL Conservative v4",
      type: "passive" as const,
      protocol: "meteora" as const,
      pool: "BTC-SOL DLMM",
      pair: "BTC/SOL",
      fees: { managementBps: 50, performanceBps: 1500 },
      riskTier: 1 as const,
      description: "Concentrated passive range",
      params: { spreadBps: 30, bins: 40 },
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { id: "str_new_1", ...upload, version: 4, tvl: 0, apy: 0, apr: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, impermanentLoss: 0, utilization: 0, ageDays: 0 } }),
    );
    const client = new AtlasClient({ baseUrl: "http://atlas.test", fetchImpl: fetchImpl as typeof fetch });
    const strategy = await client.uploadStrategy(upload);
    expect(strategy.id).toBe("str_new_1");
    expect(strategy.version).toBe(4);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://atlas.test/api/v1/strategies");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(upload);
  });

  it("adds wallet-signature headers and signs the canonical message", async () => {
    const upload = {
      managerId: "mgr_quantum",
      name: "Signed Upload",
      type: "passive" as const,
      protocol: "meteora" as const,
      pool: "BTC-SOL DLMM",
      pair: "BTC/SOL",
      fees: { managementBps: 50, performanceBps: 1500 },
      riskTier: 1 as const,
    };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { id: "str_signed", ...upload, version: 1 } }),
    );
    const signMessage = vi.fn(async (message: string) => `sig-of:${message}`);
    const client = new AtlasClient({ baseUrl: "http://atlas.test", fetchImpl: fetchImpl as typeof fetch });
    await client.uploadStrategy(upload, {
      signer: { publicKey: "owner123", signMessage },
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-atlas-owner"]).toBe("owner123");
    expect(headers["x-atlas-nonce"]).toBeTruthy();
    expect(headers["x-atlas-signature"]).toContain("sig-of:atlas.request v1\nowner123\n");
    expect(headers["x-atlas-signature"]).toContain(headers["x-atlas-nonce"]);
    expect(headers["x-atlas-signature"]).toContain(
      await sha256Hex(JSON.stringify(upload)),
    );
    expect(signMessage).toHaveBeenCalledTimes(1);
  });

  it("throws ApiError with the API message on failure", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "risk_tier_exceeded", message: "Manager tier 2 cannot list a tier 3 strategy" }, 403),
    );
    const client = new AtlasClient({ baseUrl: "http://atlas.test", fetchImpl: fetchImpl as typeof fetch });
    await expect(client.uploadStrategy({} as never)).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      message: "Manager tier 2 cannot list a tier 3 strategy",
    });
  });

  it("builds query strings for filtered strategy lists", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const client = new AtlasClient({ baseUrl: "http://atlas.test", fetchImpl: fetchImpl as typeof fetch });
    await client.getStrategies({ managerId: "mgr_apex", protocol: "orca" });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "http://atlas.test/api/v1/strategies?managerId=mgr_apex&protocol=orca",
    );
  });

  it("propagates fetch errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new ApiError(503, "unreachable");
    });
    const client = new AtlasClient({ baseUrl: "http://atlas.test", fetchImpl: fetchImpl as typeof fetch });
    await expect(client.getVaults()).rejects.toMatchObject({ status: 503 });
  });
});

async function sha256Hex(data: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
