import type { GovernanceProposal, ProposalClass } from "atlas-types";

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

export function timeLeftLabel(endVotingAt: number, status: string) {
  if (status !== "active") return null;
  const seconds = endVotingAt - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "finalizing";
  const days = Math.ceil(seconds / 86_400);
  if (days > 1) return `${days}d left`;
  const hours = Math.ceil(seconds / 3600);
  return `${hours}h left`;
}
