"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ProposalCardSkeleton } from "@/components/skeletons/proposal-card";
import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatUsd } from "@/lib/format";
import { voteProgress } from "@/lib/governance";
import Link from "next/link";
import type { ProposalStatus, ProposalClass } from "atlas-types";

const STATUS_FILTERS: { value: ProposalStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "succeeded", label: "Succeeded" },
  { value: "defeated", label: "Defeated" },
  { value: "expired", label: "Expired" },
];

function classBadge(class_: ProposalClass) {
  const colors: Record<ProposalClass, "outline" | "warning" | "destructive"> = {
    parametric: "outline",
    fiscal: "warning",
    protocol_critical: "destructive",
    constitutional: "warning",
  };
  return <Badge variant={colors[class_]} className="capitalize">{class_.replace("_", " ")}</Badge>;
}

function statusBadge(status: string) {
  const colors: Record<string, "outline" | "positive" | "destructive" | "warning"> = {
    active: "warning",
    succeeded: "positive",
    executed: "positive",
    defeated: "destructive",
    expired: "outline",
  };
  return <Badge variant={colors[status] ?? "outline"}>{status}</Badge>;
}

interface ProposalsListProps {
  statusFilter: ProposalStatus | "all";
  onStatusFilterChange: (filter: ProposalStatus | "all") => void;
}

export function ProposalsList({ statusFilter, onStatusFilterChange }: ProposalsListProps) {
  const proposalsQuery = useQuery({ queryKey: ["proposals"], queryFn: api.proposals });
  const { data: proposals } = proposalsQuery;

  const filtered = (proposals ?? []).filter(
    (p) => statusFilter === "all" || p.status === statusFilter,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Proposals</CardTitle>
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={statusFilter === s.value ? "default" : "outline"}
              onClick={() => onStatusFilterChange(s.value)}
              className="capitalize"
            >
              {s.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {proposalsQuery.isLoading && !proposals ? (
          Array.from({ length: 3 }).map((_, i) => <ProposalCardSkeleton key={i} />)
        ) : proposalsQuery.isError ? (
          <ErrorState message="Failed to load proposals." onRetry={() => proposalsQuery.refetch()} />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No proposals in this view.</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((p) => {
              const totalCast = p.forVotes + p.againstVotes;
              const quorumPct = p.quorumWeight > 0 ? (totalCast / p.quorumWeight) * 100 : 0;
              const timeLeft = p.endVotingAt - Math.floor(Date.now() / 1000);
              const daysLeft = Math.ceil(timeLeft / 86_400);
              return (
                <div key={p.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dao/${p.id}`} className="hover:text-primary"><h3 className="font-medium">{p.title}</h3></Link>
                      {classBadge(p.class)}
                      {statusBadge(p.status)}
                    </div>
                    {p.status === "active" && (
                      <span className="text-xs text-muted-foreground">
                        {daysLeft > 0 ? `${daysLeft}d left` : "finalizing"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    by {p.proposer.slice(0, 6)}…{p.proposer.slice(-4)} · ends{" "}
                    {new Date(p.endVotingAt * 1000).toLocaleDateString()}
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        For {formatUsd(p.forVotes)} · Against {formatUsd(p.againstVotes)}
                      </span>
                      <span>quorum {formatUsd(p.quorumWeight)} · {quorumPct.toFixed(0)}%</span>
                    </div>
                    <Progress value={voteProgress(p.forVotes, p.againstVotes)} />
                    <div className="h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full bg-muted-foreground/50"
                        style={{ width: `${Math.min(100, quorumPct)}%` }}
                        title={`Quorum ${quorumPct.toFixed(0)}%`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
