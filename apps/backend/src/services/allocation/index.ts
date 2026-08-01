import type {
  AllocationConstraints,
  AllocationResult,
  ManagerAllocationInput,
} from "atlas-types";
import { DEFAULT_ALLOCATION_CONSTRAINTS as DEFAULT_CONSTRAINTS } from "atlas-types";

export { DEFAULT_CONSTRAINTS as DEFAULT_ALLOCATION_CONSTRAINTS };

export function computeRawWeight(input: ManagerAllocationInput): number {
  if (input.tvl <= 0) return 0;

  const scoreFactor = input.managerScore / 100;
  const riskFactor = 1 - Math.min(input.riskScore, 100) / 100;
  const feeFactor = 0.5 + input.feeEfficiency * 0.5;
  const consistencyFactor = 0.5 + input.consistency / 200;
  const volatilityFactor = 1 - Math.min(input.volatility, 100) / 200;
  const ageFactor = Math.min(1, 0.4 + input.ageDays / 365);
  const trackRecordFactor = 0.5 + 0.5 / (1 + Math.exp(-input.tvl / 1_000_000));

  return (
    Math.pow(scoreFactor, 2) *
    riskFactor *
    feeFactor *
    consistencyFactor *
    volatilityFactor *
    ageFactor *
    trackRecordFactor
  );
}

function normalize(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  return weights.map((w) => w / sum);
}

export function waterFill(
  raw: number[],
  targetTotal: number,
  cap: number,
): number[] {
  const n = raw.length;
  const order = raw.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);

  let prefixSum = 0;
  let lambda = targetTotal;
  let frozen = 0;

  for (let k = 0; k < n; k++) {
    const rest = order.slice(k).reduce((acc, o) => acc + o.w, 0);
    if (rest <= 0) {
      frozen = k;
      lambda = 0;
      break;
    }
    const candidate = (targetTotal - prefixSum) / rest;
    if (candidate * order[k].w <= cap + 1e-9) {
      frozen = k;
      lambda = candidate;
      break;
    }
    prefixSum += cap;
    frozen = k + 1;
  }

  const result = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const { w, i: index } = order[i];
    result[index] = i < frozen ? cap : Math.max(0, lambda * w);
  }
  return result;
}

export function allocate(
  inputs: ManagerAllocationInput[],
  totalAmount: number,
  constraints: AllocationConstraints = DEFAULT_CONSTRAINTS,
): AllocationResult {
  const generatedAt = Date.now();

  if (inputs.length === 0) {
    return {
      shares: [],
      cashReserve: constraints.cashReserve,
      cashAmount: totalAmount * constraints.cashReserve,
      totalAmount,
      constraints,
      generatedAt,
    };
  }

  const raw = inputs.map(computeRawWeight);
  const targetTotal = Math.min(1 - constraints.cashReserve, raw.length * constraints.maxPerManager);
  const filled = waterFill(raw, Math.max(0, targetTotal), constraints.maxPerManager);

  const invested = filled.reduce((a, b) => a + b, 0);
  const cashReserve = Math.max(constraints.cashReserve, 1 - invested);
  const investable = totalAmount * invested;

  const shares = inputs
    .map((input, i) => ({
      managerId: input.id,
      share: Math.round(filled[i] * 10_000) / 10_000,
      amount: Math.round(investable * (filled[i] / invested) * 100) / 100,
    }))
    .filter((s) => s.share > 0)
    .sort((a, b) => b.share - a.share);

  return {
    shares,
    cashReserve: Math.round(cashReserve * 10_000) / 10_000,
    cashAmount: Math.round(totalAmount * cashReserve * 100) / 100,
    totalAmount,
    constraints,
    generatedAt,
  };
}

export function reallocationNeeded(
  previous: AllocationResult,
  currentInputs: ManagerAllocationInput[],
  threshold = 0.05,
): boolean {
  const fresh = allocate(currentInputs, previous.totalAmount, previous.constraints);
  let drift = Math.abs(previous.cashReserve - fresh.cashReserve);

  for (const share of fresh.shares) {
    const prevShare = previous.shares.find((s) => s.managerId === share.managerId)?.share ?? 0;
    drift += Math.abs(prevShare - share.share);
  }
  return drift > threshold;
}
