"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowDownToLine, ArrowRight } from "lucide-react";
import type { Vault } from "atlas-types";
import { api } from "@/lib/api";
import { formatApy, formatBps, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestDialog } from "@/components/invest-dialog";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StrategyPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [investing, setInvesting] = useState(false);

  const { data: strategy } = useQuery({
    queryKey: ["strategy", params.id],
    queryFn: () => api.strategy(params.id),
  });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const { data: vaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });

  if (!strategy) {
    return <p className="text-muted-foreground">Strategy not found.</p>;
  }

  const manager = (managers ?? []).find((m) => m.id === strategy.managerId);
  const vault = (vaults ?? []).find((v) => v.managerId === strategy.managerId) ?? null;
  const related = (strategies ?? []).filter(
    (s) => s.managerId === strategy.managerId && s.id !== strategy.id,
  );
  const investable = vault !== null && vault.status === "active";

  const metrics: Array<[string, string]> = [
    ["APY", formatApy(strategy.apy)],
    ["APR", formatApy(strategy.apr)],
    ["TVL", formatUsd(strategy.tvl)],
    ["Sharpe", strategy.sharpeRatio.toFixed(2)],
    ["Sortino", strategy.sortinoRatio.toFixed(2)],
    ["Max drawdown", formatPct(strategy.maxDrawdown)],
    ["Impermanent loss", formatPct(strategy.impermanentLoss)],
    ["Utilization", formatPct(strategy.utilization)],
    ["Age", `${strategy.ageDays} days`],
    ["Version", `v${strategy.version}`],
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/strategies" className="text-sm text-muted-foreground hover:text-primary">
            ← All strategies
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{strategy.name}</h1>
            <Badge variant={strategy.riskTier <= 2 ? "positive" : strategy.riskTier === 3 ? "warning" : "destructive"}>
              Tier {strategy.riskTier}
            </Badge>
            <Badge variant="outline" className="capitalize">{strategy.type}</Badge>
          </div>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {strategy.protocol} · {strategy.pair} · {strategy.pool}
          </p>
        </div>
        <div className="flex gap-3">
          {manager && (
            <Link href={`/manager/${manager.id}`}>
              <Button variant="outline">View manager</Button>
            </Link>
          )}
          <Button
            disabled={!investable}
            onClick={() => setInvesting(true)}
            title={investable ? undefined : "No open vault for this strategy"}
          >
            <ArrowDownToLine className="h-4 w-4" /> Invest
          </Button>
        </div>
      </section>

      {!investable && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This strategy has no open vault to deposit into right now.
        </p>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Track record</CardTitle>
            <CardDescription>Risk-adjusted performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {metrics.map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Management fee</span>
                <span className="font-medium">{formatBps(strategy.fees.managementBps)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Performance fee</span>
                <span className="font-medium">{formatBps(strategy.fees.performanceBps)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Liquidity utilization</span>
                <span className="font-medium">{formatPct(strategy.utilization)}</span>
              </div>
              <Progress value={strategy.utilization * 100} />
            </CardContent>
          </Card>

          {manager && (
            <Card>
              <CardHeader>
                <CardTitle>Manager</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{manager.name}</span>
                  <Badge variant={manager.status === "active" ? "positive" : "warning"}>
                    {manager.status}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-medium text-primary">{manager.score.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">TVL managed</span>
                  <span className="font-medium">{formatUsd(manager.tvl)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bonded</span>
                  <span className="font-medium">{formatUsd(manager.bondAmount)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {vault && (
            <Card>
              <CardHeader>
                <CardTitle>Vault</CardTitle>
                <CardDescription>Where your deposit is routed</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{vault.name}</span>
                  <Badge variant="positive">{formatApy(vault.apy)} APY</Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Base asset</span>
                  <span className="font-medium">{vault.baseAsset}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">TVL</span>
                  <span className="font-medium">{formatUsd(vault.tvl)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Min deposit</span>
                  <span className="font-medium">{formatUsd(vault.minDeposit)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {strategy.description && (
        <Card>
          <CardHeader>
            <CardTitle>Strategy description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{strategy.description}</p>
          </CardContent>
        </Card>
      )}

      {related.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">More from this manager</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>APY</TableHead>
                <TableHead>Max DD</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {related.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">{s.protocol}</TableCell>
                  <TableCell className="text-positive">{formatApy(s.apy)}</TableCell>
                  <TableCell>{formatPct(s.maxDrawdown)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">T{s.riskTier}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/strategies/${s.id}`}>
                      <Button size="sm" variant="ghost">
                        Open <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {vault && investing && (
        <InvestDialog
          vault={vault as Vault}
          open={investing}
          onOpenChange={setInvesting}
          strategyId={strategy.id}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: ["vaults"] });
            void queryClient.invalidateQueries({ queryKey: ["strategies"] });
          }}
        />
      )}
    </div>
  );
}
