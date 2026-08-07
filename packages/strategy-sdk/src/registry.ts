export interface StrategyRegistryEntry {
  id: string;
  managerId: string;
  name: string;
  type: string;
  protocol: string;
  version: number;
  riskTier: number;
  status: string;
  params: Record<string, unknown>;
  createdAt: number;
}

export interface RegistryVersion {
  strategyId: string;
  version: number;
  publishedAt: number;
  schemaHash: string;
}

export function computeSchemaHash(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params, Object.keys(params).sort());
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export function diffVersions(a: RegistryVersion, b: RegistryVersion): string[] {
  const changes: string[] = [];
  if (a.version !== b.version) changes.push(`version: ${a.version} → ${b.version}`);
  if (a.schemaHash !== b.schemaHash) changes.push("params changed");
  return changes;
}
