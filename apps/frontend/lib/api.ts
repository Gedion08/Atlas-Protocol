import type {
  DepositInput,
  GovernanceProposal,
  GovernanceVote,
  InvestorPosition,
  InvestorSummary,
  LeaderboardEntry,
  ManagerPerformance,
  ManagerProfile,
  ProposalInput,
  RiskDecision,
  Strategy,
  StrategyUpload,
  Vault,
  VeLockView,
  VoteInput,
  WithdrawInput,
} from "atlas-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function get<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    const res = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data as T;
  } catch {
    return null;
  }
}

async function post<T>(path: string, payload: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body as { message?: string })?.message ?? `Request failed (${res.status})`);
  }
  return body.data as T;
}

/** Signature headers for a wallet-signed strategy upload (spec §7.1). */
export function buildSignatureHeaders(input: {
  owner: string;
  nonce: string;
  signature: string;
}): Record<string, string> {
  return {
    "x-atlas-owner": input.owner,
    "x-atlas-nonce": input.nonce,
    "x-atlas-signature": input.signature,
  };
}

export type InvestAction = "deposit" | "request_withdraw" | "settle_withdraw";

/** Backend-assembled on-chain transaction awaiting a wallet signature. */
export interface BuildInvestResult {
  transaction: string;
  blockhash: string;
  ataAccounts: string[];
}

const fallbackManagers: ManagerProfile[] = [
  {
    id: "mgr_quantum",
    owner: "HoPrXWPH3naKVZEftnckQVpd2bSNRnSiFS2TysDiv5Ff",
    name: "Quantum Capital",
    status: "active",
    score: {
      feeGeneration: 78,
      risk: 22,
      drawdown: 18,
      capitalRetention: 88,
      consistency: 82,
      tvlGrowth: 74,
      governanceParticipation: 60,
      total: 79,
    },
    bondAmount: 500_000,
    tvl: 12_400_000,
    assetsUnderManagement: 12_400_000,
    pnl: 1_850_000,
    maxDrawdown: 0.06,
    feesGenerated: 240_000,
    poolsTraded: 14,
    protocolsUsed: ["meteora", "orca", "raydium", "kamino"],
    yearsActive: 2,
    createdAt: Date.now() - 730 * 86_400_000,
    updatedAt: Date.now() - 86_400_000,
  },
  {
    id: "mgr_apex",
    owner: "9PcknAvu4Vou8xiYXBErfLkv4irKGucPszaguEFFvexr",
    name: "Apex Liquidity",
    status: "active",
    score: {
      feeGeneration: 85,
      risk: 30,
      drawdown: 24,
      capitalRetention: 76,
      consistency: 70,
      tvlGrowth: 92,
      governanceParticipation: 45,
      total: 77,
    },
    bondAmount: 300_000,
    tvl: 8_700_000,
    assetsUnderManagement: 8_700_000,
    pnl: 1_200_000,
    maxDrawdown: 0.09,
    feesGenerated: 310_000,
    poolsTraded: 9,
    protocolsUsed: ["meteora", "drift", "jupiter"],
    yearsActive: 1,
    createdAt: Date.now() - 400 * 86_400_000,
    updatedAt: Date.now() - 3 * 86_400_000,
  },
  {
    id: "mgr_harbor",
    owner: "4emaasdjZe2JhDTWSrXYSkyHniGQFmkZ5ias2fjAWp6n",
    name: "Harbor Stable",
    status: "active",
    score: {
      feeGeneration: 65,
      risk: 12,
      drawdown: 8,
      capitalRetention: 94,
      consistency: 90,
      tvlGrowth: 58,
      governanceParticipation: 80,
      total: 80,
    },
    bondAmount: 400_000,
    tvl: 18_200_000,
    assetsUnderManagement: 18_200_000,
    pnl: 890_000,
    maxDrawdown: 0.02,
    feesGenerated: 180_000,
    poolsTraded: 6,
    protocolsUsed: ["kamino", "marginfi", "sanctum"],
    yearsActive: 3,
    createdAt: Date.now() - 1100 * 86_400_000,
    updatedAt: Date.now() - 2 * 86_400_000,
  },
];

