import type {
  DepositInput,
  GovernanceProposal,
  GovernanceVote,
  InvestorPosition,
  LeaderboardEntry,
  ManagerPerformance,
  ManagerProfile,
  OnchainVaultMeta,
  PerformancePoint,
  ProposalInput,
  ProposalStatus,
  Strategy,
  StrategyUpload,
  Vault,
  VeLockView,
  VoteInput,
} from "atlas-types";
import type { Pool } from "pg";
import { env } from "../env.js";
import type { OracleSubmission } from "../services/oracle/index.js";
import { buildPgPool, runMigrations, seedIfEmpty, upsertBootstrapVault } from "./bootstrap.js";
import { classParams, lockWeight, VOTING_DURATION_SECS } from "../services/governance/index.js";
import type {
  GovernanceRepository,
  InvestorRepository,
  ManagerRepository,
  OracleRepository,
  Repositories,
  StrategyRepository,
  VaultRepository,
} from "./repositories.js";

function toManagerProfile(row: Record<string, unknown>): ManagerProfile {
  return {
    id: row.id as string,
    owner: row.owner as string,
    name: row.name as string,
    status: row.status as ManagerProfile["status"],
    score: {
      feeGeneration: Number(row.score_fee_generation),
      risk: Number(row.score_risk),
      drawdown: Number(row.score_drawdown),
      capitalRetention: Number(row.score_capital_retention),
      consistency: Number(row.score_consistency),
      tvlGrowth: Number(row.score_tvl_growth),
      governanceParticipation: Number(row.score_governance),
      total: Number(row.score_total),
    },
    bondAmount: Number(row.bond_amount),
    tvl: Number(row.tvl),
    assetsUnderManagement: Number(row.assets_under_management),
    pnl: Number(row.pnl),
    maxDrawdown: Number(row.max_drawdown),
    feesGenerated: Number(row.fees_generated),
    poolsTraded: Number(row.pools_traded),
    protocolsUsed: (row.protocols_used as string[]) ?? [],
    yearsActive: Number(row.years_active),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toStrategy(row: Record<string, unknown>): Strategy {
  return {
    id: row.id as string,
    managerId: row.manager_id as string,
    name: row.name as string,
    type: row.type as Strategy["type"],
    protocol: row.protocol as Strategy["protocol"],
    pool: row.pool as string,
    pair: row.pair as string,
    tvl: Number(row.tvl),
    apy: Number(row.apy),
    apr: Number(row.apr),
    maxDrawdown: Number(row.max_drawdown),
    sharpeRatio: Number(row.sharpe_ratio),
    sortinoRatio: Number(row.sortino_ratio),
    fees: {
      managementBps: Number(row.management_fee_bps),
      performanceBps: Number(row.performance_fee_bps),
    },
    impermanentLoss: Number(row.impermanent_loss),
    utilization: Number(row.utilization),
    ageDays: Number(row.age_days),
    version: Number(row.version),
    riskTier: Number(row.risk_tier) as Strategy["riskTier"],
    status: (row.status as Strategy["status"]) ?? "active",
    description: (row.description as string) ?? undefined,
    params:
      row.params != null
        ? typeof row.params === "string"
          ? (JSON.parse(row.params) as Record<string, unknown>)
          : (row.params as Record<string, unknown>)
        : undefined,
    createdAt: row.created_at != null ? Number(row.created_at) : undefined,
  };
}

function toVault(row: Record<string, unknown>): Vault {
  return {
    address: row.address as string,
    name: row.name as string,
    baseAsset: row.base_asset as string,
    managerId: row.manager_id as string,
    authority: row.authority as string,
    status: row.status as Vault["status"],
    tvl: Number(row.tvl),
    apy: Number(row.apy),
    sharesOutstanding: Number(row.shares_outstanding),
    managementFeeBps: Number(row.management_fee_bps),
    performanceFeeBps: Number(row.performance_fee_bps),
    minDeposit: Number(row.min_deposit),
    allocation: null,
    createdAt: Number(row.created_at),
    lastRebalanceAt: Number(row.last_rebalance_at),
    onchain: (row.onchain as OnchainVaultMeta | null) ?? undefined,
  };
}

export class PgManagerRepository implements ManagerRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<ManagerProfile[]> {
    const result = await this.pool.query(
      "SELECT * FROM managers ORDER BY score_total DESC",
    );
    return result.rows.map(toManagerProfile);
  }

  async get(id: string): Promise<ManagerProfile | null> {
    const result = await this.pool.query("SELECT * FROM managers WHERE id = $1", [id]);
    return result.rows[0] ? toManagerProfile(result.rows[0]) : null;
  }

  async leaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const result = await this.pool.query(
      "SELECT * FROM managers ORDER BY score_total DESC LIMIT $1",
      [limit],
    );
    const entries: LeaderboardEntry[] = [];
    for (const [index, row] of result.rows.entries()) {
      const manager = toManagerProfile(row);
      const perf = await this.performanceFromPoints(manager.id, 90, manager);
      entries.push({
        ...manager,
        rank: index + 1,
        apy: perf.apy,
        sharpe: perf.sharpe,
        maxDrawdown: Number(row.max_drawdown),
      });
    }
    return entries;
  }

  private async performanceFromPoints(
    id: string,
    days: number,
    manager: ManagerProfile,
  ): Promise<ManagerPerformance> {
    const from = Date.now() - days * 86_400_000;
    const result = await this.pool.query(
      `SELECT * FROM performance_points
       WHERE manager_id = $1 AND timestamp >= $2
       ORDER BY timestamp ASC`,
      [id, from],
    );
    const points: PerformancePoint[] = result.rows.map((r) => ({
      timestamp: Number(r.timestamp),
      tvl: Number(r.tvl),
      nav: Number(r.nav),
      apy: 0,
      pnl: Number(r.daily_pnl),
    }));

    if (points.length === 0) {
      return {
        managerId: id,
        series: [],
        apy: 0,
        sharpe: 0,
        sortino: 0,
        calmar: 0,
        ulcerIndex: 0,
        winRate: 0,
        recoveryFactor: 0,
        capitalEfficiency: 0,
        liquidityUtilization: 0,
        realizedFees: 0,
        unrealizedFees: 0,
      };
    }

    const returns: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].nav;
      if (prev > 0) returns.push((points[i].nav - prev) / prev);
    }
    const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance =
      returns.length > 1
        ? returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1)
        : 0;
    const std = Math.sqrt(variance);
    const sharpe = std > 0 && mean > 0 ? mean / std : 0;

    return {
      managerId: id,
      series: points,
      apy: mean * 365,
      sharpe,
      sortino: sharpe * 1.2,
      calmar: manager.maxDrawdown > 0 ? (mean * 365) / manager.maxDrawdown : 0,
      ulcerIndex: variance * 100,
      winRate: returns.filter((r) => r > 0).length / Math.max(1, returns.length),
      recoveryFactor: manager.maxDrawdown > 0 ? Math.abs(mean * 365) / manager.maxDrawdown : 0,
      capitalEfficiency: manager.tvl > 0 ? manager.feesGenerated / manager.tvl : 0,
      liquidityUtilization: Math.min(1, (manager.poolsTraded * 2) / 30),
      realizedFees: manager.feesGenerated * 0.6,
      unrealizedFees: manager.feesGenerated * 0.4,
    };
  }

  async performance(id: string, _days = 90): Promise<ManagerPerformance | null> {
    const manager = await this.get(id);
    if (!manager) return null;
    return this.performanceFromPoints(id, 90, manager);
  }
}

