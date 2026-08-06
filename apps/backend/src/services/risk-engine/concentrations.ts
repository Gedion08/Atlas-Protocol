import type { Strategy, Vault } from "atlas-types";

const STABLE_PAIRS = new Set([
  "USDC/USDT",
  "USDT/USDC",
  "USDC/DAI",
  "DAI/USDC",
  "USDC/USDC",
  "USDT/USDT",
  "USDC/USDC",
]);

export interface ConcentrationMetrics {
  poolConcentration: number;
  tokenConcentration: number;
  protocolConcentration: number;
  memecoinConcentration: number;
  stablePoolConcentration: number;
}

export async function computeConcentrationMetrics(
  managerId: string,
  vaults: { list(): Promise<Vault[]> },
  strategies: { list(filter?: { managerId?: string }): Promise<Strategy[]> },
): Promise<ConcentrationMetrics> {
  const managerVaults = await vaults.list();
  const hasVault = managerVaults.some((v) => v.managerId === managerId);
  if (!hasVault) {
    return {
      poolConcentration: 0,
      tokenConcentration: 0,
      protocolConcentration: 0,
      memecoinConcentration: 0,
      stablePoolConcentration: 0,
    };
  }

  const managerStrategies = await strategies.list({ managerId });
  if (managerStrategies.length === 0) {
    return {
      poolConcentration: 0,
      tokenConcentration: 0,
      protocolConcentration: 0,
      memecoinConcentration: 0,
      stablePoolConcentration: 0,
    };
  }

  const totalTvl = managerStrategies.reduce((sum, s) => sum + s.tvl, 0);
  if (totalTvl === 0) {
    return {
      poolConcentration: 0,
      tokenConcentration: 0,
      protocolConcentration: 0,
      memecoinConcentration: 0,
      stablePoolConcentration: 0,
    };
  }

  const poolTvl = new Map<string, number>();
  const tokenTvl = new Map<string, number>();
  const protocolTvl = new Map<string, number>();
  let memecoinTvl = 0;
  let stableTvl = 0;

  for (const s of managerStrategies) {
    poolTvl.set(s.pool, (poolTvl.get(s.pool) ?? 0) + s.tvl);

    const tokens = s.pair.split("/").map((t) => t.trim());
    for (const token of tokens) {
      if (token) tokenTvl.set(token, (tokenTvl.get(token) ?? 0) + s.tvl);
    }

    protocolTvl.set(s.protocol, (protocolTvl.get(s.protocol) ?? 0) + s.tvl);

    const lowerPair = s.pair.toLowerCase();
    const lowerPool = s.pool.toLowerCase();
    if (lowerPair.includes("meme") || lowerPool.includes("meme")) {
      memecoinTvl += s.tvl;
    }

    const upperPair = s.pair.toUpperCase();
    if (STABLE_PAIRS.has(upperPair)) {
      stableTvl += s.tvl;
    }
  }

  const maxPool = Math.max(0, ...poolTvl.values());
  const maxToken = Math.max(0, ...tokenTvl.values());
  const maxProtocol = Math.max(0, ...protocolTvl.values());

  return {
    poolConcentration: maxPool / totalTvl,
    tokenConcentration: maxToken / totalTvl,
    protocolConcentration: maxProtocol / totalTvl,
    memecoinConcentration: memecoinTvl / totalTvl,
    stablePoolConcentration: stableTvl / totalTvl,
  };
}
