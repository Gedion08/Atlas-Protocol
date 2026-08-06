export type Address = string;

export type VaultStatus = "active" | "paused" | "emergency";
export type ManagerStatus = "inactive" | "active" | "suspended" | "banned";
export type StrategyType =
  | "passive"
  | "active"
  | "ai-assisted"
  | "rule-based"
  | "scheduled"
  | "adaptive";

export interface ManagerScore {
  feeGeneration: number;
  risk: number;
  drawdown: number;
  capitalRetention: number;
  consistency: number;
  tvlGrowth: number;
  governanceParticipation: number;
  total: number;
}

export interface ManagerProfile {
  id: Address;
  owner: Address;
  name: string;
  status: ManagerStatus;
  score: ManagerScore;
  bondAmount: number;
  tvl: number;
  assetsUnderManagement: number;
  pnl: number;
  maxDrawdown: number;
  feesGenerated: number;
  poolsTraded: number;
  protocolsUsed: string[];
  yearsActive: number;
  createdAt: number;
  updatedAt: number;
}

export type StrategyStatus = "active" | "pending" | "rejected";
export type StrategyProtocol =
  | "meteora"
  | "orca"
  | "raydium"
  | "kamino"
  | "jupiter"
  | "drift"
  | "sanctum"
  | "marinade";

export interface Strategy {
  id: string;
  managerId: Address;
  name: string;
  type: StrategyType;
  protocol: StrategyProtocol;
  pool: string;
  pair: string;
  tvl: number;
  apy: number;
  apr: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  fees: { managementBps: number; performanceBps: number };
  impermanentLoss: number;
  utilization: number;
  ageDays: number;
  version: number;
  riskTier: 1 | 2 | 3 | 4 | 5;
  status?: StrategyStatus;
  description?: string;
  /** Parameterized strategy definition (SDK-shaped, JSON-serializable). */
  params?: Record<string, unknown>;
  createdAt?: number;
}

export interface StrategyUpload {
  managerId: Address;
  name: string;
  type: StrategyType;
  protocol: StrategyProtocol;
  pool: string;
  pair: string;
  fees: { managementBps: number; performanceBps: number };
  riskTier: 1 | 2 | 3 | 4 | 5;
  description?: string;
  /** Parameterized strategy definition (SDK-shaped, JSON-serializable). */
  params?: Record<string, unknown>;
}

export interface StrategyParams {
  version: string;
  schema: Record<string, unknown>;
  defaults: Record<string, unknown>;
}

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

