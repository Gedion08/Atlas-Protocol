"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProposalClass, ProposalInput } from "atlas-types";

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

const CLASSES: { value: ProposalClass; label: string }[] = [
  { value: "parametric", label: "Parametric" },
  { value: "fiscal", label: "Fiscal" },
  { value: "protocol_critical", label: "Protocol critical" },
  { value: "constitutional", label: "Constitutional" },
];

function statusBadge(status: string) {
  const variant =
    status === "active"
      ? "warning"
      : status === "succeeded" || status === "executed"
        ? "positive"
        : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

function classBadge(class_: ProposalClass) {
  return <Badge variant={class_ === "protocol_critical" || class_ === "constitutional" ? "destructive" : "default"}>{class_}</Badge>;
}

function voteProgress(forVotes: number, againstVotes: number) {
  const total = forVotes + againstVotes;
  if (total === 0) return 0;
  return (forVotes / total) * 100;
}

function CreateProposalForm({ proposer }: { proposer: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [class_, setClass] = useState<ProposalClass>("parametric");
  const [targetProgram, setTargetProgram] = useState("");

  const mutation = useMutation({
    mutationFn: (input: ProposalInput) => api.createProposal(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      setTitle("");
      setTargetProgram("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create proposal</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              proposer,
              title,
              class: class_,
              targetProgram: targetProgram || undefined,
            });
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={64} className={inputClass} placeholder="e.g. Raise max drawdown tolerance to 20%" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Class</span>
            <select value={class_} onChange={(e) => setClass(e.target.value as ProposalClass)} className={inputClass}>
              {CLASSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">Target program (optional)</span>
            <input value={targetProgram} onChange={(e) => setTargetProgram(e.target.value)} className={inputClass} placeholder="Program address the instruction executes against" />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={mutation.isPending || !title}>
              {mutation.isPending ? "Creating…" : "Create"}
            </Button>
            {mutation.isError && <Badge variant="destructive">{mutation.error.message}</Badge>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DaoPage() {
  const { data: proposals } = useQuery({ queryKey: ["proposals"], queryFn: api.proposals });
  const { data: locks } = useQuery({ queryKey: ["locks"], queryFn: api.locks });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const queryClient = useQueryClient();
  const [proposer, setProposer] = useState("");

  const vote = useMutation({
    mutationFn: ({ id, inFavor }: { id: string; inFavor: boolean }) =>
      api.castVote(id, { voter: proposer, inFavor }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["proposals"], (old: { id: string }[] | undefined) =>
        (old ?? []).map((p) => (p.id === updated.id ? updated : p)),
      );
    },
  });

  const totalWeight = (locks ?? []).reduce((sum, l) => sum + l.weight, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Governance DAO</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ve-locked ATLAS votes on risk parameters, treasury actions and protocol changes.
          Vote weight = locked amount × lock-duration multiplier.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Proposals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(proposals ?? []).map((p) => (
              <div key={p.id} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{p.title}</h3>
                    {classBadge(p.class)}
                    {statusBadge(p.status)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ends {new Date(p.endVotingAt * 1000).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      For {formatUsd(p.forVotes)} · Against {formatUsd(p.againstVotes)}
                    </span>
                    <span>quorum {formatUsd(p.quorumWeight)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-positive"
                      style={{ width: `${voteProgress(p.forVotes, p.againstVotes)}%` }}
                    />
                  </div>
                </div>
                {p.status === "active" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => vote.mutate({ id: p.id, inFavor: true })} disabled={vote.isPending}>
                      For
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => vote.mutate({ id: p.id, inFavor: false })} disabled={vote.isPending}>
                      Against
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ve-locks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(locks ?? []).map((l) => (
                <div key={l.holder} className="rounded-md border border-border p-3">
                  <p className="truncate text-xs text-muted-foreground">{l.holder.slice(0, 18)}…</p>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="font-medium">{formatUsd(l.amount)}</span>
                    <span className="text-muted-foreground">{Math.round((l.weight / Math.max(1, totalWeight)) * 100)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    unlocks {new Date(l.unlockAt * 1000).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Voting wallet</span>
          <select value={proposer} onChange={(e) => setProposer(e.target.value)} className={inputClass}>
            <option value="">Choose a wallet…</option>
            {(managers ?? []).map((m) => (
              <option key={m.id} value={m.owner}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <CreateProposalForm proposer={proposer || "anonymous"} />
    </div>
  );
}
