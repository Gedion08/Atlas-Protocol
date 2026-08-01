"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ManagerScore } from "atlas-types";
import { api } from "@/lib/api";
import { formatApy, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { data: manager } = useQuery({
    queryKey: ["manager", params.id],
    queryFn: () => api.manager(params.id),
  });
  const { data: performance } = useQuery({
    queryKey: ["perf", params.id],
    queryFn: () => api.managerPerformance(params.id),
  });
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });

  if (!manager) return <p className="text-muted-foreground">Manager not found.</p>;

  const managerStrategies = (strategies ?? []).filter((s) => s.managerId === manager.id);
  const scoreSection = manager.score;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant={manager.status === "active" ? "positive" : "warning"}>{manager.status}</Badge>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{manager.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {manager.poolsTraded} pools · {manager.protocolsUsed.join(", ")} ·{" "}
            {manager.yearsActive} yr active
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Manager Score</p>
          <p className="text-4xl font-semibold text-primary">{manager.score.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">computed on-chain</p>
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
          <Card><CardContent className="p-4"><p className="text-xs uppercase text-muted-foreground">Ulcer Index</p><p className="mt-1 font-semibold">{performance.ulcerIndex.toFixed(2)}</p></CardContent></Card>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold">Strategies</h2>
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
                </TableRow>
              ))}
              {managerStrategies.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No strategies found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
