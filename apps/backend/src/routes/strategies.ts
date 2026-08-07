import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { riskTierFromScore } from "../services/scoring/index.js";
import { NonceStore, requireWalletSignature } from "../services/auth/signature.js";
import { validateStrategyParams } from "strategy-sdk";

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

      // Strategy SDK validation (roadmap §Phase 3): validate params against the
      // per-strategy-type schema; normalize defaults and reject unknown fields.
      const validation = validateStrategyParams(upload.type, upload.protocol, upload.params);
      if (!validation.ok) {
        return reply.status(400).send({
          error: "invalid_strategy_params",
          message: validation.errors.join("; "),
          statusCode: 400,
        });
      }

      const strategy = await repos.strategies.create({
        ...upload,
        params: validation.normalized,
      });
      return reply.status(201).send({ data: strategy });
    },
  );
}
