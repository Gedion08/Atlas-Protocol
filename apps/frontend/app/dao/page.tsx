"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import { decodeTransaction } from "@/lib/solana";
import { Landmark, ShieldCheck, Users, Vote, Wallet } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProposalClass, ProposalInput } from "atlas-types";

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

const MAX_LOCK_SECS = 4 * 365 * 86_400;
const YEAR_SECS = 365 * 86_400;

function durationMultiplierBps(durationSecs: number): number {
  if (durationSecs <= 0) return 0;
  if (durationSecs < YEAR_SECS) {
    const bps = 2500 + (7500 * durationSecs) / YEAR_SECS;
    return Math.max(2500, Math.min(10000, bps));
  }
  if (durationSecs >= MAX_LOCK_SECS) return 25000;
  const extra = (15000 * (durationSecs - YEAR_SECS)) / (3 * YEAR_SECS);
  return Math.min(25000, 10000 + extra);
}

function calcWeight(amount: number, durationSecs: number): number {
  return (amount * durationMultiplierBps(durationSecs)) / 10000;
}

const LOCK_DURATIONS = [
  { label: "1 month", value: 30 * 86_400 },
  { label: "3 months", value: 90 * 86_400 },
  { label: "6 months", value: 180 * 86_400 },
  { label: "1 year", value: 365 * 86_400 },
  { label: "2 years", value: 730 * 86_400 },
  { label: "4 years", value: 1460 * 86_400 },
];

const CLASSES: { value: ProposalClass; label: string; description: string }[] = [
  { value: "parametric", label: "Parametric", description: "Risk parameters & limits · 5% quorum" },
  { value: "fiscal", label: "Fiscal", description: "Treasury actions · 10% quorum" },
  { value: "protocol_critical", label: "Protocol critical", description: "Halts & emergency · 15% quorum" },
  { value: "constitutional", label: "Constitutional", description: "Irreversible rules · 15% quorum" },
];

const STATUS_FILTERS = ["all", "active", "succeeded", "defeated", "expired", "executed"] as const;