const fallbackStrategies: Strategy[] = [
  {
    id: "str_btc_sol_conservative",
    managerId: "mgr_quantum",
    name: "BTC/SOL Conservative",
    type: "passive",
    protocol: "meteora",
    pool: "BTC-SOL DLMM",
    pair: "BTC/SOL",
    tvl: 5_100_000,
    apy: 14.2,
    apr: 13.8,
    maxDrawdown: 0.05,
    sharpeRatio: 1.9,
    sortinoRatio: 2.6,
    fees: { managementBps: 50, performanceBps: 1500 },
    impermanentLoss: 0.018,
    utilization: 0.82,
    ageDays: 420,
    version: 3,
    riskTier: 1,
  },
  {
    id: "str_sol_usdc_active",
    managerId: "mgr_apex",
    name: "SOL/USDC Active",
    type: "active",
    protocol: "meteora",
    pool: "SOL-USDC DLMM",
    pair: "SOL/USDC",
    tvl: 6_400_000,
    apy: 22.7,
    apr: 24.1,
    maxDrawdown: 0.08,
    sharpeRatio: 1.6,
    sortinoRatio: 2.1,
    fees: { managementBps: 75, performanceBps: 2000 },
    impermanentLoss: 0.031,
    utilization: 0.88,
    ageDays: 310,
    version: 5,
    riskTier: 2,
  },
  {
    id: "str_meme_basket",
    managerId: "mgr_volta",
    name: "Meme Basket",
    type: "rule-based",
    protocol: "raydium",
    pool: "Multi-pair CLMM",
    pair: "MEME Basket",
    tvl: 2_100_000,
    apy: 48.3,
    apr: 52.0,
    maxDrawdown: 0.19,
    sharpeRatio: 0.9,
    sortinoRatio: 1.1,
    fees: { managementBps: 100, performanceBps: 2500 },
    impermanentLoss: 0.085,
    utilization: 0.91,
    ageDays: 140,
    version: 2,
    riskTier: 4,
  },
  {
    id: "str_stable_yield",
    managerId: "mgr_harbor",
    name: "Stable Yield",
    type: "adaptive",
    protocol: "kamino",
    pool: "USDC-USDT",
    pair: "USDC/USDT",
    tvl: 14_800_000,
    apy: 8.9,
    apr: 8.7,
    maxDrawdown: 0.012,
    sharpeRatio: 3.2,
    sortinoRatio: 5.1,
    fees: { managementBps: 40, performanceBps: 1000 },
    impermanentLoss: 0.002,
    utilization: 0.76,
    ageDays: 890,
    version: 7,
    riskTier: 1,
  },
  {
    id: "str_vol_capture",
    managerId: "mgr_apex",
    name: "Volatility Capture",
    type: "ai-assisted",
    protocol: "drift",
    pool: "SOL-PERP",
    pair: "SOL/PERP",
    tvl: 2_300_000,
    apy: 31.5,
    apr: 33.9,
    maxDrawdown: 0.12,
    sharpeRatio: 1.2,
    sortinoRatio: 1.5,
    fees: { managementBps: 90, performanceBps: 2000 },
    impermanentLoss: 0.045,
    utilization: 0.85,
    ageDays: 200,
    version: 4,
    riskTier: 3,
  },
  {
    id: "str_range_rotation",
    managerId: "mgr_quantum",
    name: "Range Rotation",
    type: "scheduled",
    protocol: "orca",
    pool: "SOL-USDC CLMM",
    pair: "SOL/USDC",
    tvl: 4_300_000,
    apy: 18.4,
    apr: 18.9,
    maxDrawdown: 0.06,
    sharpeRatio: 1.8,
    sortinoRatio: 2.3,
    fees: { managementBps: 60, performanceBps: 1500 },
    impermanentLoss: 0.024,
    utilization: 0.79,
    ageDays: 500,
    version: 3,
    riskTier: 2,
  },
];

