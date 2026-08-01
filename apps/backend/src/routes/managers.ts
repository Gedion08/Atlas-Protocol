import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import { computeManagerScore } from "../services/scoring/index.js";
import { evaluateRiskRules } from "../services/risk-engine/index.js";
import type { RiskMetrics } from "atlas-types";

const managerParam = z.object({ id: z.string().min(1) });

const scoreSchema = z.object({
  feeGeneration: z.number().min(0).max(100),
  risk: z.number().min(0).max(100),
  drawdown: z.number().min(0).max(100),
  capitalRetention: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  tvlGrowth: z.number().min(0).max(100),
  governanceParticipation: z.number().min(0).max(100),
});

export async function registerManagerRoutes(
  app: FastifyInstance,
  repos: Repositories,
): Promise<void> {
  app.get(
    "/api/v1/managers",
    { schema: { tags: ["managers"] } },
    async () => ({ data: await repos.managers.list() }),
  );

  app.get(
    "/api/v1/managers/:id",
    { schema: { tags: ["managers"] } },
    async (request, reply) => {
      const { id } = managerParam.parse(request.params);
      const manager = await repos.managers.get(id);
      if (!manager) return reply.status(404).send({ error: "manager_not_found", message: "Manager not found", statusCode: 404 });
      return { data: manager };
    },
  );

  app.get(
    "/api/v1/managers/:id/performance",
    { schema: { tags: ["managers"] } },
    async (request, reply) => {
      const { id } = managerParam.parse(request.params);
      const manager = await repos.managers.get(id);
      if (!manager) return reply.status(404).send({ error: "manager_not_found", message: "Manager not found", statusCode: 404 });
      const performance = await repos.managers.performance(id);
      if (!performance) return reply.status(404).send({ error: "no_performance_data", message: "No performance data available", statusCode: 404 });
      return { data: performance };
    },
  );

  app.get(
    "/api/v1/managers/:id/risk",
    { schema: { tags: ["managers", "risk"] } },
    async (request, reply) => {
      const { id } = managerParam.parse(request.params);
      const manager = await repos.managers.get(id);
      if (!manager) return reply.status(404).send({ error: "manager_not_found", message: "Manager not found", statusCode: 404 });

      const metrics: RiskMetrics = {
        var95: 0.035,
        var99: 0.06,
        expectedShortfall: 0.045,
        volatility: manager.score.risk / 10,
        impermanentLoss: manager.maxDrawdown,
        maxDrawdown: manager.maxDrawdown,
        dailyPnl: manager.maxDrawdown / 30,
        weeklyPnl: manager.maxDrawdown / 4,
        poolConcentration: 0.22,
        tokenConcentration: 0.15,
        protocolConcentration: 0.35,
        memecoinConcentration: 0.02,
        stablePoolConcentration: 0.1,
        slippage: 0.004,
        feeDecay: 0.02,
        oracleHealth: 1,
        utilization: 0.8,
        inventoryImbalance: 0.05,
      };
      return { data: evaluateRiskRules(metrics) };
    },
  );

  app.post(
    "/api/v1/managers/score",
    {
      schema: {
        tags: ["managers", "scoring"],
        body: {
          type: "object",
          properties: {
            feeGeneration: { type: "number" },
            risk: { type: "number" },
            drawdown: { type: "number" },
            capitalRetention: { type: "number" },
            consistency: { type: "number" },
            tvlGrowth: { type: "number" },
            governanceParticipation: { type: "number" },
          },
          required: [
            "feeGeneration",
            "risk",
            "drawdown",
            "capitalRetention",
            "consistency",
            "tvlGrowth",
            "governanceParticipation",
          ],
        },
      },
    },
    async (request) => {
      const body = scoreSchema.parse(request.body);
      return { data: computeManagerScore(body) };
    },
  );
}
