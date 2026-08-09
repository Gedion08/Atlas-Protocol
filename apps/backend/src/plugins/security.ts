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

export function withRateLimit(
  route: Record<string, unknown>,
  max: number,
  timeWindow: string,
): void {
  const existing = route.options.preHandler as unknown[] | undefined;
  const handler = async (request: { ip: string }, reply: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const key = `${request.ip}:${route.options.schema?.tags?.[0] ?? "unknown"}`;
    const now = Date.now();
    const windowMs = parseTimeWindow(timeWindow);
    const store = (route as unknown as { _rateLimitStore?: Map<string, { count: number; resetAt: number }> })._rateLimitStore ?? new Map();
    (route as unknown as { _rateLimitStore?: Map<string, { count: number; resetAt: number }> })._rateLimitStore = store;
    const entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= max) {
      reply.status(429).send({
        error: "too_many_requests",
        message: `Rate limit exceeded: ${max} requests per ${timeWindow}`,
        statusCode: 429,
      });
      return;
    } else {
      entry.count += 1;
    }
  };
  route.options.preHandler = existing ? [...existing, handler] : [handler];
}

function parseTimeWindow(window: string): number {
  if (window.endsWith(" minute")) return Number(window.split(" ")[0]) * 60_000;
  if (window.endsWith(" second")) return Number(window.split(" ")[0]) * 1_000;
  return 60_000;
}