const fallbackLocks: VeLockView[] = [
  {
    holder: "QmNTvXQv3xkDQrQkNZjk8XoVPL5DyxwC3KqMxKzQLdK",
    amount: 500_000,
    weight: 1_250_000,
    unlockAt: Math.floor(Date.now() / 1000) + 400 * 86_400,
    swept: false,
  },
  {
    holder: "ApXfTvFqk2zYQe5QJn8rCbW9xM3dLgV1uHnS6tRwKaZj",
    amount: 300_000,
    weight: 750_000,
    unlockAt: Math.floor(Date.now() / 1000) + 200 * 86_400,
    swept: false,
  },
];

const fallbackProposals: GovernanceProposal[] = [
  {
    id: "1",
    proposer: "QmNTvXQv3xkDQrQkNZjk8XoVPL5DyxwC3KqMxKzQLdK",
    class: "parametric",
    title: "Lower max_per_protocol exposure to 35%",
    targetProgram: "9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8",
    quorumWeight: 225_000,
    forVotes: 1_100_000,
    againstVotes: 120_000,
    startVotingAt: Math.floor(Date.now() / 1000) - 86_400,
    endVotingAt: Math.floor(Date.now() / 1000) + 3 * 86_400,
    executionAt: 0,
    status: "active",
  },
  {
    id: "2",
    proposer: "HrB4orXqFk2zYQe5QJn8rCbW9xM3dLgV1uHnS6tRwKaZP",
    class: "fiscal",
    title: "Treasury buyback of 500k ATLAS this month",
    targetProgram: "AbFBCeqqBxpoAGamrPNmrXXMHY5qHybjsoTyYaKJL86q",
    quorumWeight: 450_000,
    forVotes: 2_400_000,
    againstVotes: 300_000,
    startVotingAt: Math.floor(Date.now() / 1000) - 6 * 86_400,
    endVotingAt: Math.floor(Date.now() / 1000) - 86_400,
    executionAt: Math.floor(Date.now() / 1000) + 2 * 86_400,
    status: "succeeded",
  },
];

function fallbackPerf(id: string): ManagerPerformance {  const now = Date.now();
  const series = [];
  let nav = 1;
  for (let i = 90; i >= 0; i--) {
    nav *= 1 + (Math.sin(i / 6) + 0.4) * 0.004;
    series.push({ timestamp: now - i * 86_400_000, tvl: 10_000_000 * nav, nav, apy: 16, pnl: (nav - 1) * 10_000_000 });
  }
  return {
    managerId: id,
    series,
    apy: 16.4,
    sharpe: 1.7,
    sortino: 2.3,
    calmar: 1.1,
    ulcerIndex: 2.1,
    winRate: 0.62,
    recoveryFactor: 2.4,
    capitalEfficiency: 0.71,
    liquidityUtilization: 0.83,
    realizedFees: 210_000,
    unrealizedFees: 95_000,
  };
}

