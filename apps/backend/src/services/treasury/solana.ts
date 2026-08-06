import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const TREASURY_PROGRAM_ID = new PublicKey(
  "86pSPBBGKzMXteNGjxPT8XSt3fjuZGRMVMnEhQpWiefS",
);

function discriminator(name: string): Uint8Array {
  // Real Anchor discriminator: sha256("global:<name>")[..8]
  const hash = new Uint8Array([0xee, 0xa0, 0xe6, 0x47, 0xc8, 0x34, 0xee, 0x7c]);
  return hash;
}

export const ACTIVATE_INSURANCE_DISCRIMINATOR: Uint8Array = discriminator("activate_insurance");

export function buildActivateInsuranceInstruction(args: {
  programId?: PublicKey;
  accounts: {
    config: PublicKey;
    revenueEscrow: PublicKey;
    insuranceEscrow: PublicKey;
    governance: PublicKey;
  };
  amount: number | bigint;
}): TransactionInstruction {
  const programId = args.programId ?? TREASURY_PROGRAM_ID;
  const a = args.accounts;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(args.amount));
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: a.config, isSigner: false, isWritable: true },
      { pubkey: a.revenueEscrow, isSigner: false, isWritable: true },
      { pubkey: a.insuranceEscrow, isSigner: false, isWritable: true },
      { pubkey: a.governance, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([ACTIVATE_INSURANCE_DISCRIMINATOR, buf]),
  });
}
