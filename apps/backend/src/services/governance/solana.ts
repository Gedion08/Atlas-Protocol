import { createHash } from "node:crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

export const GOVERNANCE_PROGRAM_ID = new PublicKey(
  "5fcfpz4DK8G4HbPMyX259fgotXJaE4v7yNhXidRAtWnD",
);

export const ATLAS_MINT = new PublicKey("7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa");

export const EXECUTE_PROPOSAL_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:execute_proposal")
  .digest()
  .subarray(0, 8);

export const CREATE_LOCK_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:create_lock")
  .digest()
  .subarray(0, 8);

export function governanceConfigPda(programId: PublicKey = GOVERNANCE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("governance_config")], programId);
}

export function governanceVaultPda(
  config: PublicKey,
  programId: PublicKey = GOVERNANCE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), config.toBuffer()], programId);
}

export function veLockPda(
  owner: PublicKey,
  programId: PublicKey = GOVERNANCE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("ve_lock"), owner.toBuffer()], programId);
}

export function proposalPda(
  config: PublicKey,
  proposalId: bigint | number,
  programId: PublicKey = GOVERNANCE_PROGRAM_ID,
): [PublicKey, number] {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(BigInt(proposalId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("proposal"), config.toBuffer(), idBuffer],
    programId,
  );
}

function encodeU64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function encodeI64(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value));
  return buf;
}

export function buildCreateLockInstruction(args: {
  programId?: PublicKey;
  config: PublicKey;
  vault: PublicKey;
  lock: PublicKey;
  ownerToken: PublicKey;
  atlasMint: PublicKey;
  owner: PublicKey;
  systemProgram?: PublicKey;
  tokenProgram?: PublicKey;
  associatedTokenProgram?: PublicKey;
  amount: number | bigint;
  durationSecs: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? GOVERNANCE_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.config, isSigner: false, isWritable: false },
      { pubkey: args.vault, isSigner: false, isWritable: true },
      { pubkey: args.lock, isSigner: false, isWritable: true },
      { pubkey: args.ownerToken, isSigner: false, isWritable: true },
      { pubkey: args.atlasMint, isSigner: false, isWritable: false },
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.systemProgram ?? SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: args.tokenProgram ?? TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: args.associatedTokenProgram ?? ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([CREATE_LOCK_DISCRIMINATOR, encodeU64(args.amount), encodeI64(args.durationSecs)]),
  });
}

export async function buildCreateLockTransaction(args: {
  connection: Connection;
  programId?: PublicKey;
  owner: PublicKey;
  amount: number | bigint;
  durationSecs: number | bigint;
}): Promise<Transaction> {
  const programId = args.programId ?? GOVERNANCE_PROGRAM_ID;
  const [config] = governanceConfigPda(programId);
  const [vault] = governanceVaultPda(config, programId);
  const [lock] = veLockPda(args.owner, programId);
  const ownerToken = getAssociatedTokenAddressSync(
    ATLAS_MINT,
    args.owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const transaction = new Transaction();
  if (!(await isPresentAccount(args.connection, ownerToken))) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        args.owner,
        ownerToken,
        args.owner,
        ATLAS_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  transaction.add(
    buildCreateLockInstruction({
      programId,
      config,
      vault,
      lock,
      ownerToken,
      atlasMint: ATLAS_MINT,
      owner: args.owner,
      amount: args.amount,
      durationSecs: args.durationSecs,
    }),
  );

  transaction.feePayer = args.owner;
  transaction.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  return transaction;
}

function isPresentAccount(connection: Connection, pubkey: PublicKey): Promise<boolean> {
  return connection.getAccountInfo(pubkey).then((info) => info !== null);
}

export function buildExecuteProposalInstruction(args: {
  programId?: PublicKey;
  config: PublicKey;
  proposal: PublicKey;
  executor: PublicKey;
}): TransactionInstruction {
  const programId = args.programId ?? GOVERNANCE_PROGRAM_ID;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: args.proposal, isSigner: false, isWritable: true },
      { pubkey: args.config, isSigner: false, isWritable: false },
      { pubkey: args.executor, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(EXECUTE_PROPOSAL_DISCRIMINATOR),
  });
}

export async function buildExecuteProposalTransaction(args: {
  connection: Connection;
  executorKeypair: Keypair;
  config: PublicKey;
  proposal: PublicKey;
  programId?: PublicKey;
}): Promise<Transaction> {
  const instruction = buildExecuteProposalInstruction({
    programId: args.programId,
    config: args.config,
    proposal: args.proposal,
    executor: args.executorKeypair.publicKey,
  });
  const tx = new Transaction().add(instruction);
  tx.feePayer = args.executorKeypair.publicKey;
  tx.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  return tx;
}
