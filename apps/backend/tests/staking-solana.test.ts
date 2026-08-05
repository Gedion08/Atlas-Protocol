import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  bondEscrowPda,
  bondPda,
  BOND_DISCRIMINATOR,
  buildBondInstruction,
  STAKING_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../src/services/staking/solana.js";

const owner = Keypair.generate();
const bondMint = Keypair.generate().publicKey;
const ownerToken = Keypair.generate().publicKey;

const [bond] = bondPda(owner.publicKey);
const [escrow] = bondEscrowPda(bond);

describe("staking PDAs", () => {
  it("derives bond/escrow against the on-chain staking program id", () => {
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

describe("staking bond instruction", () => {
  it("lays out accounts and serializes the amount", () => {
    const instruction = buildBondInstruction({
      accounts: { bond, bondEscrow: escrow, bondMint, owner: owner.publicKey, ownerToken },
      amount: 1_000_000_000n,
    });

    expect(instruction.programId.equals(STAKING_PROGRAM_ID)).toBe(true);
    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      bond.toBase58(),
      escrow.toBase58(),
      bondMint.toBase58(),
      owner.publicKey.toBase58(),
      ownerToken.toBase58(),
      SystemProgram.programId.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
    const buf = instruction.data;
    expect(Buffer.from(buf.subarray(0, 8)).toString("hex")).toBe("126c60f4a2238eca");
    expect(buf.readBigUInt64LE(8)).toBe(1_000_000_000n);
    expect(buf.length).toBe(16);
  });
});
