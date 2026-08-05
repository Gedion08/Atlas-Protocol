import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapVault, readBootstrapState } from "../src/db/bootstrap-state.js";
import type { BootstrapState } from "../src/db/bootstrap-state.js";

const ORIGINAL = process.env.ATLAS_BOOTSTRAP_STATE_PATH;

let state: BootstrapState;

beforeEach(() => {
  state = {
    generatedAt: 1_700_000_000_000,
    rpcUrl: "https://api.devnet.solana.com",
    deployer: "Deployer11111111111111111111111111111111111111",
    manager: {
      owner: "ManagerOwner111111111111111111111111111111111111",
      name: "Onchain Vault",
      profilePda: "ProfilePDA111111111111111111111111111111111111",
      bondPda: "BondPDA1111111111111111111111111111111111111111",
    },
    vault: {
      address: "VaultPDA11111111111111111111111111111111111111",
      name: "Atlas Onchain",
      baseAsset: "ATLAS",
      authority: "Deployer11111111111111111111111111111111111111",
      managerProfile: "ProfilePDA111111111111111111111111111111111111",
      baseMint: "BaseMint1111111111111111111111111111111111111111",
      escrowPda: "EscrowPDA111111111111111111111111111111111111111",
      sharesMint: "SharesMint11111111111111111111111111111111111111",
      programId: "VaultProgram111111111111111111111111111111111111",
      decimals: 6,
      managementFeeBps: 200,
      performanceFeeBps: 1000,
      minDeposit: 1_000_000,
    },
  };
});

describe("bootstrap state", () => {
  it("returns null when no bootstrap-state.json exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-bs-"));
    process.env.ATLAS_BOOTSTRAP_STATE_PATH = join(dir, "missing.json");
    expect(readBootstrapState()).toBeNull();
  });

  it("loads a bootstrap-state.json and maps it to an onchain Vault", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-bs-"));
    mkdirSync(join(dir, "deploy"), { recursive: true });
    writeFileSync(join(dir, "deploy", "bootstrap-state.json"), JSON.stringify(state));
    process.env.ATLAS_BOOTSTRAP_STATE_PATH = join(dir, "deploy", "bootstrap-state.json");

    const loaded = readBootstrapState();
    expect(loaded).not.toBeNull();
    const vault = bootstrapVault(loaded!);
    expect(vault.address).toBe(state.vault.address);
    expect(vault.managerId).toBe(state.manager.profilePda);
    expect(vault.onchain).toEqual({
      programId: state.vault.programId,
      vaultPda: state.vault.address,
      authority: state.vault.authority,
      managerProfile: state.vault.managerProfile,
      baseMint: state.vault.baseMint,
      escrowPda: state.vault.escrowPda,
      sharesMint: state.vault.sharesMint,
      decimals: 6,
    });
  });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ATLAS_BOOTSTRAP_STATE_PATH;
  else process.env.ATLAS_BOOTSTRAP_STATE_PATH = ORIGINAL;
});
