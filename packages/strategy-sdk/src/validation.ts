import type { StrategyType, StrategyProtocol, StrategyParams } from "./types.js";
import { STRATEGY_PARAMS } from "./schema.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  normalized: Record<string, unknown>;
}

function resolveParams(type: StrategyType, protocol: StrategyProtocol | "default"): StrategyParams | null {
  const typeMap = STRATEGY_PARAMS[type];
  if (!typeMap) return null;
  const protocolDef = typeMap[protocol] ?? typeMap["default"];
  const defaultDef = typeMap["default"];
  if (!protocolDef) return defaultDef ?? null;
  if (!defaultDef) return protocolDef;

  const defaultProperties = (defaultDef.schema.properties as Record<string, { type?: string; minimum?: number; maximum?: number; minItems?: number }>) ?? {};
  const protocolProperties = (protocolDef.schema.properties as Record<string, { type?: string; minimum?: number; maximum?: number; minItems?: number }>) ?? {};
  const mergedProperties = { ...defaultProperties, ...protocolProperties };

  const defaultRequired = (defaultDef.schema.required as string[] | undefined) ?? [];
  const protocolRequired = (protocolDef.schema.required as string[] | undefined) ?? [];
  const required = [...new Set([...defaultRequired, ...protocolRequired])];

  const mergedDefaults = { ...defaultDef.defaults, ...protocolDef.defaults };

  return {
    version: protocolDef.version || defaultDef.version,
    schema: {
      type: "object",
      required,
      properties: mergedProperties,
    },
    defaults: mergedDefaults,
  };
}

export function validateStrategyParams(
  type: StrategyType,
  protocol: StrategyProtocol | "default",
  params?: Record<string, unknown>,
): ValidationResult {
  const definition = resolveParams(type, protocol);
  const errors: string[] = [];
  if (!definition) {
    return { ok: false, errors: [`Unknown strategy type: ${type}`], normalized: {} };
  }
  if (!params || Object.keys(params).length === 0) {
    return { ok: true, errors: [], normalized: definition.defaults };
  }

  const normalized: Record<string, unknown> = { ...definition.defaults, ...params };
  const properties = definition.schema.properties as Record<string, { type?: string; minimum?: number; maximum?: number; minItems?: number }>;

  for (const [key, value] of Object.entries(params)) {
    const spec = properties[key];
    if (!spec) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }
    if (spec.type === "number") {
      const n = Number(value);
      if (Number.isNaN(n)) {
        errors.push(`${key} must be a number`);
      } else {
        if (spec.minimum !== undefined && n < spec.minimum) errors.push(`${key} below minimum ${spec.minimum}`);
        if (spec.maximum !== undefined && n > spec.maximum) errors.push(`${key} above maximum ${spec.maximum}`);
        normalized[key] = n;
      }
    }
    if (spec.type === "string" && typeof value !== "string") {
      errors.push(`${key} must be a string`);
    }
    if (spec.type === "array" && !Array.isArray(value)) {
      errors.push(`${key} must be an array`);
    }
    if (spec.minItems !== undefined && Array.isArray(value) && value.length < spec.minItems) {
      errors.push(`${key} must have at least ${spec.minItems} items`);
    }
  }

  return { ok: errors.length === 0, errors, normalized };
}

export function getStrategySchema(type: StrategyType, protocol: StrategyProtocol | "default"): StrategyParams | null {
  return resolveParams(type, protocol);
}

export function listStrategyTypes(): StrategyType[] {
  return Object.keys(STRATEGY_PARAMS) as StrategyType[];
}