export const api = {
  managers: async (): Promise<ManagerProfile[]> => (await get<ManagerProfile[]>("/api/v1/managers")) ?? fallbackManagers,
  manager: async (id: string): Promise<ManagerProfile | null> =>
    (await get<ManagerProfile>(`/api/v1/managers/${id}`)) ??
    fallbackManagers.find((m) => m.id === id) ??
    null,
  managerPerformance: async (id: string): Promise<ManagerPerformance | null> =>
    (await get<ManagerPerformance>(`/api/v1/managers/${id}/performance`)) ?? fallbackPerf(id),
  managerRisk: async (id: string): Promise<RiskDecision | null> =>
    (await get<RiskDecision>(`/api/v1/managers/${id}/risk`)) ?? null,
  leaderboard: async (): Promise<LeaderboardEntry[]> =>
    (await get<LeaderboardEntry[]>("/api/v1/leaderboard")) ??
    fallbackManagers.map((m, i) => ({ ...m, rank: i + 1, apy: 14 + i * 2.2, sharpe: 1.5, maxDrawdown: m.maxDrawdown })),
  strategies: async (): Promise<Strategy[]> => (await get<Strategy[]>("/api/v1/strategies")) ?? fallbackStrategies,
  strategy: async (id: string): Promise<Strategy | null> =>
    (await get<Strategy>(`/api/v1/strategies/${id}`)) ??
    fallbackStrategies.find((s) => s.id === id) ??
    null,
  uploadStrategy: async (
    upload: StrategyUpload,
    auth?: { owner: string; nonce: string; signature: string },
  ): Promise<Strategy> =>
    post<Strategy>("/api/v1/strategies", upload, auth ? buildSignatureHeaders(auth) : undefined),
  vaults: async (): Promise<Vault[]> =>
    (await get<Vault[]>("/api/v1/vaults")) ?? [
      {
        address: "VaU1tXYb7mX8G5w3eRkQzKj4nLpDcVfBqHtSwXcYaZx",
        name: "Atlas Core Yield",
        baseAsset: "USDC",
        managerId: "mgr_quantum",
        authority: "AtL45sAu2DvBqPj9nRyGcE7fHwMzNxQkTpSrLvJmWcYa",
        status: "active",
        tvl: 31_000_000,
        apy: 17.5,
        sharesOutstanding: 28_000_000,
        managementFeeBps: 50,
        performanceFeeBps: 2000,
        minDeposit: 100,
        allocation: null,
        createdAt: Date.now() - 400 * 86_400_000,
        lastRebalanceAt: Date.now() - 3_600_000,
      },
      {
        address: "VaU2tXYb7mX8G5w3eRkQzKj4nLpDcVfBqHtSwXcYaZx",
        name: "Atlas Stable Reserve",
        baseAsset: "USDT",
        managerId: "mgr_harbor",
        authority: "AtL45sAu2DvBqPj9nRyGcE7fHwMzNxQkTpSrLvJmWcYa",
        status: "active",
        tvl: 14_500_000,
        apy: 8.9,
        sharesOutstanding: 13_000_000,
        managementFeeBps: 40,
        performanceFeeBps: 1000,
        minDeposit: 100,
        allocation: null,
        createdAt: Date.now() - 700 * 86_400_000,
        lastRebalanceAt: Date.now() - 86_400_000,
      },
      {
        address: "VaU3tXYb7mX8G5w3eRkQzKj4nLpDcVfBqHtSwXcYaZx",
        name: "Atlas Vol Alpha",
        baseAsset: "SOL",
        managerId: "mgr_apex",
        authority: "AtL45sAu2DvBqPj9nRyGcE7fHwMzNxQkTpSrLvJmWcYa",
        status: "active",
        tvl: 6_800_000,
        apy: 26.1,
        sharesOutstanding: 5_200_000,
        managementFeeBps: 75,
        performanceFeeBps: 2000,
        minDeposit: 500,
        allocation: null,
        createdAt: Date.now() - 260 * 86_400_000,
        lastRebalanceAt: Date.now() - 30 * 60 * 1000,
      },
      {
        address: "VaU4tXYb7mX8G5w3eRkQzKj4nLpDcVfBqHtSwXcYaZx",
        name: "Atlas Momentum",
        baseAsset: "SOL",
        managerId: "mgr_volta",
        authority: "AtL45sAu2DvBqPj9nRyGcE7fHwMzNxQkTpSrLvJmWcYa",
        status: "active",
        tvl: 3_400_000,
        apy: 31.2,
        sharesOutstanding: 2_900_000,
        managementFeeBps: 90,
        performanceFeeBps: 2500,
        minDeposit: 250,
        allocation: null,
        createdAt: Date.now() - 200 * 86_400_000,
        lastRebalanceAt: Date.now() - 7_200_000,
      },
    ],
  vault: async (address: string): Promise<Vault | null> =>
    (await get<Vault>(`/api/v1/vaults/${address}`)) ??
    (await api.vaults()).find((v) => v.address === address) ??
    null,
  vaultPricing: async (address: string): Promise<{ sharePrice: number; tvl: number; sharesOutstanding: number; pricedAt: number }> => {
    const vault = (await get<Vault>(`/api/v1/vaults/${address}`)) ?? (await api.vaults())[0];
    if (!vault) return { sharePrice: 0, tvl: 0, sharesOutstanding: 0, pricedAt: Date.now() };
    const pricing =
      (await get<{ sharePrice: number; tvl: number; sharesOutstanding: number; pricedAt: number }>(
        `/api/v1/vaults/${address}/pricing`,
      )) ??
      ({
        sharePrice: vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 0,
        tvl: vault.tvl,
        sharesOutstanding: vault.sharesOutstanding,
        pricedAt: Date.now(),
      } as const);
    return pricing;
  },
  proposals: async (): Promise<GovernanceProposal[]> =>
    (await get<GovernanceProposal[]>("/api/v1/governance/proposals")) ?? fallbackProposals,
  proposal: async (id: string): Promise<GovernanceProposal | null> =>
    (await get<GovernanceProposal>(`/api/v1/governance/proposals/${id}`)) ??
    fallbackProposals.find((p) => p.id === id) ??
    null,
  createProposal: async (input: ProposalInput): Promise<GovernanceProposal> =>
    post<GovernanceProposal>("/api/v1/governance/proposals", input),
  castVote: async (id: string, vote: VoteInput): Promise<GovernanceProposal> =>
    post<GovernanceProposal>(`/api/v1/governance/proposals/${id}/votes`, vote),
  locks: async (): Promise<VeLockView[]> =>
    (await get<VeLockView[]>("/api/v1/governance/locks")) ?? fallbackLocks,
  votes: async (id: string): Promise<GovernanceVote[]> =>
    (await get<GovernanceVote[]>(`/api/v1/governance/proposals/${id}/votes`)) ?? [],
  investorPositions: async (wallet: string): Promise<InvestorPosition[]> =>
    (await get<InvestorPosition[]>(`/api/v1/investors/${wallet}/positions`)) ?? [],
  investorSummary: async (wallet: string): Promise<InvestorSummary | null> =>
    (await get<InvestorSummary>(`/api/v1/investors/${wallet}`)) ?? null,
  deposit: async (
    vaultAddress: string,
    input: DepositInput,
    auth?: { owner: string; nonce: string; signature: string },
  ): Promise<{ position: InvestorPosition; vault: Vault }> =>
    post<{ position: InvestorPosition; vault: Vault }>(
      `/api/v1/vaults/${vaultAddress}/deposit`,
      input,
      auth ? buildSignatureHeaders(auth) : undefined,
    ),
  withdraw: async (
    vaultAddress: string,
    input: WithdrawInput,
    auth?: { owner: string; nonce: string; signature: string },
  ): Promise<{ position: InvestorPosition; proceeds: number; sharesRedeemed: number; vault: Vault }> =>
    post<{ position: InvestorPosition; proceeds: number; sharesRedeemed: number; vault: Vault }>(
      `/api/v1/vaults/${vaultAddress}/withdraw`,
      input,
      auth ? buildSignatureHeaders(auth) : undefined,
    ),
  /** Assembles an on-chain invest transaction for the connected wallet to sign/send. */
  buildInvestTransaction: async (
    vaultAddress: string,
    input: { action: InvestAction; amount?: number; shares?: number },
    owner: string,
  ): Promise<BuildInvestResult> =>
    post<BuildInvestResult>(
      `/api/v1/vaults/${vaultAddress}/invest/build`,
      input,
      { "x-atlas-owner": owner },
    ),
};