export function validateStrategyParams(
  type: StrategyType,
  params?: Record<string, unknown>,
): { ok: boolean; errors: string[]; normalized: Record<string, unknown> } {
  const definition = STRATEGY_PARAMS[type];
  const errors: string[] = [];
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

export interface RiskMetrics {
  var95: number;
  var99: number;
  expectedShortfall: number;
  volatility: number;
  impermanentLoss: number;
  maxDrawdown: number;
  dailyPnl: number;
  weeklyPnl: number;
  poolConcentration: number;
  tokenConcentration: number;
  protocolConcentration: number;
  memecoinConcentration: number;
  stablePoolConcentration: number;
  slippage: number;
  feeDecay: number;
  oracleHealth: number;
  utilization: number;
  inventoryImbalance: number;
}

export interface RiskRuleViolation {
  rule: string;
  limit: number;
  current: number;
  severity: "warning" | "critical";
}

export type RiskAction = "ok" | "reduce" | "pause";

export interface RiskDecision {
  action: RiskAction;
  violations: RiskRuleViolation[];
  score: number;
  evaluatedAt: number;
}

export interface ManagerAllocationInput {
  id: Address;
  riskScore: number;
  managerScore: number;
  tvl: number;
  feeEfficiency: number;
  sharpe: number;
  impermanentLoss: number;
  volatility: number;
  consistency: number;
  utilization: number;
  ageDays: number;
}

export interface AllocationConstraints {
  maxPerManager: number;
  maxPerProtocol: number;
  maxPerToken: number;
  maxMemecoins: number;
  maxStablePools: number;
  cashReserve: number;
}

export const DEFAULT_ALLOCATION_CONSTRAINTS: AllocationConstraints = {
  maxPerManager: 0.3,
  maxPerProtocol: 0.4,
  maxPerToken: 0.2,
  maxMemecoins: 0.1,
  maxStablePools: 0.25,
  cashReserve: 0.1,
};

export interface AllocationShare {
  managerId: Address;
  share: number;
  amount: number;
}

export interface AllocationResult {
  shares: AllocationShare[];
  cashReserve: number;
  cashAmount: number;
  totalAmount: number;
  constraints: AllocationConstraints;
  generatedAt: number;
}

/**
 * On-chain metadata for a vault whose deposits/withdrawals transact through the
 * deployed `atlas-vault` program. Absent for demo vaults, which keep the legacy
 * message-signed, DB-ledger flow.
 */
export interface OnchainVaultMeta {
  /** atlas-vault program id. */
  programId: Address;
  /** PDA of the vault account: ["atlas_vault", authority, base_mint]. */
  vaultPda: Address;
  /** Protocol-side deployer / vault owner. */
  authority: Address;
  /** Linked on-chain manager profile PDA: ["manager", manager_owner]. */
  managerProfile: Address;
  /** Base token mint (deposits are this token). */
  baseMint: Address;
  /** Vault escrow token account PDA: ["escrow", vault, base_mint]. */
  escrowPda: Address;
  /** Vault shares mint PDA: ["shares", vault]. */
  sharesMint: Address;
  /** Base mint decimals (deposits in base units = amount * 10^decimals). */
  decimals: number;
}

export interface Vault {
  address: Address;
  name: string;
  baseAsset: string;
  managerId: Address;
  authority: Address;
  status: VaultStatus;
  tvl: number;
  apy: number;
  sharesOutstanding: number;
  /** NAV/share in display units (on-chain vaults carry the oracle-attested value). */
  sharePrice?: number;
  managementFeeBps: number;
  performanceFeeBps: number;
  minDeposit: number;
  allocation: AllocationResult | null;
  createdAt: number;
  lastRebalanceAt: number;
  /** Present only for on-chain vaults (see {@link OnchainVaultMeta}). */
  onchain?: OnchainVaultMeta;
}

export interface PerformancePoint {
  timestamp: number;
  tvl: number;
  nav: number;
  apy: number;
  pnl: number;
}

export interface ManagerPerformance {
  managerId: Address;
  series: PerformancePoint[];
  apy: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  ulcerIndex: number;
  winRate: number;
  recoveryFactor: number;
  capitalEfficiency: number;
  liquidityUtilization: number;
  realizedFees: number;
  unrealizedFees: number;
}

export interface LeaderboardEntry extends ManagerProfile {
  rank: number;
  apy: number;
  sharpe: number;
  maxDrawdown: number;
}

export interface ScoreInputs {
  feeGeneration: number;
  risk: number;
  drawdown: number;
  capitalRetention: number;
  consistency: number;
  tvlGrowth: number;
  governanceParticipation: number;
}

export interface ScoreBreakdown {
  feeGeneration: number;
  risk: number;
  drawdown: number;
  capitalRetention: number;
  consistency: number;
  tvlGrowth: number;
  governanceParticipation: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
  weights: ScoreWeights;
}

export interface ScoreWeights {
  feeGeneration: number;
  risk: number;
  drawdown: number;
  capitalRetention: number;
  consistency: number;
  tvlGrowth: number;
  governanceParticipation: number;
}

export interface StrategyBasket {
  id: string;
  name: string;
  strategies: string[];
  totalAllocation: number;
}

export type ProposalClass = "parametric" | "fiscal" | "protocol_critical" | "constitutional";
export type ProposalStatus = "active" | "succeeded" | "defeated" | "expired" | "executed";

export interface GovernanceProposal {
  id: string;
  proposer: Address;
  class: ProposalClass;
  title: string;
  targetProgram?: Address;
  /** Hex-encoded instruction payload executed on passage. */
  instructionData?: string;
  quorumWeight: number;
  forVotes: number;
  againstVotes: number;
  startVotingAt: number;
  endVotingAt: number;
  executionAt: number;
  status: ProposalStatus;
}

export interface GovernanceVote {
  proposalId: string;
  voter: Address;
  weight: number;
  inFavor: boolean;
  at: number;
}

export interface VeLockView {
  holder: Address;
  delegate?: Address;
  amount: number;
  /** Decayed voting weight (mirrors on-chain ve-lock weight). */
  weight: number;
  unlockAt: number;
  swept: boolean;
}

export interface ProposalInput {
  proposer: Address;
  class: ProposalClass;
  title: string;
  targetProgram?: Address;
  instructionData?: string;
  /** Voting end override (defaults to now + 7 days). */
  endVotingAt?: number;
}

export interface VoteInput {
  voter: Address;
  inFavor: boolean;
}

export type PositionStatus = "pending" | "active" | "withdrawn";

/** An investor's capital in a vault (shares against a vault). */
export interface InvestorPosition {
  id: string;
  investor: Address;
  vaultAddress: Address;
  /** Strategy the position was directed toward (optional). */
  strategyId?: Address;
  /** Base-asset amount deposited at entry. */
  amount: number;
  /** Vault shares received at entry (price-accounted). */
  shares: number;
  /** NAV/share at entry (oracle-priced). */
  sharePrice: number;
  status: PositionStatus;
  createdAt: number;
  /** On-chain vaults only: base tokens (base units) claimable now via settle. */
  claimable?: number;
  /** On-chain vaults only: shares locked in an outstanding withdrawal request. */
  pendingShares?: number;
  /** On-chain vaults only: slot after which the pending request can be settled. */
  settlementSlot?: number;
}

export interface DepositInput {
  investor: Address;
  amount: number;
  strategyId?: Address;
}

export interface WithdrawInput {
  investor: Address;
  shares: number;
}

export interface InvestorSummary {
  investor: Address;
  totalInvested: number;
  currentValue: number;
  positionCount: number;
  positions: InvestorPosition[];
  vaults: Address[];
}

export interface DlmmBinState {
  binId: number;
  baseAmount: number;
  quoteAmount: number;
  active?: boolean;
}

export interface DlmmSnapshot {
  strategyId: string;
  pool: string;
  pair: string;
  protocol: string;
  binStep: number;
  bins: DlmmBinState[];
  timestamp: number;
  feePerActiveBin?: number;
  priceDrift?: number;
}

export interface DlmmAnalytics {
  strategyId: string;
  pool: string;
  pair: string;
  protocol: string;
  timestamp: number;
  totalBins: number;
  activeBin: number | null;
  activeBinPct: number;
  topDecileConcentration: number;
  halfLiquidityBins: number;
  inventorySkew: number;
  totalValue: number;
  binCrossingFrequency: number;
  rebalanceFrequency: number;
  feePerActiveBin: number;
  priceDrift: number;
}
