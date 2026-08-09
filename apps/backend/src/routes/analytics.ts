import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Repositories } from "../db/repositories.js";
import {
  type DlmmAnalytics,
  analyzeDlmm,
  type DlmmAnalyticsStore,
  ClickHouseDlmmAnalyticsStore,
} from "../services/analytics/dlmm.js";
import { DlmmFetcher } from "../services/analytics/dlmm-fetcher.js";

const strategyParam = z.object({ id: z.string().min(1) });

const dlmmQuery = z.object({
  protocol: z.enum(["meteora"]).optional(),
  pair: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const snapshotBody = z.object({
  strategyId: z.string().min(1),
  pool: z.string().min(1),
  pair: z.string().min(1),
  protocol: z.string().default("meteora"),
  binStep: z.number().positive(),
  bins: z.array(
    z.object({
      binId: z.number(),
      baseAmount: z.number(),
      quoteAmount: z.number(),
      active: z.boolean().optional(),
    }),
  ),
  feePerActiveBin: z.number().optional(),
  priceDrift: z.number().optional(),
  timestamp: z.number().default(() => Date.now()),
});

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  repos: Repositories,
  dlmmStore?: DlmmAnalyticsStore,
): Promise<void> {
  const store = dlmmStore ?? new ClickHouseDlmmAnalyticsStore(process.env.CLICKHOUSE_URL ?? "http://localhost:8123");

  app.get(
    "/api/v1/analytics/dlmm",
    { schema: { tags: ["analytics"] } },
    async (request, _reply) => {
      const query = dlmmQuery.parse(request.query);
      const strategies = await repos.strategies.list({
        protocol: query.protocol ?? "meteora",
      });

      const results: DlmmAnalytics[] = [];
      for (const strategy of strategies) {
        if (query.pair && strategy.pair !== query.pair) continue;
        const latest = await store.latestForStrategy(strategy.id);
        if (latest) results.push(latest);
      }

      results.sort((a, b) => b.timestamp - a.timestamp);
      const limit = query.limit ?? results.length;
      return { data: results.slice(0, limit) };
    },
  );

  app.get(
    "/api/v1/analytics/dlmm/:strategyId",
    { schema: { tags: ["analytics"] } },
    async (request, reply) => {
      const { id } = strategyParam.parse(request.params);
      const strategy = await repos.strategies.get(id);
      if (!strategy) return reply.status(404).send({ error: "strategy_not_found", message: "Strategy not found", statusCode: 404 });

      const latest = await store.latestForStrategy(id);
      if (!latest) return reply.status(404).send({ error: "no_analytics", message: "No DLMM analytics available", statusCode: 404 });
      return { data: latest };
    },
  );

  app.get(
    "/api/v1/analytics/dlmm/:strategyId/history",
    { schema: { tags: ["analytics"] } },
    async (request, reply) => {
      const { id } = strategyParam.parse(request.params);
      const strategy = await repos.strategies.get(id);
      if (!strategy) return reply.status(404).send({ error: "strategy_not_found", message: "Strategy not found", statusCode: 404 });

      const from = Number((request.query as Record<string, unknown>)?.from ?? 0);
      const to = Number((request.query as Record<string, unknown>)?.to ?? Date.now());
      const history = await store.historyForStrategy(id, from, to);
      return { data: history };
    },
  );

  app.post(
    "/api/v1/analytics/dlmm/ingest",
    { schema: { tags: ["analytics"] } },
    async (request, reply) => {
      const snapshot = snapshotBody.parse(request.body);
      const analytics = analyzeDlmm(snapshot);
      await store.append(analytics);
      return reply.status(201).send({ data: analytics });
    },
  );

  app.post(
    "/api/v1/analytics/dlmm/:strategyId/refresh",
    { schema: { tags: ["analytics"] } },
    async (request, reply) => {
      const { id } = strategyParam.parse(request.params);
      const strategy = await repos.strategies.get(id);
      if (!strategy || strategy.protocol !== "meteora") {
        return reply.status(404).send({ error: "strategy_not_found", message: "Meteora DLMM strategy not found", statusCode: 404 });
      }

      const fetcher = new DlmmFetcher({
        fetchImpl: fetch.bind(globalThis),
      });

      const snapshot = await fetcher.fetchBinSnapshot(strategy.pool);
      if (!snapshot) {
        return reply.status(502).send({ error: "fetch_failed", message: "Failed to fetch DLMM bin snapshot from Meteora", statusCode: 502 });
      }

      const analytics = analyzeDlmm({ ...snapshot, strategyId: id, timestamp: Date.now() });
      await store.append(analytics);
      return { data: analytics };
    },
  );
}
