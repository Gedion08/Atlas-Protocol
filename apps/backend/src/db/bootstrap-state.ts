import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Vault } from "atlas-types";

/** Test seam: overridable bootstrap-state location (see `readBootstrapState`). */
export function stateFilePath(): string {
  return (
    process.env.ATLAS_BOOTSTRAP_STATE_PATH ??
    resolve(import.meta.dirname, "../../../../deploy/bootstrap-state.json")
  );
}

/**
 * State written by `apps/backend/scripts/bootstrap.ts` after a live devnet
 * bootstrap. When present, the backend seeds the on-chain vault (with its
 * `OnchainVaultMeta`) alongside the demo vaults so the API lists it.
 */
export interface BootstrapState {
  generatedAt: number;
  rpcUrl: string;
  deployer: string;
  manager: {
    owner: string;
    name: string;
    profilePda: string;
    bondPda: string;
  };
  vault: {
    address: string;
    name: string;
    baseAsset: string;
    authority: string;
    managerProfile: string;
    baseMint: string;
    escrowPda: string;
    sharesMint: string;
    programId: string;
    decimals: number;
    managementFeeBps: number;
    performanceFeeBps: number;
    minDeposit: number;
  };
}

/** Loads `deploy/bootstrap-state.json`, or null when the bootstrap never ran. */
export function readBootstrapState(): BootstrapState | null {
  const path = stateFilePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BootstrapState;
  } catch {
    return null;
  }
}

/** Converts bootstrap state into a seeded Vault carrying its on-chain metadata. */
export function bootstrapVault(state: BootstrapState): Vault {
  const v = state.vault;
  return {
    address: v.address,
    name: v.name,
    baseAsset: v.baseAsset,
    managerId: state.manager.profilePda,
    authority: v.authority,
    status: "active",
    tvl: 0,
    apy: 0,
    sharesOutstanding: 0,
    managementFeeBps: v.managementFeeBps,
    performanceFeeBps: v.performanceFeeBps,
    minDeposit: v.minDeposit,
    allocation: null,
    createdAt: state.generatedAt,
    lastRebalanceAt: state.generatedAt,
    onchain: {
      programId: v.programId,
      vaultPda: v.address,
      authority: v.authority,
      managerProfile: v.managerProfile,
      baseMint: v.baseMint,
      escrowPda: v.escrowPda,
      sharesMint: v.sharesMint,
      decimals: v.decimals,
    },
  };
}
