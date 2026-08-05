import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

/** on-chain atlas-manager-registry program id (deployed on devnet). */
export const REGISTRY_PROGRAM_ID = new PublicKey(
  "CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs",
);

/** on-chain atlas-staking program id (the register CPI locks bonds here). */
export const STAKING_PROGRAM_ID = new PublicKey(
  "4PxMwLR7KimbQct4NYXyjVk42aMK4vrKcBobBGepjJ4H",
);

export { TOKEN_PROGRAM_ID };

/** anchor discriminator for `initialize_config` */
export const INITIALIZE_CONFIG_DISCRIMINATOR: Uint8Array = discriminator("initialize_config");
/** anchor discriminator for `register` */
export const REGISTER_DISCRIMINATOR: Uint8Array = discriminator("register");

function discriminator(name: string): Uint8Array {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

// ---------------------------------------------------------------------------
// PDAs (seed schemes verified against programs/*/src/state.rs)
// ---------------------------------------------------------------------------

export function registryConfigPda(programId: PublicKey = REGISTRY_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("atlas_registry_config")], programId);
}

export function managerProfilePda(
  owner: PublicKey,
  programId: PublicKey = REGISTRY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("manager"), owner.toBuffer()], programId);
}

export function bondPda(
  owner: PublicKey,
  stakingProgramId: PublicKey = STAKING_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("bond"), owner.toBuffer()], stakingProgramId);
}

export function bondEscrowPda(
  bond: PublicKey,
  stakingProgramId: PublicKey = STAKING_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), bond.toBuffer()], stakingProgramId);
}

// ---------------------------------------------------------------------------
// Instruction builders (bootstrap)
// ---------------------------------------------------------------------------

export function buildRegistryInitializeConfigInstruction(args: {
  programId?: PublicKey;
  accounts: { config: PublicKey; governance: PublicKey; systemProgram?: PublicKey };
  oracle: PublicKey;
  slashAuthority: PublicKey;
  bondMint: PublicKey;
  bondAmount: number | bigint;
  scoreThreshold: number;
}): TransactionInstruction {
  const programId = args.programId ?? REGISTRY_PROGRAM_ID;
  const a = args.accounts;
  const bondAmount = Buffer.alloc(8);
  bondAmount.writeBigUInt64LE(BigInt(args.bondAmount));
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.governance, isSigner: true, isWritable: true },
      { pubkey: a.systemProgram ?? SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      INITIALIZE_CONFIG_DISCRIMINATOR,
      args.oracle.toBuffer(),
      args.slashAuthority.toBuffer(),
      args.bondMint.toBuffer(),
      bondAmount,
      Buffer.from([args.scoreThreshold & 0xff]),
    ]),
  });
}

/** Registers a manager against a pre-existing staking bond (created by
 * `atlas_staking::bond` at the staking-derived bond/escrow PDAs). The registry
 * verifies the bond and no longer CPIs into staking. */
export function buildRegisterManagerInstruction(args: {
  programId?: PublicKey;
  accounts: {
    config: PublicKey;
    profile: PublicKey;
    bond: PublicKey;
    bondEscrow: PublicKey;
    bondMint: PublicKey;
    owner: PublicKey;
    systemProgram?: PublicKey;
  };
  name: string;
}): TransactionInstruction {
  const programId = args.programId ?? REGISTRY_PROGRAM_ID;
  const a = args.accounts;
  const nameBytes = Buffer.from(args.name, "utf8");
  const nameLen = Buffer.alloc(4);
  nameLen.writeUInt32LE(nameBytes.length);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: false },
      { pubkey: a.profile, isSigner: false, isWritable: true },
      { pubkey: a.bond, isSigner: false, isWritable: false },
      { pubkey: a.bondEscrow, isSigner: false, isWritable: false },
      { pubkey: a.bondMint, isSigner: false, isWritable: false },
      { pubkey: a.owner, isSigner: true, isWritable: true },
      { pubkey: a.systemProgram ?? SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([REGISTER_DISCRIMINATOR, nameLen, nameBytes]),
  });
}
