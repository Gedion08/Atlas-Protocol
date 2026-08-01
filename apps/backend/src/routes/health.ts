import type { FastifyInstance } from "fastify";
import type { Env } from "../env.js";
import type { Repositories } from "../db/repositories.js";
import { ApiError } from "../plugins/errors.js";

export async function registerHealthRoutes(
  app: FastifyInstance,
  repos: Repositories,
  env: Env,
): Promise<void> {
  app.get(
    "/health/live",
    { schema: { tags: ["health"], hide: true } },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/health/ready",
    { schema: { tags: ["health"], hide: true } },
    async () => {
      try {
        await repos.managers.list();
      } catch (err) {
        throw new ApiError(503, "not_ready", "Repository unavailable", { cause: String(err) });
      }
      return { status: "ready", driver: env.REPOSITORY_DRIVER };
    },
  );

  app.get(
    "/health",
    { schema: { tags: ["health"], hide: true } },
    async () => ({ status: "ok", services: { repository: env.REPOSITORY_DRIVER } }),
  );
}
