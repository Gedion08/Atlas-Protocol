import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

/** on-chain atlas-staking program id (deployed on devnet). */
export const STAKING_PROGRAM_ID = new PublicKey(
  "4PxMwLR7KimbQct4NYXyjVk42aMK4vrKcBobBGepjJ4H",
);

export { TOKEN_PROGRAM_ID };

/** anchor discriminator for `bond` */
export const BOND_DISCRIMINATOR: Uint8Array = discriminator("bond");

function discriminator(name: string): Uint8Array {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

// ---------------------------------------------------------------------------
// PDAs (seed schemes verified against programs/staking/src/state.rs)
// ---------------------------------------------------------------------------

export function bondPda(
  owner: PublicKey,
  programId: PublicKey = STAKING_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("bond"), owner.toBuffer()], programId);
}

export function bondEscrowPda(
  bond: PublicKey,
  programId: PublicKey = STAKING_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), bond.toBuffer()], programId);
}

/** `["atlas_staking_config"]` config PDA (not required by `bond`). */
export function stakingConfigPda(programId: PublicKey = STAKING_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("atlas_staking_config")], programId);
}

// ---------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------

/** Locks `amount` of `bondMint` into the staking bond escrow, creating the
 * bond + escrow accounts at staking-derived PDAs (pre-requisite for the
 * registry `register` instruction). */
export function buildBondInstruction(args: {
  programId?: PublicKey;
  accounts: {
    bond: PublicKey;
    bondEscrow: PublicKey;
    bondMint: PublicKey;
    owner: PublicKey;
    ownerToken: PublicKey;
    systemProgram?: PublicKey;
    tokenProgram?: PublicKey;
  };
  amount: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? STAKING_PROGRAM_ID;
  const a = args.accounts;
  const amount = Buffer.alloc(8);
  amount.writeBigUInt64LE(BigInt(args.amount));
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.bond, isSigner: false, isWritable: true },
      { pubkey: a.bondEscrow, isSigner: false, isWritable: true },
      { pubkey: a.bondMint, isSigner: false, isWritable: false },
      { pubkey: a.owner, isSigner: true, isWritable: true },
      { pubkey: a.ownerToken, isSigner: false, isWritable: true },
      { pubkey: a.systemProgram ?? SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: a.tokenProgram ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([BOND_DISCRIMINATOR, amount]),
  });
}
