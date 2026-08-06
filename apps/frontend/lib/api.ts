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

export const api = {
  managers: async (): Promise<ManagerProfile[] | null> => get<ManagerProfile[]>("/api/v1/managers"),
  manager: async (id: string): Promise<ManagerProfile | null> =>
    (await get<ManagerProfile>(`/api/v1/managers/${id}`)) ?? null,
  managerPerformance: async (id: string): Promise<ManagerPerformance | null> =>
    (await get<ManagerPerformance>(`/api/v1/managers/${id}/performance`)) ?? null,
  managerRisk: async (id: string): Promise<RiskDecision | null> =>
    (await get<RiskDecision>(`/api/v1/managers/${id}/risk`)) ?? null,
  leaderboard: async (): Promise<LeaderboardEntry[] | null> =>
    get<LeaderboardEntry[]>("/api/v1/leaderboard"),
  strategies: async (): Promise<Strategy[] | null> => get<Strategy[]>("/api/v1/strategies"),
  strategy: async (id: string): Promise<Strategy | null> =>
    (await get<Strategy>(`/api/v1/strategies/${id}`)) ?? null,
  uploadStrategy: async (
    upload: StrategyUpload,
    auth?: { owner: string; nonce: string; signature: string },
  ): Promise<Strategy> =>
    post<Strategy>("/api/v1/strategies", upload, auth ? buildSignatureHeaders(auth) : undefined),
  vaults: async (): Promise<Vault[] | null> => get<Vault[]>("/api/v1/vaults"),
  vault: async (address: string): Promise<Vault | null> =>
    (await get<Vault>(`/api/v1/vaults/${address}`)) ?? null,
  vaultPricing: async (address: string): Promise<{ sharePrice: number; tvl: number; sharesOutstanding: number; pricedAt: number }> => {
    const pricing =
      (await get<{ sharePrice: number; tvl: number; sharesOutstanding: number; pricedAt: number }>(
        `/api/v1/vaults/${address}/pricing`,
      )) ??
      ({
        sharePrice: 0,
        tvl: 0,
        sharesOutstanding: 0,
        pricedAt: Date.now(),
      } as const);
    return pricing;
  },
  proposals: async (): Promise<GovernanceProposal[] | null> =>
    get<GovernanceProposal[]>("/api/v1/governance/proposals"),
  proposal: async (id: string): Promise<GovernanceProposal | null> =>
    (await get<GovernanceProposal>(`/api/v1/governance/proposals/${id}`)) ?? null,
  createProposal: async (input: ProposalInput): Promise<GovernanceProposal> =>
    post<GovernanceProposal>("/api/v1/governance/proposals", input),
  castVote: async (id: string, vote: VoteInput): Promise<GovernanceProposal> =>
    post<GovernanceProposal>(`/api/v1/governance/proposals/${id}/votes`, vote),
  executeProposal: async (id: string, executor: string): Promise<{ signature: string; proposalId: string; status: string }> =>
    post<{ signature: string; proposalId: string; status: string }>(
      `/api/v1/governance/proposals/${id}/execute`,
      { proposalId: id, executor },
    ),
  locks: async (): Promise<VeLockView[] | null> =>
    get<VeLockView[]>("/api/v1/governance/locks"),
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
  stakingBond: async (owner: string, amount: number) =>
    post<{ transaction: string; owner: string; amount: number; bondPda: string; escrowPda: string }>(
      "/api/v1/staking/bond",
      { owner, amount },
    ),
  stakingUnbond: async (owner: string) =>
    post<{ transaction: string; owner: string }>("/api/v1/staking/unbond", { owner }),
  stakingClaim: async (owner: string) =>
    post<{ transaction: string; owner: string }>("/api/v1/staking/claim", { owner }),
  stakingBondStatus: async (owner: string) =>
    get<{ exists: boolean; address?: string }>(`/api/v1/staking/bond/${owner}`),
};
