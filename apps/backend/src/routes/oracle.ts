import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";

const managerParam = z.object({ id: z.string().min(1) });
const limitParam = z.object({ limit: z.coerce.number().int().positive().max(100).optional() });

export async function registerOracleRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  app.get(
    "/api/v1/oracle/submissions",
    { schema: { tags: ["oracle"] } },
    async (request) => {
      const { limit } = limitParam.parse(request.query);
      return { data: await repos.oracle.latestSubmissions(undefined, limit) };
    },
  );

  app.get(
    "/api/v1/oracle/managers/:id",
    { schema: { tags: ["oracle"] } },
    async (request, reply) => {
      const { id } = managerParam.parse(request.params);
      const manager = await repos.managers.get(id);
      if (!manager) return reply.status(404).send({ error: "manager_not_found", message: "Manager not found", statusCode: 404 });
      const { limit } = limitParam.parse(request.query);
      return { data: await repos.oracle.latestSubmissions(id, limit) };
    },
  );
}
