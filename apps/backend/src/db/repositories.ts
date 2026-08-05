import type {
  DepositInput,
  GovernanceProposal,
  GovernanceVote,
  InvestorPosition,
  LeaderboardEntry,
  ManagerPerformance,
  ManagerProfile,
  PerformancePoint,
  ProposalInput,
  ProposalStatus,
  Strategy,
  StrategyUpload,
  Vault,
  VeLockView,
  VoteInput,
} from "atlas-types";
import type { OracleSubmission } from "../services/oracle/index.js";
import type { TimeSeriesStore } from "../services/ingestion/timeseries.js";
import { seedLocks, seedManagers, seedProposals, seedStrategies, seedVaults } from "./seed.js";
import { bootstrapVault, readBootstrapState } from "./bootstrap-state.js";
import { classParams, lockWeight, resolveProposal, VOTING_DURATION_SECS } from "../services/governance/index.js";
import { computePerfMetrics } from "../services/perf-metrics/index.js";

export interface ManagerRepository {
  list(): Promise<ManagerProfile[]>;
  get(id: string): Promise<ManagerProfile | null>;
  leaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  performance(id: string, days?: number): Promise<ManagerPerformance | null>;
}

export interface StrategyRepository {
  list(filter?: { managerId?: string; protocol?: string }): Promise<Strategy[]>;
  get(id: string): Promise<Strategy | null>;
  create(upload: StrategyUpload): Promise<Strategy>;
}

export interface VaultRepository {
  list(): Promise<Vault[]>;
  get(address: string): Promise<Vault | null>;
  update(vault: Vault): Promise<Vault>;
}

export interface InvestorRepository {
  listPositions(investor: string): Promise<InvestorPosition[]>;
  getPosition(id: string): Promise<InvestorPosition | null>;
  /** Mints vault shares against the vault's current share price. */
  deposit(vault: Vault, input: DepositInput): Promise<InvestorPosition>;
  /** Redeems shares at the current share price; returns proceeds and shares redeemed. */
  withdraw(
    positionId: string,
    vault: Vault,
    shares: number,
  ): Promise<{ position: InvestorPosition; proceeds: number; sharesRedeemed: number } | null>;
}

export interface OracleRepository {
  recordSubmission(submission: OracleSubmission): Promise<void>;
  latestSubmissions(managerId?: string, limit?: number): Promise<OracleSubmission[]>;
}

export interface GovernanceRepository {
  listProposals(status?: ProposalStatus): Promise<GovernanceProposal[]>;
  getProposal(id: string): Promise<GovernanceProposal | null>;
  createProposal(input: ProposalInput): Promise<GovernanceProposal>;
  castVote(proposalId: string, vote: VoteInput): Promise<GovernanceProposal | null>;
  listLocks(): Promise<VeLockView[]>;
  listVotes(proposalId?: string): Promise<GovernanceVote[]>;
  updateProposalStatus(id: string, status: ProposalStatus): Promise<void>;
}

export interface Repositories {
  managers: ManagerRepository;
  strategies: StrategyRepository;
  vaults: VaultRepository;
  investors: InvestorRepository;
  oracle: OracleRepository;
  governance: GovernanceRepository;
}

function makePerformance(
  manager: ManagerProfile,
  points: PerformancePoint[],
  days = 90,
): ManagerPerformance {
  const series = points.length > 0 ? points : deterministicSeries(manager, days);
  const navs = series.map((p) => p.nav);
  const avgTvl = series.length > 0
    ? series.reduce((acc, p) => acc + p.tvl, 0) / series.length
    : manager.tvl;
  const metrics = computePerfMetrics(navs, manager.tvl > 0 ? manager.feesGenerated / avgTvl : 0);

  return {
    managerId: manager.id,
    series,
    apy: metrics.apy,
    sharpe: metrics.sharpe,
    sortino: metrics.sortino,
    calmar: metrics.calmar,
    ulcerIndex: metrics.ulcerIndex * 100,
    winRate: metrics.winRate,
    recoveryFactor: metrics.recoveryFactor,
    capitalEfficiency: metrics.capitalEfficiency,
    liquidityUtilization: Math.min(1, (manager.poolsTraded * 2) / 30),
    realizedFees: manager.feesGenerated * 0.6,
    unrealizedFees: manager.feesGenerated * 0.4,
  };
}

function deterministicSeries(manager: ManagerProfile, days: number): PerformancePoint[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  const baseNav = Math.max(0.5, Math.min(3, manager.tvl / 10_000_000));
  const step = 1 + (manager.pnl / Math.max(1, manager.tvl)) / days;
  const series: PerformancePoint[] = [];
  let nav = 1;
  for (let i = days; i >= 0; i--) {
    nav *= i === days ? 1 : step;
    series.push({
      timestamp: now - i * dayMs,
      tvl: manager.tvl * nav * baseNav,
      nav,
      apy: Math.max(0, (step - 1) * 365),
      pnl: (nav - 1) * manager.tvl,
    });
  }
  return series;
}

