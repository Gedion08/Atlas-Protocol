"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, ShieldCheck, Target, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatApy, formatPct, formatUsd } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className="rounded-md bg-accent p-2 text-accent-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function InvestorPage() {
  const { data: vaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const { data: performance } = useQuery({
    queryKey: ["perf", "mgr_quantum"],
    queryFn: () => api.managerPerformance("mgr_quantum"),
  });

  function sharePrice(vault: { tvl: number; sharesOutstanding: number }) {
    return vault.sharesOutstanding > 0
      ? `$${(vault.tvl / vault.sharesOutstanding).toFixed(4)}`
      : "—";
  }

  const totalTvl = vaults?.reduce((acc, v) => acc + v.tvl, 0) ?? 0;
  const weightedApy = vaults?.length
    ? vaults.reduce((acc, v) => acc + v.apy * v.tvl, 0) / totalTvl
    : 0;

  return (
    <div className="space-y-8">
      <section className="bg-grid rounded-2xl border p-8">
        <Badge variant="outline" className="mb-4">
          Decentralized liquidity management
        </Badge>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight">
          Your capital, allocated to the best LP managers on-chain.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Atlas never predicts markets and never creates yield. It allocates capital intelligently
          to verified managers ranked by transparent performance.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/strategies">
            <Button>Explore Strategies</Button>
          </Link>
          <Link href="/leaderboard">
            <Button variant="outline">View Leaderboard</Button>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Total TVL" value={formatUsd(totalTvl)} sub="across all vaults" />
        <StatCard icon={TrendingUp} label="Weighted APY" value={formatApy(weightedApy)} sub="risk-adjusted" />
        <StatCard icon={Target} label="Active Managers" value={String(managers?.filter((m) => m.status === "active").length ?? 0)} />
        <StatCard icon={ShieldCheck} label="Cash Reserve" value={formatPct(0.1)} sub="protocol default" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Portfolio Performance</CardTitle>
            <CardDescription>Net asset value, last 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performance?.series} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="nav" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(262 80% 62%)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(262 80% 62%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" hide />
                  <YAxis domain={["dataMin", "dataMax"]} hide />
                  <Tooltip
                    contentStyle={{ background: "hsl(240 10% 7%)", border: "1px solid hsl(240 8% 16%)", borderRadius: 8 }}
                    labelFormatter={(ts) => new Date(Number(ts)).toLocaleDateString()}
                    formatter={(value) => formatUsd(Number(value))}
                  />
                  <Area type="monotone" dataKey="tvl" stroke="hsl(262 80% 62%)" fill="url(#nav)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
            <CardDescription>How capital is distributed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(vaults ?? []).slice(0, 4).map((vault, i) => {
              const share = totalTvl > 0 ? vault.tvl / totalTvl : 0;
              return (
                <div key={vault.address}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{vault.name}</span>
                    <span className="text-muted-foreground">{formatPct(share)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                  {i === (vaults?.length ?? 0) - 1 && (
                    <div className="mt-1 text-right text-xs text-muted-foreground">
                      10% cash reserve
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Vaults</h2>
          <span className="text-sm text-muted-foreground">oracle-priced shares</span>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vault</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>TVL</TableHead>
                <TableHead>APY</TableHead>
                <TableHead>Share price</TableHead>
                <TableHead>Shares</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vaults ?? []).map((vault) => (
                <TableRow key={vault.address}>
                  <TableCell className="font-medium">{vault.name}</TableCell>
                  <TableCell>{vault.baseAsset}</TableCell>
                  <TableCell>{formatUsd(vault.tvl)}</TableCell>
                  <TableCell className="text-positive">{formatApy(vault.apy)}</TableCell>
                  <TableCell>{sharePrice(vault)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatUsd(vault.sharesOutstanding)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Top Managers</h2>
          <Link href="/leaderboard" className="text-sm text-primary hover:underline">
            Full leaderboard
          </Link>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Manager</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>TVL</TableHead>
                <TableHead>Max Drawdown</TableHead>
                <TableHead>Bonded</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(managers ?? []).slice(0, 5).map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/manager/${m.id}`} className="font-medium hover:text-primary">
                      {m.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.score.total >= 75 ? "positive" : "outline"}>{m.score.total}</Badge>
                  </TableCell>
                  <TableCell>{formatUsd(m.tvl)}</TableCell>
                  <TableCell>{formatPct(m.maxDrawdown)}</TableCell>
                  <TableCell>{formatUsd(m.bondAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "positive" : "destructive"}>{m.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
