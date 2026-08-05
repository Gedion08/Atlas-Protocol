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
