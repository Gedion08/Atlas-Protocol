"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDownToLine, ArrowRight, ExternalLink } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ManagerScore, Vault } from "atlas-types";
import { api } from "@/lib/api";
import { formatApy, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestDialog } from "@/components/invest-dialog";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const scoreLabels: Array<[keyof ManagerScore, string]> = [
  ["feeGeneration", "Fee Generation (30%)"],
  ["risk", "Risk (20%)"],
  ["drawdown", "Drawdown (15%)"],
  ["capitalRetention", "Capital Retention (10%)"],
  ["consistency", "Consistency (10%)"],
  ["tvlGrowth", "TVL Growth (10%)"],
  ["governanceParticipation", "Governance (5%)"],
];

export default function ManagerPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [investVault, setInvestVault] = useState<Vault | null>(null);

  const { data: manager } = useQuery({
    queryKey: ["manager", params.id],
    queryFn: () => api.manager(params.id),
  });
  const { data: performance } = useQuery({
    queryKey: ["perf", params.id],
    queryFn: () => api.managerPerformance(params.id),
  });
  const { data: risk } = useQuery({
    queryKey: ["manager-risk", params.id],
    queryFn: () => api.managerRisk(params.id),
    retry: false,
  });
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const { data: vaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });

  if (!manager) return <p className="text-muted-foreground">Manager not found.</p>;

  const managerStrategies = (strategies ?? []).filter((s) => s.managerId === manager.id);
  const managerVaults = (vaults ?? []).filter((v) => v.managerId === manager.id);
  const scoreSection = manager.score;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-primary">
            ← Leaderboard
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{manager.name}</h1>
            <Badge variant={manager.status === "active" ? "positive" : "warning"}>{manager.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {manager.poolsTraded} pools · {manager.protocolsUsed.join(", ")} ·{" "}
            {manager.yearsActive} yr active
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/strategies?manager=${manager.id}`}>
            <Button variant="outline">
              <ExternalLink className="h-4 w-4" /> View strategies
            </Button>
          </Link>
          {managerVaults[0] && (
            <Button
              disabled={manager.status !== "active" || managerVaults[0].status !== "active"}
              onClick={() => setInvestVault(managerVaults[0])}
            >
              <ArrowDownToLine className="h-4 w-4" /> Invest with {manager.name}
            </Button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Track Record</CardTitle>
            <CardDescription>Net asset value over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance?.series} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nav" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(152 62% 48%)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(152 62% 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis domain={["dataMin", "dataMax"]} hide />
                  <Tooltip
                    contentStyle={{ background: "hsl(240 10% 7%)", border: "1px solid hsl(240 8% 16%)", borderRadius: 8 }}
                    labelFormatter={(ts) => new Date(Number(ts)).toLocaleDateString()}
                    formatter={(value) => formatUsd(Number(value))}
                  />
                  <Area type="monotone" dataKey="tvl" stroke="hsl(152 62% 48%)" fill="url(#nav)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
            <CardDescription>Weighted reputation components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scoreLabels.map(([key, label]) => (
              <div key={key}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{scoreSection[key]}</span>
                </div>
                <Progress value={scoreSection[key]} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground">TVL</p><p className="mt-1 text-xl font-semibold">{formatUsd(manager.tvl)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground">Assets Managed</p><p className="mt-1 text-xl font-semibold">{formatUsd(manager.assetsUnderManagement)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground">Fees Generated</p><p className="mt-1 text-xl font-semibold">{formatUsd(manager.feesGenerated)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase text-muted-foreground">Bonded Capital</p><p className="mt-1 text-xl font-semibold">{formatUsd(manager.bondAmount)}</p></CardContent></Card>
      </section>

      {performance && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">APY</p><p className="mt-1 font-semibold">{formatApy(performance.apy)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Sharpe</p><p className="mt-1 font-semibold">{performance.sharpe.toFixed(2)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Sortino</p><p className="mt-1 font-semibold">{performance.sortino.toFixed(2)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Calmar</p><p className="mt-1 font-semibold">{performance.calmar.toFixed(2)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Win Rate</p><p className="mt-1 font-semibold">{formatPct(performance.winRate)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Recovery Factor</p><p className="mt-1 font-semibold">{performance.recoveryFactor.toFixed(2)}</p></CardContent></Card>
        </section>
      )}

      {risk && (
        <Card>
          <CardHeader>
            <CardTitle>Risk Snapshot</CardTitle>
            <CardDescription>Latest risk-engine decision</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={risk.action === "ok" ? "positive" : risk.action === "reduce" ? "warning" : "destructive"}>
                {risk.action}
              </Badge>
              <span className="text-sm text-muted-foreground">score {risk.score.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">
                evaluated {new Date(risk.evaluatedAt).toLocaleString()}
              </span>
            </div>
            {risk.violations.length > 0 && (
              <ul className="space-y-1">
                {risk.violations.map((v) => (
                  <li key={v.rule} className="text-sm">
                    <Badge variant={v.severity === "critical" ? "destructive" : "warning"} className="mr-2">
                      {v.severity}
                    </Badge>
                    <span className="text-muted-foreground">
                      {v.rule}: {formatPct(v.current)} / limit {formatPct(v.limit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {risk.violations.length === 0 && (
              <p className="text-sm text-muted-foreground">No active violations.</p>
            )}
          </CardContent>
        </Card>
      )}

      {managerVaults.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Vaults</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {managerVaults.map((vault) => {
              const sharePrice = vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 1;
              return (
                <Card key={vault.address}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{vault.name}</p>
                        <p className="text-xs text-muted-foreground">{vault.baseAsset} · oracle-priced shares</p>
                      </div>
                      <Badge variant="positive">{formatApy(vault.apy)} APY</Badge>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">TVL</dt>
                        <dd className="font-semibold">{formatUsd(vault.tvl)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Share price</dt>
                        <dd className="font-semibold">{formatUsd(sharePrice)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Min</dt>
                        <dd className="font-semibold">{formatUsd(vault.minDeposit)}</dd>
                      </div>
                    </dl>
                    <Button
                      className="mt-4 w-full"
                      size="sm"
                      disabled={vault.status !== "active"}
                      onClick={() => setInvestVault(vault)}
                    >
                      <ArrowDownToLine className="h-4 w-4" /> Deposit
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Strategies</h2>
          <Link href={`/strategies?manager=${manager.id}`} className="text-sm text-primary hover:underline">
            All strategies by {manager.name}
          </Link>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>TVL</TableHead>
                <TableHead>APY</TableHead>
                <TableHead>Sharpe</TableHead>
                <TableHead>Max DD</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managerStrategies.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.type}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{s.protocol}</TableCell>
                  <TableCell>{formatUsd(s.tvl)}</TableCell>
                  <TableCell className="text-positive">{formatApy(s.apy)}</TableCell>
                  <TableCell>{s.sharpeRatio.toFixed(2)}</TableCell>
                  <TableCell>{formatPct(s.maxDrawdown)}</TableCell>
                  <TableCell><Badge variant="outline">{s.riskTier}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/strategies/${s.id}`}>
                      <Button size="sm" variant="ghost">
                        Invest <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {managerStrategies.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No strategies found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      {investVault && (
        <InvestDialog
          vault={investVault}
          open={investVault !== null}
          onOpenChange={(open) => {
            if (!open) setInvestVault(null);
          }}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["vaults"] });
            void queryClient.invalidateQueries({ queryKey: ["manager", params.id] });
          }}
        />
      )}
    </div>
  );
}
