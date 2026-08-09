import type { GovernanceProposal, ProposalClass, VeLockView } from "atlas-types";

export const VOTING_DURATION_SECS = 7 * 86_400;
export const YEAR_SECS = 31_556_952;
export const MAX_LOCK_SECS = 126_144_000;

/** Mirrors on-chain quorum/passage/timelock rules per proposal class (governance §2). */
export function classParams(class_: ProposalClass): {
  quorumBps: number;
  passagePercent: number;
  timelockSecs: number;
} {
  switch (class_) {
    case "parametric":
      return { quorumBps: 500, passagePercent: 50, timelockSecs: 2 * 86_400 };
    case "fiscal":
      return { quorumBps: 1000, passagePercent: 50, timelockSecs: 3 * 86_400 };
    case "protocol_critical":
      return { quorumBps: 1500, passagePercent: 60, timelockSecs: 7 * 86_400 };
    case "constitutional":
      return { quorumBps: 1500, passagePercent: 66, timelockSecs: 30 * 86_400 };
  }
}

/** Effective voting weight of a lock: zero once expired or swept. */
export function lockWeight(lock: VeLockView, now = Date.now()): number {
  if (lock.swept || lock.unlockAt <= now / 1000) return 0;
  return lock.weight;
}

/** Resolves an active proposal once its voting window closes (mirrors finalize). */
export function resolveProposal(
  proposal: GovernanceProposal,
  totalVeWeight: number,
  now = Date.now(),
): GovernanceProposal {
  if (proposal.status !== "active" || proposal.endVotingAt > now / 1000) return proposal;

  const { quorumBps, passagePercent, timelockSecs } = classParams(proposal.class);
  const quorum = Math.ceil((quorumBps * totalVeWeight) / 10_000);
  const cast = proposal.forVotes + proposal.againstVotes;
  const passed =
    proposal.forVotes >= quorum &&
    cast > 0 &&
    (proposal.forVotes * 100) / cast >= passagePercent;

  return {
    ...proposal,
    quorumWeight: quorum,
    status: passed ? ("succeeded" as const) : cast === 0 ? ("expired" as const) : ("defeated" as const),
    executionAt: proposal.endVotingAt + timelockSecs,
  };
}
