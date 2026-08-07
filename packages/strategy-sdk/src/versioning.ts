export interface VersionedStrategy {
  id: string;
  managerId: string;
  name: string;
  version: number;
  createdAt: number;
}

export function nextVersion(strategies: VersionedStrategy[], managerId: string, name: string): number {
  const previous = strategies
    .filter((s) => s.managerId === managerId && s.name === name)
    .reduce((max, s) => Math.max(max, s.version), 0);
  return previous + 1;
}

export function compareVersions(a: number, b: number): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isNewerVersion(strategy: VersionedStrategy, candidate: VersionedStrategy): boolean {
  return (
    strategy.managerId === candidate.managerId &&
    strategy.name === candidate.name &&
    candidate.version > strategy.version
  );
}
