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

  await app.register(import("@fastify/cors"), {
    origin: env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(","),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400,
  });
}
