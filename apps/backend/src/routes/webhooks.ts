import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import { ApiError } from "../plugins/errors.js";
import { eventBus } from "../event-bus.js";
import {
  normalizeHeliusWebhook,
  verifyWebhookSignature,
  type HeliusTransaction,
} from "../services/indexer/helius.js";

export async function registerWebhookRoutes(app: FastifyInstance, env: Env): Promise<void> {
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
      for (const event of events) {
        await eventBus.publish(event);
      }

      reply.status(200).send({ ok: true, processed: events.length });
    },
  );
}
