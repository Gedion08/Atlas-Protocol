import type { StrategyType, StrategyProtocol, StrategyParams } from "./types.js";

export const STRATEGY_PARAMS: Record<StrategyType, Record<string, StrategyParams>> = {
  passive: {
    default: {
      version: "1.0.0",
      schema: {
        type: "object",
        required: ["rebalanceThresholdBps"],
        properties: {
          rebalanceThresholdBps: { type: "number", minimum: 1, maximum: 1000 },
          maxSlippageBps: { type: "number", minimum: 1, maximum: 500 },
          allowedProtocols: { type: "array", items: { type: "string" } },
        },
      },
      defaults: { rebalanceThresholdBps: 50, maxSlippageBps: 10, allowedProtocols: [] },
    },
    meteora: {
      version: "1.0.0",
      schema: {
        type: "object",
        properties: {
          spreadBps: { type: "number", minimum: 1, maximum: 1000 },
          bins: { type: "number", minimum: 1, maximum: 100 },
        },
      },
      defaults: { spreadBps: 0, bins: 0 },
    },
    kamino: {
      version: "1.0.0",
      schema: {
        type: "object",
        properties: {
          tickLower: { type: "number", minimum: -443636, maximum: 443636 },
          tickUpper: { type: "number", minimum: -443636, maximum: 443636 },
        },
      },
      defaults: { tickLower: -1000, tickUpper: 1000 },
    },
    orca: {
      version: "1.0.0",
      schema: {
        type: "object",
        properties: {
          spreadBps: { type: "number", minimum: 1, maximum: 1000 },
          bins: { type: "number", minimum: 1, maximum: 100 },
        },
      },
      defaults: { spreadBps: 0, bins: 0 },
    },
  },
  active: {
    default: {
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
    jupiter: {
      version: "1.0.0",
      schema: {
        type: "object",
        required: ["maxSlippageBps"],
        properties: {
          maxSlippageBps: { type: "number", minimum: 1, maximum: 500 },
          limitPrice: { type: "number", minimum: 0 },
        },
      },
      defaults: { maxSlippageBps: 50, limitPrice: 0 },
    },
    drift: {
      version: "1.0.0",
      schema: {
        type: "object",
        required: ["leverage"],
        properties: {
          leverage: { type: "number", minimum: 1, maximum: 10 },
          maxPositionBps: { type: "number", minimum: 1, maximum: 10000 },
        },
      },
      defaults: { leverage: 2, maxPositionBps: 5000 },
    },
  },
  "ai-assisted": {
    default: {
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
  },
  "rule-based": {
    default: {
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
  },
  scheduled: {
    default: {
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
  },
  adaptive: {
    default: {
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
  },
};
