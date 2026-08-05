// @vitest-environment node

import { describe, expect, it } from "vitest";
import { Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { base64ToBytes, decodeTransaction, toBaseUnits } from "@/lib/solana";

describe("solana helpers", () => {
  it("decodes base64 to bytes", () => {
    const bytes = base64ToBytes("aGVsbG8=");
    expect([...bytes]).toEqual([104, 101, 108, 108, 111]);
  });

  it("converts display amounts to base units", () => {
    expect(toBaseUnits(1.5, 6)).toBe(1_500_000);
    expect(toBaseUnits(0.01, 9)).toBe(10_000_000);
  });

  it("rounds base-unit conversions", () => {
    expect(toBaseUnits(0.123456789, 6)).toBe(123_457);
  });

  it("round-trips a serialized transaction", () => {
    const from = Keypair.generate();
    const to = Keypair.generate().publicKey;
    const tx = new Transaction();
    tx.feePayer = from.publicKey;
    tx.recentBlockhash = "11111111111111111111111111111111";
    tx.add(
      new TransactionInstruction({
        keys: [{ pubkey: to, isSigner: false, isWritable: true }],
        programId: from.publicKey,
        data: Buffer.from([1, 2, 3]),
      }),
    );
    const b64 = tx.serialize({ requireAllSignatures: false }).toString("base64");

    const decoded = decodeTransaction(b64);
    expect(decoded.instructions).toHaveLength(1);
    expect(decoded.feePayer?.toBase58()).toBe(from.publicKey.toBase58());
    expect(decoded.recentBlockhash).toBe("11111111111111111111111111111111");
  });
});
