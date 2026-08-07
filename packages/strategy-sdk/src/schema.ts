import type { StrategyType, StrategyParams } from "./types.js";

export const STRATEGY_PARAMS: Record<StrategyType, StrategyParams> = {
  passive: {
    version: "1.0.0",
    schema: {
      type: "object",
      required: ["rebalanceThresholdBps"],
      properties: {
        rebalanceThresholdBps: { type: "number", minimum: 1, maximum: 1000 },
        maxSlippageBps: { type: "number", minimum: 1, maximum: 500 },
        spreadBps: { type: "number", minimum: 1, maximum: 1000 },
        bins: { type: "number", minimum: 1, maximum: 100 },
        allowedProtocols: { type: "array", items: { type: "string" } },
      },
    },
    defaults: { rebalanceThresholdBps: 50, maxSlippageBps: 10, spreadBps: 0, bins: 0, allowedProtocols: [] },
  },
  active: {
    version: "1.0.0",
    schema: {
      type: "object",
      required: ["maxLeverage", "stopLossBps"],
      properties: {
        maxLeverage: { type: "number", minimum: 1, maximum: 10 },
        stopLossBps: { type: "number", minimum: 100, maximum: 5000 },
        takeProfitBps: { type: "number", minimum: 100, maximum: 10000 },
      },
    },
    defaults: { maxLeverage: 2, stopLossBps: 1000, takeProfitBps: 3000 },
  },
  "ai-assisted": {
    version: "1.0.0",
    schema: {
      type: "object",
      required: ["modelId", "confidenceThreshold"],
      properties: {
        modelId: { type: "string", minLength: 1 },
        confidenceThreshold: { type: "number", minimum: 0, maximum: 1 },
        maxPositionCount: { type: "number", minimum: 1, maximum: 20 },
      },
    },
    defaults: { modelId: "default", confidenceThreshold: 0.7, maxPositionCount: 5 },
  },
  "rule-based": {
    version: "1.0.0",
    schema: {
      type: "object",
      required: ["rules"],
      properties: {
        rules: { type: "array", items: { type: "object" }, minItems: 1 },
        maxConcurrentTrades: { type: "number", minimum: 1, maximum: 10 },
      },
    },
    defaults: { rules: [], maxConcurrentTrades: 3 },
  },
  scheduled: {
    version: "1.0.0",
    schema: {
      type: "object",
      required: ["cron"],
      properties: {
        cron: { type: "string", minLength: 1 },
        maxTradeSizeUsd: { type: "number", minimum: 1 },
      },
    },
    defaults: { cron: "0 0 * * *", maxTradeSizeUsd: 10000 },
  },
  adaptive: {
    version: "1.0.0",
    schema: {
      type: "object",
      required: ["learningRate", "decayFactor"],
      properties: {
        learningRate: { type: "number", minimum: 0.001, maximum: 1 },
        decayFactor: { type: "number", minimum: 0.9, maximum: 0.999 },
        explorationRate: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    defaults: { learningRate: 0.01, decayFactor: 0.95, explorationRate: 0.1 },
  },
};