function statusBadge(status: string) {
  const variant =
    status === "active"
      ? "warning"
      : status === "succeeded" || status === "executed"
        ? "positive"
        : status === "expired"
          ? "outline"
          : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

function classBadge(class_: ProposalClass) {
  return (
    <Badge variant={class_ === "protocol_critical" || class_ === "constitutional" ? "destructive" : "default"}>
      {class_}
    </Badge>
  );
}

function voteProgress(forVotes: number, againstVotes: number) {
  const total = forVotes + againstVotes;
  if (total === 0) return 0;
  return (forVotes / total) * 100;
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-md bg-accent p-2 text-accent-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateVeLockForm({ onSuccess }: { onSuccess: () => void }) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState<string>(String(LOCK_DURATIONS[3].value));
  const [error, setError] = useState<string | null>(null);

  const durationSecs = Number(duration);
  const amountNum = Number(amount);
  const weight = amountNum > 0 && durationSecs > 0 ? calcWeight(amountNum, durationSecs) : 0;
  const multiplier = durationSecs > 0 ? durationMultiplierBps(durationSecs) / 10000 : 0;

  const lockMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect your wallet first");
      const data = await api.createVeLock(wallet, amountNum, durationSecs);
      if (!sendTransaction) {
        throw new Error("Wallet does not support sending transactions.");
      }
      const transaction = decodeTransaction(data.transaction);
      const connection = new Connection("https://api.devnet.solana.com");
      await sendTransaction(transaction, connection);
      return data;
    },
    onSuccess: () => {
      setAmount("");
      setDuration(String(LOCK_DURATIONS[3].value));
      setError(null);
      onSuccess();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create ve-lock"),
  });

  if (!connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create ve-lock</CardTitle>
          <CardDescription>Lock ATLAS to get voting weight</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connect your wallet to lock ATLAS for governance.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create ve-lock</CardTitle>
        <CardDescription>Lock ATLAS to get voting weight</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-1">
          <Label htmlFor="lock-amount">Amount (ATLAS)</Label>
          <Input
            id="lock-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            step="1"
            placeholder="e.g. 1000"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lock-duration">Duration</Label>
          <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
            <SelectTrigger className={inputClass}>
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              {LOCK_DURATIONS.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {amountNum > 0 && (
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multiplier</span>
              <span className="font-medium">{multiplier.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ve-ATLAS weight</span>
              <span className="font-semibold">{weight.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unlocks</span>
              <span className="font-medium">
                {new Date(Date.now() + durationSecs * 1000).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
        <Button
          onClick={() => lockMutation.mutate()}
          disabled={lockMutation.isPending || !amount || amountNum <= 0 || durationSecs <= 0}
          className="w-full"
        >
          {lockMutation.isPending ? "Locking…" : "Lock ATLAS"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Locked ATLAS is non-transferable until the unlock date. Early withdrawal is not supported.
        </p>
      </CardContent>
    </Card>
  );
}

function CreateProposalForm({ proposer }: { proposer: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [class_, setClass] = useState<ProposalClass>("parametric");
  const [targetProgram, setTargetProgram] = useState("");
  const [days, setDays] = useState("7");

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
        <CardDescription>
          Voting runs for the selected duration; quorum follows the proposal class.
        </CardDescription>
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
              endVotingAt: Math.floor(Date.now() / 1000) + Number(days) * 86_400,
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
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Duration (days)</span>
            <select value={days} onChange={(e) => setDays(e.target.value)} className={inputClass}>
              {["3", "7", "14", "30"].map((d) => (
                <option key={d} value={d}>
                  {d} days
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
          <p className="text-xs text-muted-foreground sm:col-span-3">
            {CLASSES.find((c) => c.value === class_)?.description}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DaoPage() {
  const { data: proposals } = useQuery({ queryKey: ["proposals"], queryFn: api.proposals });
  const { data: locks } = useQuery({ queryKey: ["locks"], queryFn: api.locks });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const { data: vaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const { connected, publicKey } = useWallet();
  const queryClient = useQueryClient();
  const [proposer, setProposer] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  const wallet = connected && publicKey ? publicKey.toBase58() : "";
  const voter = wallet || proposer;

  const vote = useMutation({
    mutationFn: ({ id, inFavor }: { id: string; inFavor: boolean }) =>
      api.castVote(id, { voter, inFavor }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["proposals"], (old: { id: string }[] | undefined) =>
        (old ?? []).map((p) => (p.id === updated.id ? updated : p)),
      );
    },
  });

  const totalWeight = (locks ?? []).reduce((sum, l) => sum + l.weight, 0);
  const totalTvl = vaults?.reduce((a, v) => a + v.tvl, 0) ?? 0;
  const activeCount = (proposals ?? []).filter((p) => p.status === "active").length;
  const myLock = (locks ?? []).find((l) => l.holder === voter);
  const filtered = (proposals ?? []).filter(
    (p) => statusFilter === "all" || p.status === statusFilter,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Governance DAO</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Ve-locked ATLAS votes on risk parameters, treasury actions and protocol changes.
          Vote weight = locked amount × lock-duration multiplier.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Vote} label="Ve-ATLAS" value={formatUsd(totalWeight)} />
        <Stat icon={Users} label="Active proposals" value={String(activeCount)} />
        <Stat icon={ShieldCheck} label="Proposal classes" value={String(CLASSES.length)} />
        <Stat icon={Landmark} label="Treasury reserve" value={formatUsd(totalTvl * 0.1)} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Proposals</CardTitle>
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  {p.status === "active" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => vote.mutate({ id: p.id, inFavor: true })}
                        disabled={vote.isPending || voter === ""}
                      >
                        For
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => vote.mutate({ id: p.id, inFavor: false })}
                        disabled={vote.isPending || voter === ""}
                      >
                        Against
                      </Button>
                      {!voter && (
                        <span className="text-xs text-muted-foreground">
                          Connect a wallet or choose a voting wallet below to vote.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No proposals in this view.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <CreateVeLockForm onSuccess={() => queryClient.invalidateQueries({ queryKey: ["locks"] })} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My voting power</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {voter ? (
                <>
                  <p className="truncate text-xs text-muted-foreground">
                    Wallet {voter.slice(0, 6)}…{voter.slice(-4)}
                  </p>
                  {myLock ? (
                    <div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Ve-ATLAS weight</span>
                        <span className="font-semibold">{formatUsd(myLock.weight)}</span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm">
                        <span className="text-muted-foreground">Share of supply</span>
                        <span className="font-semibold">
                          {totalWeight > 0 ? ((myLock.weight / totalWeight) * 100).toFixed(2) : "0.00"}%
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between text-sm">
                        <span className="text-muted-foreground">Unlocks</span>
                        <span className="font-medium">
                          {new Date(myLock.unlockAt * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This wallet has no ve-ATLAS lock, so it has no voting weight.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Connect your wallet to see your voting power, or select a manager wallet below to
                  cast votes with its locked weight.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ve-locks</CardTitle>
              <CardDescription>Locked ATLAS powering governance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(locks ?? []).map((l) => (
                <div key={l.holder} className="rounded-md border border-border p-3">
                  <p className="truncate text-xs text-muted-foreground">{l.holder.slice(0, 18)}…</p>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="font-medium">{formatUsd(l.amount)}</span>
                    <span className="text-muted-foreground">
                      {totalWeight > 0 ? Math.round((l.weight / totalWeight) * 100) : 0}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    unlocks {new Date(l.unlockAt * 1000).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {(locks ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No locks yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">How ve-locking works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Lock ATLAS for up to 4 years to receive ve-ATLAS.</p>
              <p>Vote weight scales linearly with lock duration, up to 4× the locked amount.</p>
              <p>Votes count toward quorum and passage thresholds per proposal class.</p>
              <p>Unlocked positions stop earning weight immediately.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {connected && publicKey && (
          <Badge variant="positive">Voting as {publicKey.toBase58().slice(0, 8)}…</Badge>
        )}
        <label className="flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Voting wallet {connected && "(or use your connected wallet)"}</span>
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

      <CreateProposalForm proposer={proposer || wallet || "anonymous"} />
    </div>
  );
}