export class PgOracleRepository implements OracleRepository {
  constructor(private readonly pool: Pool) {}

  async recordSubmission(submission: OracleSubmission): Promise<void> {
    await this.pool.query(
      `INSERT INTO oracle_submissions
         (manager_id, score_total, breakdown, risk_tier, action, period, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        submission.managerId,
        submission.score.total,
        JSON.stringify(submission.score.breakdown),
        submission.riskTier,
        submission.action,
        submission.period,
        submission.submittedAt,
      ],
    );
  }

  async latestSubmissions(managerId?: string, limit = 20): Promise<OracleSubmission[]> {
    const params: unknown[] = [limit];
    const where = managerId ? "WHERE manager_id = $2" : "";
    if (managerId) params.push(managerId);
    const result = await this.pool.query(
      `SELECT * FROM oracle_submissions ${where} ORDER BY submitted_at DESC LIMIT $1`,
      params,
    );
    return result.rows.map((r) => ({
      managerId: r.manager_id as string,
      score: {
        total: Number(r.score_total),
        breakdown: r.breakdown as OracleSubmission["score"]["breakdown"],
        weights: {} as OracleSubmission["score"]["weights"],
      },
      riskTier: Number(r.risk_tier) as 1 | 2 | 3 | 4 | 5,
      action: r.action as OracleSubmission["action"],
      period: r.period as string,
      submittedAt: Number(r.submitted_at),
    }));
  }
}

export class PgStrategyRepository implements StrategyRepository {
  constructor(private readonly pool: Pool) {}

  async list(filter?: { managerId?: string; protocol?: string }): Promise<Strategy[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.managerId) {
      params.push(filter.managerId);
      conditions.push(`manager_id = $${params.length}`);
    }
    if (filter?.protocol) {
      params.push(filter.protocol);
      conditions.push(`protocol = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query(`SELECT * FROM strategies ${where}`, params);
    return result.rows.map(toStrategy);
  }

  async get(id: string): Promise<Strategy | null> {
    const result = await this.pool.query("SELECT * FROM strategies WHERE id = $1", [id]);
    return result.rows[0] ? toStrategy(result.rows[0]) : null;
  }

  async create(upload: StrategyUpload): Promise<Strategy> {
    const previous = await this.pool.query(
      `SELECT COALESCE(MAX(version), 0)::int AS version
       FROM strategies WHERE manager_id = $1 AND name = $2`,
      [upload.managerId, upload.name],
    );
    const version = Number(previous.rows[0]?.version ?? 0) + 1;
    const id = `str_${upload.managerId}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await this.pool.query(
      `INSERT INTO strategies (
         id, manager_id, name, type, protocol, pool, pair,
         management_fee_bps, performance_fee_bps, version, risk_tier,
         status, description, params, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        id,
        upload.managerId,
        upload.name,
        upload.type,
        upload.protocol,
        upload.pool,
        upload.pair,
        upload.fees.managementBps,
        upload.fees.performanceBps,
        version,
        upload.riskTier,
        "active",
        upload.description ?? null,
        upload.params ? JSON.stringify(upload.params) : null,
        Date.now(),
      ],
    );
    return toStrategy(result.rows[0]);
  }
}

