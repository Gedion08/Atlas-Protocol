import type { Vault } from "atlas-types";

export interface SharePricing {
  /** NAV per share: total value ÷ shares outstanding (oracle-driven on-chain value). */
  sharePrice: number;
  tvl: number;
  sharesOutstanding: number;
  pricedAt: number;
}

/** Prices vault shares from the on-chain `total_value` (oracle-attested) rather
 * than a 1:1 peg (roadmap §Phase 2: "wire vault share pricing to oracle"). */
export function computeSharePricing(vault: Vault, now = Date.now()): SharePricing {
  const shares = Math.max(0, vault.sharesOutstanding);
  const sharePrice = shares > 0 ? vault.tvl / shares : 0;
  return {
    sharePrice,
    tvl: vault.tvl,
    sharesOutstanding: vault.sharesOutstanding,
    pricedAt: now,
  };
}
