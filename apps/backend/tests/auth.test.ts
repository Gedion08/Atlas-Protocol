import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  NonceStore,
  buildAuthMessage,
  verifyWalletSignature,
} from "../src/services/auth/signature.js";

describe("NonceStore", () => {
  it("accepts a fresh nonce once and rejects reuse", () => {
    const store = new NonceStore(60_000);
    const nonce = "n1";
    expect(store.isFresh(nonce)).toBe(true);
    store.consume(nonce);
    expect(store.isFresh(nonce)).toBe(false);
  });

  it("expires nonces after the TTL", () => {
    let now = 1_000;
    const store = new NonceStore(60_000, () => now);
    const nonce = "old";
    store.consume(nonce);
    now = 1_000 + 60_001;
    expect(store.isFresh(nonce)).toBe(true);
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
