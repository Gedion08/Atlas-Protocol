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
  params?: Record<string, unknown>;
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
  managementFeeBps: number;
  performanceFeeBps: number;
  minDeposit: number;
  allocation: AllocationResult | null;
  createdAt: number;
  lastRebalanceAt: number;
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
