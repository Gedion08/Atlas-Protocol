import { createHash } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";

export const GOVERNANCE_PROGRAM_ID = new PublicKey(
  "5fcfpz4DK8G4HbPMyX259fgotXJaE4v7yNhXidRAtWnD",
);

export const EXECUTE_PROPOSAL_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:execute_proposal")
  .digest()
  .subarray(0, 8);

export function governanceConfigPda(programId: PublicKey = GOVERNANCE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("governance_config")], programId);
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