export class InMemoryManagerRepository implements ManagerRepository {
  constructor(
    private readonly managers: ManagerProfile[],
    private readonly timeSeries?: TimeSeriesStore,
  ) {}

  async list(): Promise<ManagerProfile[]> {
    return [...this.managers].sort((a, b) => b.score.total - a.score.total);
  }

  async get(id: string): Promise<ManagerProfile | null> {
    return this.managers.find((m) => m.id === id) ?? null;
  }

  async leaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const entries: LeaderboardEntry[] = [];
    for (const m of [...this.managers].sort((a, b) => b.score.total - a.score.total).slice(0, limit)) {
      const points = this.timeSeries
        ? await this.timeSeries.metricsFor(m.id, 0, Date.now())
        : [];
      const performance = makePerformance(m, points.map(toPoint), 90);
      entries.push({
        ...m,
        rank: entries.length + 1,
        apy: performance.apy,
        sharpe: performance.sharpe,
        maxDrawdown: m.maxDrawdown,
      });
    }
    return entries;
  }

  async performance(id: string, days = 90): Promise<ManagerPerformance | null> {
    const manager = await this.get(id);
    if (!manager) return null;
    const from = Date.now() - days * 86_400_000;
    const points = this.timeSeries
      ? await this.timeSeries.metricsFor(id, from, Date.now())
      : [];
    return makePerformance(manager, points.map(toPoint), days);
  }
}

function toPoint(p: {
  managerId: string;
  timestamp: number;
  tvl: number;
  nav: number;
  dailyPnl: number;
}): PerformancePoint {
  return { timestamp: p.timestamp, tvl: p.tvl, nav: p.nav, pnl: p.dailyPnl, apy: 0 };
}

export class InMemoryGovernanceRepository implements GovernanceRepository {
  constructor(
    private readonly proposals: GovernanceProposal[],
    private readonly locks: VeLockView[],
    private readonly votes: GovernanceVote[] = [],
    private readonly now: () => number = Date.now,
  ) {}

  private resolve(proposal: GovernanceProposal): GovernanceProposal {
    const total = this.locks.reduce((sum, l) => sum + l.weight, 0);
    return resolveProposal(proposal, total, this.now());
  }

  async listProposals(status?: ProposalStatus): Promise<GovernanceProposal[]> {
    return this.proposals.map((p) => this.resolve(p)).filter((p) => !status || p.status === status);
  }

  async getProposal(id: string): Promise<GovernanceProposal | null> {
    const proposal = this.proposals.find((p) => p.id === id);
    return proposal ? this.resolve(proposal) : null;
  }

  async createProposal(input: ProposalInput): Promise<GovernanceProposal> {
    const nextId = String(
      this.proposals.reduce((max, p) => Math.max(max, Number(p.id)), 0) + 1,
    );
    const now = Math.floor(this.now() / 1000);
    const { quorumBps } = classParams(input.class);
    const totalVeWeight = this.locks.reduce((sum, l) => sum + l.weight, 0);
    const proposal: GovernanceProposal = {
      id: nextId,
      proposer: input.proposer,
      class: input.class,
      title: input.title,
      targetProgram: input.targetProgram,
      instructionData: input.instructionData,
      quorumWeight: Math.ceil((quorumBps * totalVeWeight) / 10_000),
      forVotes: 0,
      againstVotes: 0,
      startVotingAt: now,
      endVotingAt: input.endVotingAt ?? now + VOTING_DURATION_SECS,
      executionAt: 0,
      status: "active",
    };
    this.proposals.push(proposal);
    return proposal;
  }

  async castVote(proposalId: string, vote: VoteInput): Promise<GovernanceProposal | null> {
    const proposal = this.proposals.find((p) => p.id === proposalId);
    if (!proposal || proposal.status !== "active" || proposal.endVotingAt <= this.now() / 1000) {
      return proposal ? this.resolve(proposal) : null;
    }
    const lock = this.locks.find((l) => l.holder === vote.voter);
    const weight = lock ? lockWeight(lock, this.now()) : 0;
    if (weight <= 0) return this.resolve(proposal);

    const existing = this.votes.find(
      (v) => v.proposalId === proposalId && v.voter === vote.voter,
    );
    if (existing) {
      existing.inFavor = vote.inFavor;
      existing.weight = weight;
      existing.at = this.now();
    } else {
      this.votes.push({ proposalId, voter: vote.voter, weight, inFavor: vote.inFavor, at: this.now() });
    }
    const counted = this.votes.filter((v) => v.proposalId === proposalId);
    proposal.forVotes = counted.reduce((sum, v) => sum + (v.inFavor ? v.weight : 0), 0);
    proposal.againstVotes = counted.reduce((sum, v) => sum + (v.inFavor ? 0 : v.weight), 0);
    return this.resolve(proposal);
  }

  async listLocks(): Promise<VeLockView[]> {
    return this.locks;
  }

  async updateProposalStatus(id: string, status: ProposalStatus): Promise<void> {
    const proposal = this.proposals.find((p) => p.id === id);
    if (proposal) {
      proposal.status = status;
    }
  }

