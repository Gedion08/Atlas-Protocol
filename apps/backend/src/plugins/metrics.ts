import type { FastifyInstance } from "fastify";
import client from "prom-client";
import { env } from "../env.js";

export async function registerMetrics(app: FastifyInstance): Promise<void> {
  if (!env.METRICS_ENABLED) return;

  client.collectDefaultMetrics({ prefix: "atlas_" });

  const httpRequests = new client.Counter({
    name: "atlas_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status"],
  });

  const httpDuration = new client.Histogram({
    name: "atlas_http_request_duration_seconds",
    help: "HTTP request duration",
    labelNames: ["method", "route"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? request.url;
    httpRequests.inc({
      method: request.method,
      route,
      status: String(reply.statusCode),
    });
    const duration = reply.elapsedTime / 1000;
    httpDuration.observe({ method: request.method, route }, duration);
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", client.register.contentType);
    return client.register.metrics();
  });
}
