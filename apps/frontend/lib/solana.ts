import { Transaction } from "@solana/web3.js";

/** Base64 string → bytes (browser-safe; no Buffer global needed). */
export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decodes a backend-assembled base64 transaction. */
export function decodeTransaction(base64: string): Transaction {
  return Transaction.from(base64ToBytes(base64));
}

/** Converts a display amount to on-chain base units (amount * 10^decimals). */
export function toBaseUnits(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals);
}

/** Vault shares are always 1e9-scaled on-chain. */
export const SHARE_SCALE = 1_000_000_000;