  async listVotes(proposalId?: string): Promise<GovernanceVote[]> {
    return this.votes.filter((v) => !proposalId || v.proposalId === proposalId);
  }
}

export class InMemoryOracleRepository implements OracleRepository {
  constructor(private readonly submissions: OracleSubmission[] = []) {}

  async recordSubmission(submission: OracleSubmission): Promise<void> {
    this.submissions.push(submission);
  }

  async latestSubmissions(managerId?: string, limit = 20): Promise<OracleSubmission[]> {
    const filtered = managerId
      ? this.submissions.filter((s) => s.managerId === managerId)
      : this.submissions;
    return filtered.slice(-limit).reverse();
  }
}

export class InMemoryStrategyRepository implements StrategyRepository {
  constructor(private readonly strategies: Strategy[]) {}

  async list(filter?: { managerId?: string; protocol?: string }): Promise<Strategy[]> {
    return this.strategies.filter(
      (s) =>
        (!filter?.managerId || s.managerId === filter.managerId) &&
        (!filter?.protocol || s.protocol === filter.protocol),
    );
  }

  async get(id: string): Promise<Strategy | null> {
    return this.strategies.find((s) => s.id === id) ?? null;
  }

  async create(upload: StrategyUpload): Promise<Strategy> {
    const previous = this.strategies
      .filter((s) => s.managerId === upload.managerId && s.name === upload.name)
      .reduce((max, s) => Math.max(max, s.version), 0);
    const strategy: Strategy = {
      id: `str_${upload.managerId}_${randomSuffix()}`,
      managerId: upload.managerId,
      name: upload.name,
      type: upload.type,
      protocol: upload.protocol,
      pool: upload.pool,
      pair: upload.pair,
      tvl: 0,
      apy: 0,
      apr: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      fees: upload.fees,
      impermanentLoss: 0,
      utilization: 0,
      ageDays: 0,
      version: previous + 1,
      riskTier: upload.riskTier,
      status: "active",
      description: upload.description,
      params: upload.params,
      createdAt: Date.now(),
    };
    this.strategies.push(strategy);
    return strategy;
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export class InMemoryVaultRepository implements VaultRepository {
  constructor(private readonly vaults: Vault[]) {}

  async list(): Promise<Vault[]> {
    return [...this.vaults].sort((a, b) => b.tvl - a.tvl);
  }

  async get(address: string): Promise<Vault | null> {
    return this.vaults.find((v) => v.address === address) ?? null;
  }

  async update(vault: Vault): Promise<Vault> {
    const index = this.vaults.findIndex((v) => v.address === vault.address);
    if (index >= 0) this.vaults[index] = vault;
    return vault;
  }
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export class InMemoryInvestorRepository implements InvestorRepository {
  constructor(
    private readonly positions: InvestorPosition[] = [],
    private readonly now: () => number = Date.now,
  ) {}

  async listPositions(investor: string): Promise<InvestorPosition[]> {
    return this.positions
      .filter((p) => p.investor === investor)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getPosition(id: string): Promise<InvestorPosition | null> {
    return this.positions.find((p) => p.id === id) ?? null;
  }

  async deposit(vault: Vault, input: DepositInput): Promise<InvestorPosition> {
    const sharePrice =
      vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 1;
    const shares = round6(input.amount / sharePrice);
    const position: InvestorPosition = {
      id: `pos_${input.investor.slice(0, 8)}_${randomSuffix()}`,
      investor: input.investor,
      vaultAddress: vault.address,
      strategyId: input.strategyId,
      amount: input.amount,
      shares,
      sharePrice,
      status: "active",
      createdAt: this.now(),
    };
    this.positions.push(position);
    return position;
  }

  async withdraw(
    positionId: string,
    vault: Vault,
    shares: number,
  ): Promise<{ position: InvestorPosition; proceeds: number; sharesRedeemed: number } | null> {
    const position = this.positions.find((p) => p.id === positionId);
    if (!position || position.status !== "active" || position.vaultAddress !== vault.address) {
      return null;
    }
    const sharePrice =
      vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : position.sharePrice;
    const sharesRedeemed = Math.min(round6(shares), position.shares);
    const proceeds = round6(sharesRedeemed * sharePrice);
    position.shares = round6(position.shares - sharesRedeemed);
    if (position.shares <= 0) position.status = "withdrawn";
    return { position, proceeds, sharesRedeemed };
  }
}

export function createMemoryRepositories(
  timeSeries?: TimeSeriesStore,
): Repositories {
  const state = readBootstrapState();
  const vaults = state ? [...seedVaults, bootstrapVault(state)] : seedVaults;
  return {
    managers: new InMemoryManagerRepository(seedManagers, timeSeries),
    strategies: new InMemoryStrategyRepository(seedStrategies),
    vaults: new InMemoryVaultRepository(vaults),
    investors: new InMemoryInvestorRepository(),
    oracle: new InMemoryOracleRepository(),
    governance: new InMemoryGovernanceRepository(seedProposals, seedLocks),
  };
}
