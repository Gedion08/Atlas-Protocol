import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { riskTierFromScore } from "../services/scoring/index.js";
import {
  NonceStore,
  buildAuthMessage,
  sha256Hex,
  verifyWalletSignature,
} from "../services/auth/signature.js";

const strategyQuery = z.object({
  managerId: z.string().optional(),
  protocol: z
    .enum(["meteora", "orca", "raydium", "kamino", "jupiter", "drift", "sanctum", "marinade"])
    .optional(),
});

const strategyParam = z.object({ id: z.string().min(1) });

const strategyUploadBody = z.object({
  managerId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.enum(["passive", "active", "ai-assisted", "rule-based", "scheduled", "adaptive"]),
  protocol: z.enum([
    "meteora",
    "orca",
    "raydium",
    "kamino",
    "jupiter",
    "drift",
    "sanctum",
    "marinade",
  ]),
  pool: z.string().min(1).max(120),
  pair: z.string().min(1).max(60),
  fees: z.object({
    managementBps: z.number().int().min(0).max(5_000),
    performanceBps: z.number().int().min(0).max(10_000),
  }),
  riskTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  description: z.string().max(2_000).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Authenticates a wallet-signed request (spec §7.1): the client signs the
 * canonical auth message over the exact request-body JSON, so the server
 * re-derives it from the parsed body. `owner` must match the target manager's
 * on-chain owner public key; nonces are single-use and expire after 5 minutes.
 */
export function requireWalletSignature(deps: {
  nonces: NonceStore;
  ownerHeader: string | undefined;
  nonceHeader: string | undefined;
  signatureHeader: string | undefined;
  body: unknown;
  expectedOwner: string;
}): { ok: true } | { ok: false; error: string; message: string; statusCode: number } {
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
    return { ok: false, error: "signer_mismatch", message: "Signer is not the manager owner", statusCode: 403 };
  }
  if (!deps.nonces.isFresh(nonceHeader)) {
    return { ok: false, error: "stale_or_reused_nonce", message: "Nonce expired or already used", statusCode: 400 };
  }
  const payloadSha256 = sha256Hex(JSON.stringify(body));
  const message = buildAuthMessage({ owner: ownerHeader, nonce: nonceHeader, payloadSha256 });
  if (!verifyWalletSignature({ owner: ownerHeader, signature: signatureHeader, message })) {
    return { ok: false, error: "invalid_signature", message: "Signature verification failed", statusCode: 401 };
  }
  deps.nonces.consume(nonceHeader);
  return { ok: true };
}

export async function registerStrategyRoutes(
  app: FastifyInstance,
  repos: Repositories,
  nonces: NonceStore = new NonceStore(),
): Promise<void> {
  app.get(
    "/api/v1/strategies",
    { schema: { tags: ["strategies"] } },
    async (request) => {
      const query = strategyQuery.parse(request.query);
      return { data: await repos.strategies.list(query) };
    },
  );

  app.get(
    "/api/v1/strategies/:id",
    { schema: { tags: ["strategies"] } },
    async (request, reply) => {
      const { id } = strategyParam.parse(request.params);
      const strategy = await repos.strategies.get(id);
      if (!strategy) return reply.status(404).send({ error: "strategy_not_found", message: "Strategy not found", statusCode: 404 });
      return { data: strategy };
    },
  );

  app.get(
    "/api/v1/strategies/rankings",
    { schema: { tags: ["strategies"] } },
    async () => {
      const strategies = await repos.strategies.list();
      return {
        data: [...strategies].sort((a, b) => b.apy - a.apy).map((s, i) => ({ rank: i + 1, ...s })),
      };
    },
  );

  app.post(
    "/api/v1/strategies",
    { schema: { tags: ["strategies"] } },
    async (request, reply) => {
      const upload = strategyUploadBody.parse(request.body);

      const manager = await repos.managers.get(upload.managerId);
      if (!manager) {
        return reply.status(404).send({
          error: "manager_not_found",
          message: "Manager not found",
          statusCode: 404,
        });
      }
      if (manager.status !== "active") {
        return reply.status(403).send({
          error: "manager_not_active",
          message: "Only active managers may upload strategies",
          statusCode: 403,
        });
      }

      // Wallet-signature auth (spec §7.1): the uploader must be the manager's
      // on-chain owner wallet.
      const auth = requireWalletSignature({
        nonces,
        ownerHeader: request.headers["x-atlas-owner"] as string | undefined,
        nonceHeader: request.headers["x-atlas-nonce"] as string | undefined,
        signatureHeader: request.headers["x-atlas-signature"] as string | undefined,
        body: request.body,
        expectedOwner: manager.owner,
      });
      if (!auth.ok) {
        return reply.status(auth.statusCode).send(auth);
      }

      // Risk-tier gating (roadmap §Phase 4): a manager cannot list strategies
      // riskier than their own on-chain risk tier.
      const allowedTier = riskTierFromScore(manager.score.total);
      if (upload.riskTier > allowedTier) {
        return reply.status(403).send({
          error: "risk_tier_exceeded",
          message: `Manager tier ${allowedTier} cannot list a tier ${upload.riskTier} strategy`,
          statusCode: 403,
        });
      }

      const strategy = await repos.strategies.create(upload);
      return reply.status(201).send({ data: strategy });
    },
  );
}
