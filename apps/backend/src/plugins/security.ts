import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(import("@fastify/helmet"), {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  });

  await app.register(import("@fastify/rate-limit"), {
    max: env.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => ({
      error: "too_many_requests",
      message: `Rate limit exceeded: ${context.max} requests per minute`,
      statusCode: 429,
    }),
  });

  const corsOrigins = env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",");
  app.log.info(
    { origins: corsOrigins, raw: env.CORS_ORIGINS },
    "registering CORS",
  );

  await app.register(import("@fastify/cors"), {
    origin: corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-atlas-owner",
      "x-atlas-nonce",
      "x-atlas-signature",
    ],
    exposedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400,
  });
}

export function createRateLimit(max: number, timeWindowMs: number) {
  const store = new Map<string, { count: number; resetAt: number }>();
  return async (request: { ip: string }, reply: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const key = request.ip;
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + timeWindowMs });
    } else if (entry.count >= max) {
      reply.status(429).send({
        error: "too_many_requests",
        message: `Rate limit exceeded: ${max} requests per ${timeWindowMs}ms`,
        statusCode: 429,
      });
      return;
    } else {
      entry.count += 1;
    }
  };
}
