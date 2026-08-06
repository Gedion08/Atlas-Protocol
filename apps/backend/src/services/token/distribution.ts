import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";

export const ATLAS_MINT = new PublicKey("7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa");

export interface FaucetResult {
  signature: string;
  recipient: string;
  amount: number;
}

export interface SaleBuildResult {
  transaction: string;
  blockhash: string;
  treasury: string;
  recipient: string;
  solAmount: number;
  atlasAmount: number;
  ataAccounts: string[];
}

function getTreasuryKeypair(): Keypair {
  if (!process.env.ATLAS_TREASURY_KEYPAIR) {
    throw new Error("ATLAS_TREASURY_KEYPAIR is not configured");
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.ATLAS_TREASURY_KEYPAIR) as number[]));
}

export function getTreasuryPubkey(): PublicKey {
  return getTreasuryKeypair().publicKey;
}

export async function getAtlasBalance(connection: Connection, owner: PublicKey): Promise<number> {
  const ata = getAssociatedTokenAddressSync(ATLAS_MINT, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    return Number(balance.value.amount);
  } catch {
    return 0;
  }
}

export async function sendFaucetTransaction(args: {
  connection: Connection;
  recipient: PublicKey;
  amount: number;
}): Promise<string> {
  const treasury = getTreasuryKeypair();
  const treasuryAta = getAssociatedTokenAddressSync(ATLAS_MINT, treasury.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const recipientAta = getAssociatedTokenAddressSync(ATLAS_MINT, args.recipient, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const transaction = new Transaction();

  const recipientAtaInfo = await args.connection.getAccountInfo(recipientAta).catch(() => null);
  if (!recipientAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        treasury.publicKey,
        recipientAta,
        args.recipient,
        ATLAS_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  transaction.add(
    createTransferInstruction(
      treasuryAta,
      recipientAta,
      treasury.publicKey,
      args.amount,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  transaction.feePayer = treasury.publicKey;
  transaction.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;

  const signature = await sendAndConfirmTransaction(
    args.connection,
    transaction,
    [treasury],
    { commitment: "confirmed", skipPreflight: false },
  );
  return signature;
}

export async function buildSaleTransaction(args: {
  connection: Connection;
  buyer: PublicKey;
  solAmount: number;
  atlasAmount: number;
}): Promise<{ transaction: Transaction; ataAccounts: PublicKey[] }> {
  const treasury = getTreasuryKeypair();
  const treasuryPubkey = treasury.publicKey;

  const treasuryAta = getAssociatedTokenAddressSync(ATLAS_MINT, treasuryPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const buyerAta = getAssociatedTokenAddressSync(ATLAS_MINT, args.buyer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const transaction = new Transaction();
  const ataAccounts: PublicKey[] = [];

  const buyerAtaInfo = await args.connection.getAccountInfo(buyerAta).catch(() => null);
  if (!buyerAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        args.buyer,
        buyerAta,
        args.buyer,
        ATLAS_MINT,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
    ataAccounts.push(buyerAta);
  }

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: args.buyer,
      toPubkey: treasuryPubkey,
      lamports: args.solAmount * 1_000_000_000,
    }),
  );

  transaction.add(
    createTransferInstruction(
      treasuryAta,
      buyerAta,
      treasury.publicKey,
      args.atlasAmount,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  transaction.feePayer = args.buyer;
  transaction.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;
  transaction.sign([treasury] as any);
  return { transaction, ataAccounts };
}