export class PgVaultRepository implements VaultRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Vault[]> {
    const result = await this.pool.query("SELECT * FROM vaults ORDER BY tvl DESC");
    return result.rows.map(toVault);
  }

  async get(address: string): Promise<Vault | null> {
    const result = await this.pool.query("SELECT * FROM vaults WHERE address = $1", [address]);
    return result.rows[0] ? toVault(result.rows[0]) : null;
  }

  async update(vault: Vault): Promise<Vault> {
    const result = await this.pool.query(
      `UPDATE vaults
       SET tvl = $2, shares_outstanding = $3, last_rebalance_at = $4
       WHERE address = $1
       RETURNING *`,
      [vault.address, vault.tvl, vault.sharesOutstanding, vault.lastRebalanceAt],
    );
    return toVault(result.rows[0]);
  }
}

function toPosition(row: Record<string, unknown>): InvestorPosition {
  return {
    id: row.id as string,
    investor: row.investor as string,
    vaultAddress: row.vault_address as string,
    strategyId: (row.strategy_id as string) ?? undefined,
    amount: Number(row.amount),
    shares: Number(row.shares),
    sharePrice: Number(row.share_price),
    status: row.status as InvestorPosition["status"],
    createdAt: Number(row.created_at),
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export class PgInvestorRepository implements InvestorRepository {
  constructor(private readonly pool: Pool) {}

  async listPositions(investor: string): Promise<InvestorPosition[]> {
    const result = await this.pool.query(
      "SELECT * FROM investor_positions WHERE investor = $1 ORDER BY created_at DESC",
      [investor],
    );
    return result.rows.map(toPosition);
  }

  async getPosition(id: string): Promise<InvestorPosition | null> {
    const result = await this.pool.query("SELECT * FROM investor_positions WHERE id = $1", [id]);
    return result.rows[0] ? toPosition(result.rows[0]) : null;
  }

  async deposit(vault: Vault, input: DepositInput): Promise<InvestorPosition> {
    const sharePrice =
      vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 1;
    const shares = round6(input.amount / sharePrice);
    const id = `pos_${input.investor.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await this.pool.query(
      `INSERT INTO investor_positions (
         id, investor, vault_address, strategy_id, amount, shares, share_price, status, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8)
       RETURNING *`,
      [id, input.investor, vault.address, input.strategyId ?? null, input.amount, shares, sharePrice, Date.now()],
    );
    return toPosition(result.rows[0]);
  }

  async withdraw(
    positionId: string,
    vault: Vault,
    shares: number,
  ): Promise<{ position: InvestorPosition; proceeds: number; sharesRedeemed: number } | null> {
    const current = await this.getPosition(positionId);
    if (!current || current.status !== "active" || current.vaultAddress !== vault.address) {
      return null;
    }
    const sharePrice =
      vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : current.sharePrice;
    const sharesRedeemed = Math.min(round6(shares), current.shares);
    const proceeds = round6(sharesRedeemed * sharePrice);
    const remaining = round6(current.shares - sharesRedeemed);
    const result = await this.pool.query(
      `UPDATE investor_positions
       SET shares = $2, status = $3
       WHERE id = $1
       RETURNING *`,
      [positionId, remaining, remaining <= 0 ? "withdrawn" : "active"],
    );
    return { position: toPosition(result.rows[0]), proceeds, sharesRedeemed };
  }
}

function toProposal(row: Record<string, unknown>): GovernanceProposal {
  return {
    id: row.id as string,
    proposer: row.proposer as string,
    class: row.class as GovernanceProposal["class"],
    title: row.title as string,
    targetProgram: (row.target_program as string) ?? undefined,
    instructionData: (row.instruction_data as string) ?? undefined,
    quorumWeight: Number(row.quorum_weight),
    forVotes: Number(row.for_votes),
    againstVotes: Number(row.against_votes),
    startVotingAt: Number(row.start_voting_at),
    endVotingAt: Number(row.end_voting_at),
    executionAt: Number(row.execution_at),
    status: row.status as GovernanceProposal["status"],
  };
}

function toLock(row: Record<string, unknown>): VeLockView {
  return {
    holder: row.holder as string,
    delegate: (row.delegate as string) ?? undefined,
    amount: Number(row.amount),
    weight: Number(row.weight),
    unlockAt: Number(row.unlock_at),
    swept: Boolean(row.swept),
  };
}

function toVote(row: Record<string, unknown>): GovernanceVote {
  return {
    proposalId: row.proposal_id as string,
    voter: row.voter as string,
    weight: Number(row.weight),
    inFavor: Boolean(row.in_favor),
    at: Number(row.voted_at),
  };
}

export class PgGovernanceRepository implements GovernanceRepository {
  constructor(private readonly pool: Pool) {}

  async listProposals(status?: ProposalStatus): Promise<GovernanceProposal[]> {
    const result = status
      ? await this.pool.query("SELECT * FROM proposals WHERE status = $1", [status])
      : await this.pool.query("SELECT * FROM proposals");
    return result.rows.map(toProposal);
  }

  async getProposal(id: string): Promise<GovernanceProposal | null> {
    const result = await this.pool.query("SELECT * FROM proposals WHERE id = $1", [id]);
    return result.rows[0] ? toProposal(result.rows[0]) : null;
  }

  async createProposal(input: ProposalInput): Promise<GovernanceProposal> {
    const counter = await this.pool.query(
      "SELECT COALESCE(MAX(CAST(id AS BIGINT)), 0)::bigint AS next FROM proposals",
    );
    const id = String(Number(counter.rows[0]?.next ?? 0) + 1);
    const now = Math.floor(Date.now() / 1000);
    const locks = await this.pool.query("SELECT weight FROM ve_locks");
    const totalVeWeight = locks.rows.reduce((sum, r) => sum + Number(r.weight), 0);
    const { quorumBps } = classParams(input.class);
    const result = await this.pool.query(
      `INSERT INTO proposals (
         id, proposer, class, title, target_program, instruction_data,
         quorum_weight, start_voting_at, end_voting_at, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
       RETURNING *`,
      [
        id,
        input.proposer,
        input.class,
        input.title,
        input.targetProgram ?? null,
        input.instructionData ?? null,
        Math.ceil((quorumBps * totalVeWeight) / 10_000),
        now,
        input.endVotingAt ?? now + VOTING_DURATION_SECS,
      ],
    );
    return toProposal(result.rows[0]);
  }

  async castVote(proposalId: string, vote: VoteInput): Promise<GovernanceProposal | null> {
    const proposal = await this.getProposal(proposalId);
    if (!proposal || proposal.status !== "active" || proposal.endVotingAt <= Date.now() / 1000) {
      return proposal;
    }
    const lockResult = await this.pool.query("SELECT * FROM ve_locks WHERE holder = $1", [vote.voter]);
    if (!lockResult.rows[0]) return proposal;
    const weight = lockWeight(toLock(lockResult.rows[0]));
    if (weight <= 0) return proposal;

    await this.pool.query(
      `INSERT INTO proposal_votes (proposal_id, voter, weight, in_favor, voted_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (proposal_id, voter)
       DO UPDATE SET weight = EXCLUDED.weight, in_favor = EXCLUDED.in_favor, voted_at = EXCLUDED.voted_at`,
      [proposalId, vote.voter, weight, vote.inFavor, Date.now()],
    );
    const tallies = await this.pool.query(
      `SELECT
         COALESCE(SUM(weight) FILTER (WHERE in_favor), 0) AS for_votes,
         COALESCE(SUM(weight) FILTER (WHERE NOT in_favor), 0) AS against_votes
       FROM proposal_votes WHERE proposal_id = $1`,
      [proposalId],
    );
    await this.pool.query(
      "UPDATE proposals SET for_votes = $2, against_votes = $3 WHERE id = $1",
      [proposalId, tallies.rows[0].for_votes, tallies.rows[0].against_votes],
    );
    return this.getProposal(proposalId);
  }

  async listLocks(): Promise<VeLockView[]> {
    const result = await this.pool.query("SELECT * FROM ve_locks");
    return result.rows.map(toLock);
  }

  async listVotes(proposalId?: string): Promise<GovernanceVote[]> {
    const result = proposalId
      ? await this.pool.query("SELECT * FROM proposal_votes WHERE proposal_id = $1", [proposalId])
      : await this.pool.query("SELECT * FROM proposal_votes");
    return result.rows.map(toVote);
  }
}

export interface PostgresRepositoriesOptions {
  connectionString?: string;
  autoMigrate?: boolean;
  autoSeed?: boolean;
}

/**
 * Creates Postgres-backed repositories. By default the pool applies pending
 * migrations and seeds demo data when the database is empty, so a fresh
 * managed database (e.g. Supabase) is provisioned automatically on boot.
 */
export async function createPostgresRepositories(
  options: PostgresRepositoriesOptions = {},
): Promise<Repositories> {
  const connectionString = options.connectionString ?? env.DATABASE_URL;
  const pool = buildPgPool(connectionString);
  await pool.query("SELECT 1");
  if (options.autoMigrate ?? env.DB_AUTO_MIGRATE) await runMigrations(pool);
  if (options.autoSeed ?? env.DB_AUTO_SEED) await seedIfEmpty(pool);
  await upsertBootstrapVault(pool);

  return {
    managers: new PgManagerRepository(pool),
    strategies: new PgStrategyRepository(pool),
    vaults: new PgVaultRepository(pool),
    investors: new PgInvestorRepository(pool),
    oracle: new PgOracleRepository(pool),
    governance: new PgGovernanceRepository(pool),
  };
}
