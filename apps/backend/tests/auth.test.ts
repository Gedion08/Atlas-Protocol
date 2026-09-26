import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  NonceStore,
  buildAuthMessage,
  newNonce,
  verifyWalletSignature,
} from "../src/services/auth/signature.js";

describe("NonceStore", () => {
  const T0 = 1_760_000_000_000;

  it("accepts a fresh nonce once and rejects reuse", () => {
    const store = new NonceStore(60_000, () => T0);
    const nonce = `${T0}-abc123`;
    expect(store.isFresh(nonce)).toBe(true);
    store.consume(nonce);
    expect(store.isFresh(nonce)).toBe(false);
  });

  it("never re-accepts a consumed nonce after the TTL", () => {
    let now = T0;
    const store = new NonceStore(60_000, () => now);
    const nonce = `${T0}-abc123`;
    store.consume(nonce);
    for (const later of [T0 + 60_001, T0 + 10 * 60_000, T0 + 24 * 3_600_000]) {
      now = later;
      expect(store.isFresh(nonce)).toBe(false);
    }
  });

  it("rejects nonces issued longer ago than the TTL even if never seen", () => {
    const store = new NonceStore(60_000, () => T0);
    expect(store.isFresh(`${T0 - 60_001}-abc123`)).toBe(false);
    expect(store.isFresh(`${T0 - 59_000}-abc123`)).toBe(true);
  });

  it("rejects nonces too far in the future and malformed nonces", () => {
    const store = new NonceStore(60_000, () => T0);
    expect(store.isFresh(`${T0 + 5 * 60_000}-abc123`)).toBe(false);
    expect(store.isFresh(`${T0 + 30_000}-abc123`)).toBe(true);
    expect(store.isFresh("n1")).toBe(false);
    expect(store.isFresh(`${T0}`)).toBe(false);
    expect(store.isFresh(`${T0}-bad nonce`)).toBe(false);
  });

  it("accepts nonces from newNonce()", () => {
    expect(new NonceStore().isFresh(newNonce())).toBe(true);
  });
});

describe("verifyWalletSignature", () => {
  it("accepts a valid detached signature and rejects tampering", () => {
    const keypair = Keypair.generate();
    const owner = keypair.publicKey.toBase58();
    const message = buildAuthMessage({
      owner,
      nonce: "n1",
      payloadSha256: "abc123",
    });
    const signature = bs58.encode(
      nacl.sign.detached(Buffer.from(message, "utf8"), keypair.secretKey),
    );
    expect(verifyWalletSignature({ owner, signature, message })).toBe(true);

    expect(
      verifyWalletSignature({ owner, signature, message: message + "x" }),
    ).toBe(false);
    expect(
      verifyWalletSignature({ owner: "not-base58", signature, message }),
    ).toBe(false);
    expect(
      verifyWalletSignature({ owner, signature: "shortsig", message }),
    ).toBe(false);
  });
});
