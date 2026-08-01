import type { FastifyInstance } from "fastify";
import type { Repositories } from "../db/repositories.js";

export async function registerLeaderboardRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  app.get(
    "/api/v1/leaderboard",
    {
      schema: {
        tags: ["leaderboard"],
        response: { 200: { type: "object", properties: { data: { type: "array" } } } },
      },
    },
    async () => ({ data: await repos.managers.leaderboard() }),
  );
}
