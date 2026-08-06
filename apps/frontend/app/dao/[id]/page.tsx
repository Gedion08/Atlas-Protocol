"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Vote } from "lucide-react";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { classParams, resolveProposal } from "@/lib/governance";

function timeLeftLabel(endVotingAt: number, status: string) {
  if (status !== "active") return null;
  const seconds = endVotingAt - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "finalizing";
  const days = Math.ceil(seconds / 86_400);
  if (days > 1) return `${days}d left`;
  const hours = Math.ceil(seconds / 3600);
  return `${hours}h left`;
}

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedVote, setSelectedVote] = useState<"for" | "against" | null>(null);
  const [voting, setVoting] = useState(false);

  const { data: proposal, isLoading, error } = useQuery({
    queryKey: ["proposal", params.id],
    queryFn: () => api.proposal(params.id),
    refetchInterval: 10_000,
  });

  const { data: locks } = useQuery({
    queryKey: ["locks"],
    queryFn: api.locks,
    refetchInterval: 30_000,
  });

  const resolved = useMemo(() => {
    if (!proposal) return null;
    const totalVe = (locks ?? []).reduce((sum, l) => sum + l.weight, 0);
    return resolveProposal(proposal, totalVe);
  }, [proposal, locks]);

  const canVote = resolved?.status === "active";
  const display = resolved ?? proposal;
  if (!display) throw new Error("unreachable");
  const params_ = classParams(display.class);
  const quorumReached = display.forVotes + display.againstVotes >= (display.quorumWeight || 0);
  const totalCast = display.forVotes + display.againstVotes;
  const passagePct = totalCast > 0 ? (display.forVotes / totalCast) * 100 : 0;
  const quorumPct = display.quorumWeight > 0 ? (totalCast / display.quorumWeight) * 100 : 0;

  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<{ signature: string } | null>(null);
  const now = Math.floor(Date.now() / 1000);

  async function handleVote(inFavor: boolean) {
    if (!display || !canVote) return;
    setVoting(true);
    try {
      await api.castVote(display.id, { voter: "", inFavor });
      queryClient.invalidateQueries({ queryKey: ["proposal", params.id] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    } finally {
      setVoting(false);
      setSelectedVote(null);
    }
  }

  async function handleExecute() {
    if (!display || display.status !== "succeeded") return;
    setExecuting(true);
    setExecuteResult(null);
    try {
      const result = await api.executeProposal(display.id, display.proposer);
      setExecuteResult({ signature: result.signature });
      queryClient.invalidateQueries({ queryKey: ["proposal", params.id] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    } finally {
      setExecuting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted/40" />
        <div className="h-64 animate-pulse rounded-2xl border bg-muted/40" />
      </div>
    );
  }

  if (error || !display) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {error ? "Failed to load proposal." : "Proposal not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusBadge =
    display.status === "active" ? "warning" :
    display.status === "succeeded" || display.status === "executed" ? "positive" :
    display.status === "expired" ? "outline" : "destructive";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{display.title}</h1>
            <Badge variant={statusBadge}>{display.status}</Badge>
            <Badge variant="outline" className="capitalize">{display.class.replace("_", " ")}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            by {display.proposer.slice(0, 6)}...{display.proposer.slice(-4)} · ends{" "}
            {new Date(display.endVotingAt * 1000).toLocaleDateString()}
          </p>
        </div>
        {timeLeftLabel(display.endVotingAt, display.status) && (
          <Badge variant="warning" className="text-sm">
            {timeLeftLabel(display.endVotingAt, display.status)}
          </Badge>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">For</p>
            <p className="mt-1 text-xl font-semibold text-positive">{formatUsd(display.forVotes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Against</p>
            <p className="mt-1 text-xl font-semibold text-destructive">{formatUsd(display.againstVotes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Quorum</p>
            <p className="mt-1 text-xl font-semibold">{formatUsd(display.quorumWeight || 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{quorumPct.toFixed(0)}% reached</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Passage</p>
            <p className="mt-1 text-xl font-semibold">{passagePct.toFixed(0)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">{params_?.passagePercent ?? 50}% required</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Voting</CardTitle>
          <CardDescription>
            {params_ ? `${params_.quorumBps / 100}% quorum · ${params_.passagePercent}% passage · ${(params_.timelockSecs / 86_400).toFixed(0)}d timelock` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>For {formatUsd(display.forVotes)}</span>
              <span>Against {formatUsd(display.againstVotes)}</span>
            </div>
            <Progress value={passagePct} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Cast {formatUsd(totalCast)}</span>
              <span>Quorum {formatUsd(display.quorumWeight || 0)}</span>
            </div>
            <Progress value={Math.min(100, quorumPct)} />
          </div>

          {canVote && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                variant={selectedVote === "for" ? "default" : "outline"}
                disabled={voting}
                onClick={() => handleVote(true)}
              >
                <Vote className="mr-2 h-4 w-4" /> Vote For
              </Button>
              <Button
                variant={selectedVote === "against" ? "destructive" : "outline"}
                disabled={voting}
                onClick={() => handleVote(false)}
              >
                <Vote className="mr-2 h-4 w-4" /> Vote Against
              </Button>
              {voting && <span className="text-sm text-muted-foreground">Submitting…</span>}
            </div>
          )}

          {!quorumReached && canVote && (
            <p className="text-xs text-muted-foreground">
              Quorum not yet reached. Voting remains open until {new Date(display.endVotingAt * 1000).toLocaleString()}.
            </p>
          )}

          {display.status === "succeeded" && display.executionAt > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={() => handleExecute()}
                disabled={executing || now < display.executionAt}
                className="gap-2"
              >
                Execute Proposal
              </Button>
              {executing && <span className="text-sm text-muted-foreground">Executing…</span>}
              {now < display.executionAt && (
                <span className="text-xs text-muted-foreground">
                  Available after {new Date(display.executionAt * 1000).toLocaleString()}
                </span>
              )}
              {executeResult && (
                <span className="text-xs text-positive">
                  Executed! Signature: {executeResult.signature.slice(0, 8)}...
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {display.targetProgram && (
        <Card>
          <CardHeader>
            <CardTitle>Target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Program: {display.targetProgram}</p>
            {display.instructionData && (
              <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 text-xs">
                {display.instructionData}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
