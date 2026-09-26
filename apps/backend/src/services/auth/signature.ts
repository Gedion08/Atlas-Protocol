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

export type SignedRequestResult =
  | { ok: true }
  | { ok: false; error: string; message: string; statusCode: number };

export interface SignedRequestDeps {
  nonces: NonceStore;
  ownerHeader: string | undefined;
  nonceHeader: string | undefined;
  signatureHeader: string | undefined;
  body: unknown;
  expectedOwner: string;
}

/**
 * Authenticates a wallet-signed request (spec §7.1): the client signs the
 * canonical auth message over the exact request-body JSON, so the server
 * re-derives it from the parsed body. `owner` must match the caller's public
 * key; nonces embed their issue time, are single-use, and expire 5 minutes
 * after issuance. Used by strategy uploads, vault deposits/withdrawals,
 * governance votes/proposals and governance-only actions.
 */
export function requireWalletSignature(deps: SignedRequestDeps): SignedRequestResult {
  const { ownerHeader, nonceHeader, signatureHeader, body } = deps;
  if (!ownerHeader || !nonceHeader || !signatureHeader) {
    return {
      ok: false,
      error: "missing_signature_headers",
      message: "x-atlas-owner, x-atlas-nonce and x-atlas-signature headers are required",
      statusCode: 401,
    };
  }
  if (ownerHeader !== deps.expectedOwner) {
    return { ok: false, error: "signer_mismatch", message: "Signer is not the expected wallet", statusCode: 403 };
  }
  if (!deps.nonces.isFresh(nonceHeader)) {
    return { ok: false, error: "stale_or_reused_nonce", message: "Nonce malformed, expired or already used", statusCode: 400 };
  }
  const payloadSha256 = sha256Hex(JSON.stringify(body));
  const message = buildAuthMessage({ owner: ownerHeader, nonce: nonceHeader, payloadSha256 });
  if (!verifyWalletSignature({ owner: ownerHeader, signature: signatureHeader, message })) {
    return { ok: false, error: "invalid_signature", message: "Signature verification failed", statusCode: 401 };
  }
  deps.nonces.consume(nonceHeader);
  return { ok: true };
}

/** Allowed client clock drift ahead of the server when checking nonce issue time. */
const MAX_NONCE_CLOCK_SKEW_MS = 60_000;

/** Issue time (ms) embedded in a `<unix-ms>-<random>` nonce, or null if malformed. */
export function nonceIssuedAt(nonce: string): number | null {
  const match = /^(\d{13})-[0-9a-z]{1,48}$/i.exec(nonce);
  return match ? Number(match[1]) : null;
}

/**
 * Single-use nonce registry (per-instance; Redis for multi-node). Nonces carry
 * their issue time (`newNonce()` format), so a nonce is only accepted within
 * `ttlMs` of issuance and is remembered until then. Once forgotten it is too old
 * to be accepted again, so evicting it can never re-open a replay window.
 */
export class NonceStore {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** True if the nonce is well-formed, within its validity window, and unused. */
  isFresh(nonce: string): boolean {
    const issuedAt = nonceIssuedAt(nonce);
    if (issuedAt === null) return false;
    const now = this.now();
    if (issuedAt > now + MAX_NONCE_CLOCK_SKEW_MS) return false;
    if (now - issuedAt > this.ttlMs) return false;
    return !this.seen.has(nonce);
  }

  consume(nonce: string): void {
    const issuedAt = nonceIssuedAt(nonce) ?? this.now();
    // Remember until the nonce ages out of its validity window (plus skew slack).
    this.seen.set(nonce, Math.max(issuedAt, this.now()) + this.ttlMs + MAX_NONCE_CLOCK_SKEW_MS);
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
