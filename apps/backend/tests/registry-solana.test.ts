import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  bondEscrowPda,
  bondPda,
  buildRegisterManagerInstruction,
  buildRegistryInitializeConfigInstruction,
  INITIALIZE_CONFIG_DISCRIMINATOR,
  managerProfilePda,
  REGISTER_DISCRIMINATOR,
  REGISTRY_PROGRAM_ID,
  registryConfigPda,
  STAKING_PROGRAM_ID,
} from "../src/services/registry/solana.js";

const governance = Keypair.generate();
const owner = Keypair.generate();
const oracle = Keypair.generate();
const slashAuthority = Keypair.generate();
const bondMint = Keypair.generate().publicKey;

const [config] = registryConfigPda();
const [profile] = managerProfilePda(owner.publicKey);
const [bond] = bondPda(owner.publicKey);
const [escrow] = bondEscrowPda(bond);

describe("discriminators", () => {
  it("matches anchor global:<instruction> discriminators", () => {
    expect(Buffer.from(INITIALIZE_CONFIG_DISCRIMINATOR).toString("hex")).toBe("d07f1501c2bec446");
    expect(Buffer.from(REGISTER_DISCRIMINATOR).toString("hex")).toBe("d37c430fd3c2b2f0");
  });
});

describe("PDAs", () => {
  it("derives config/profile against the on-chain seed schemes", () => {
    const [derivedConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("atlas_registry_config")],
      REGISTRY_PROGRAM_ID,
    );
    const [derivedProfile] = PublicKey.findProgramAddressSync(
      [Buffer.from("manager"), owner.publicKey.toBuffer()],
      REGISTRY_PROGRAM_ID,
    );
    expect(config.equals(derivedConfig)).toBe(true);
    expect(profile.equals(derivedProfile)).toBe(true);
  });

  it("derives the staking bond/escrow PDAs", () => {
    const [derivedBond] = PublicKey.findProgramAddressSync(
      [Buffer.from("bond"), owner.publicKey.toBuffer()],
      STAKING_PROGRAM_ID,
    );
    const [derivedEscrow] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), bond.toBuffer()],
      STAKING_PROGRAM_ID,
    );
    expect(bond.equals(derivedBond)).toBe(true);
    expect(escrow.equals(derivedEscrow)).toBe(true);
  });
});

describe("registry initialize_config instruction", () => {
  it("lays out accounts and serializes params in order", () => {
    const instruction = buildRegistryInitializeConfigInstruction({
      accounts: { config, governance: governance.publicKey },
      oracle: oracle.publicKey,
      slashAuthority: slashAuthority.publicKey,
      bondMint,
      bondAmount: 1_000_000_000n,
      scoreThreshold: 600,
    });

    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      governance.publicKey.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    const buf = instruction.data;
    expect(Buffer.from(buf.subarray(0, 8)).toString("hex")).toBe("d07f1501c2bec446");
    expect(buf.subarray(8, 40)).toEqual(oracle.publicKey.toBuffer());
    expect(buf.subarray(40, 72)).toEqual(slashAuthority.publicKey.toBuffer());
    expect(buf.subarray(72, 104)).toEqual(bondMint.toBuffer());
    expect(buf.readBigUInt64LE(104)).toBe(1_000_000_000n);
    expect(buf[112]).toBe(600 & 0xff);
    expect(buf.length).toBe(113);
  });
});

describe("registry register instruction", () => {
  it("references the staking-derived bond/escrow without CPI accounts", () => {
    const instruction = buildRegisterManagerInstruction({
      accounts: {
        config,
        profile,
        bond,
        bondEscrow: escrow,
        bondMint,
        owner: owner.publicKey,
      },
      name: "Onchain Vault",
    });

    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      profile.toBase58(),
      bond.toBase58(),
      escrow.toBase58(),
      bondMint.toBase58(),
      owner.publicKey.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    const buf = instruction.data;
    expect(Buffer.from(buf.subarray(0, 8)).toString("hex")).toBe("d37c430fd3c2b2f0");
    expect(buf.readUInt32LE(8)).toBe(13);
    expect(buf.subarray(12, 25).toString()).toBe("Onchain Vault");
    expect(buf.length).toBe(25);
  });
});
