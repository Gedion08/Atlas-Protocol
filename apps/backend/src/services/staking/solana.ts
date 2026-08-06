import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { REGISTRY_PROGRAM_ID } from "../registry/solana.js";

export const STAKING_PROGRAM_ID = new PublicKey(
  "4PxMwLR7KimbQct4NYXyjVk42aMK4vrKcBobBGepjJ4H",
);

export const BOND_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:bond")
  .digest()
  .subarray(0, 8);
export const UNBOND_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:unbond")
  .digest()
  .subarray(0, 8);
export const CLAIM_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:claim")
  .digest()
  .subarray(0, 8);

export function bondPda(owner: PublicKey, programId: PublicKey = STAKING_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("bond"), owner.toBuffer()], programId);
}

export function bondEscrowPda(bond: PublicKey, programId: PublicKey = STAKING_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), bond.toBuffer()], programId);
}

export async function getBondMint(connection: Connection): Promise<PublicKey> {
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("atlas_registry_config")],
    REGISTRY_PROGRAM_ID,
  );
  const info = await connection.getAccountInfo(configPda);
  if (!info) {
    throw new Error("Registry config not found");
  }
  const data = info.data;
  if (data.length < 146) {
    throw new Error("Registry config account too small");
  }
  return new PublicKey(data.subarray(104, 136));
}

export function buildBondInstruction(args: {
  programId?: PublicKey;
  owner: PublicKey;
  bondMint: PublicKey;
  ownerToken: PublicKey;
  amount: bigint | number;
}): TransactionInstruction {
  const programId = args.programId ?? STAKING_PROGRAM_ID;
  const [bondPdaKey] = bondPda(args.owner, programId);
  const [escrowPda] = bondEscrowPda(bondPdaKey, programId);
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(args.amount));

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: bondPdaKey, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: args.bondMint, isSigner: false, isWritable: false },
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.ownerToken, isSigner: false, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([BOND_DISCRIMINATOR, amountBuffer]),
  });
}

export function buildUnbondInstruction(args: {
  programId?: PublicKey;
  owner: PublicKey;
}): TransactionInstruction {
  const programId = args.programId ?? STAKING_PROGRAM_ID;
  const [bondPdaKey] = bondPda(args.owner, programId);
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("atlas_staking_config")],
    programId,
  );

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: bondPdaKey, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: args.owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(UNBOND_DISCRIMINATOR),
  });
}

export function buildClaimInstruction(args: {
  programId?: PublicKey;
  owner: PublicKey;
  bondMint: PublicKey;
  ownerToken: PublicKey;
}): TransactionInstruction {
  const programId = args.programId ?? STAKING_PROGRAM_ID;
  const [bondPdaKey] = bondPda(args.owner, programId);
  const [escrowPda] = bondEscrowPda(bondPdaKey, programId);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: bondPdaKey, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: args.bondMint, isSigner: false, isWritable: false },
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.ownerToken, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(CLAIM_DISCRIMINATOR),
  });
}

export async function buildBondTransaction(args: {
  connection: Connection;
  ownerKeypair: Keypair;
  bondMint: PublicKey;
  ownerToken: PublicKey;
  amount: bigint | number;
  programId?: PublicKey;
}): Promise<Transaction> {
  const instruction = buildBondInstruction({
    programId: args.programId,
    owner: args.ownerKeypair.publicKey,
    bondMint: args.bondMint,
    ownerToken: args.ownerToken,
    amount: args.amount,
  });
  const tx = new Transaction().add(instruction);
  tx.feePayer = args.ownerKeypair.publicKey;
  tx.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  return tx;
}
