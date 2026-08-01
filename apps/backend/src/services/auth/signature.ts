import { createHash, randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Wallet-signature authentication for privileged API calls (spec §7.1).
 *
 * The client signs an exact UTF-8 message and sends it alongside the payload;
 * the server re-derives the same message from the request body and verifies the
 * detached ed25519 signature against the manager's owner public key. Nonces are
 * single-use with a short TTL to prevent replay.
 */

export const AUTH_PREFIX = "atlas.request v1";

/** Canonical message the wallet must sign. */
export function buildAuthMessage(args: { owner: string; nonce: string; payloadSha256: string }): string {
  return [AUTH_PREFIX, args.owner, args.nonce, args.payloadSha256].join("\n");
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function newNonce(): string {
  return `${Date.now()}-${randomBytes(8).toString("hex")}`;
}

/**
 * Verifies a detached ed25519 signature (base58) over `message` (UTF-8 bytes)
 * against the base58 public key `owner`. Never throws; invalid inputs return false.
 */
export function verifyWalletSignature(args: {
  owner: string;
  signature: string;
  message: string;
}): boolean {
  try {
    const pub = bs58.decode(args.owner);
    const sig = bs58.decode(args.signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    return nacl.sign.detached.verify(Buffer.from(args.message, "utf8"), sig, pub);
  } catch {
    return false;
  }
}

/** Single-use nonce registry with TTL eviction (per-instance; Redis for multi-node). */
export class NonceStore {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True if the nonce is unseen and not expired; marks it consumed otherwise. */
  isFresh(nonce: string): boolean {
    const expiresAt = this.seen.get(nonce);
    if (expiresAt !== undefined && expiresAt > this.now()) return false;
    this.seen.delete(nonce);
    return true;
  }

  consume(nonce: string): void {
    this.seen.set(nonce, this.now() + this.ttlMs);
    if (this.seen.size > 10_000) this.evict();
  }

  private evict(): void {
    const now = this.now();
    for (const [nonce, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(nonce);
    }
  }

  /** Test helper. */
  clear(): void {
    this.seen.clear();
  }
}
