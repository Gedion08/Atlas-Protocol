import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import type { Repositories } from "../db/repositories.js";
import { ApiError } from "../plugins/errors.js";
import { eventBus } from "../event-bus.js";
import {
  normalizeHeliusWebhook,
  verifyWebhookSignature,
  type HeliusTransaction,
} from "../services/indexer/helius.js";

export async function registerWebhookRoutes(
  app: FastifyInstance,
  env: Env,
  repos: Repositories,
): Promise<void> {
  app.post(
    "/webhooks/helius",
    {
      schema: {
        tags: ["webhooks"],
        body: {
          type: "object",
          properties: { transactions: { type: "array" } },
        },
      },
    },
    async (request, reply) => {
      const signature = request.headers[env.HELIUS_WEBHOOK_SIGNATURE_HEADER] as
        | string
        | undefined;

      const valid = verifyWebhookSignature(
        Buffer.from(JSON.stringify(request.body)),
        signature,
        env.HELIUS_WEBHOOK_SECRET,
      );

      if (!valid) {
        throw new ApiError(401, "invalid_signature", "Invalid webhook signature");
      }

      const events = normalizeHeliusWebhook(
        request.body as { transactions?: HeliusTransaction[] },
      );

      const vaults = await repos.vaults.list();
      const vaultByAddress = new Map(vaults.map((v) => [v.address, v]));
      const strategies = await repos.strategies.list();
      const strategyByVault = new Map(strategies.map((s) => [s.pool, s]));

      for (const event of events) {
        if (!event.managerId && event.vaultAddress) {
          const vault = vaultByAddress.get(event.vaultAddress);
          if (vault) {
            event.managerId = vault.managerId;
            const strategy = strategies.find((s) => s.managerId === vault.managerId);
            if (strategy) {
              event.payload.pool = strategy.pool;
              event.payload.protocol = strategy.protocol;
              event.payload.pair = strategy.pair;
              event.strategyId = strategy.id;
            }
          }
        }
        await eventBus.publish(event);
      }

      reply.status(200).send({ ok: true, processed: events.length });
    },
  );
}
