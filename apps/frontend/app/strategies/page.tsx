"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatApy, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StrategyUploadForm } from "@/components/strategy-upload-form";

const filters = [
  "all",
  "meteora",
  "orca",
  "raydium",
  "kamino",
  "drift",
  "jupiter",
] as const;

export default function StrategiesPage() {
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [managerFilter, setManagerFilter] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setManagerFilter(params.get("manager"));
  }, []);

  const filtered = (strategies ?? []).filter(
    (s) =>
      (filter === "all" || s.protocol === filter) &&
      (!managerFilter || s.managerId === managerFilter),
  );

  const managerName = (managers ?? []).find((m) => m.id === managerFilter)?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Strategy Marketplace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every strategy carries its full track record: TVL, APY, drawdown, Sharpe, IL history,
            utilization and manager score.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
        {managerFilter && (
          <Badge variant="outline">
            manager: {managerName ?? managerFilter}
            <button
              onClick={() => setManagerFilter(null)}
              className="ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Clear manager filter"
            >
              ✕
            </button>
          </Badge>
        )}
      </div>

      <StrategyUploadForm managers={managers ?? []} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => {
          const manager = (managers ?? []).find((m) => m.id === s.managerId);
          return (
            <Card key={s.id} className="flex flex-col transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <Badge variant={s.riskTier <= 2 ? "positive" : s.riskTier === 3 ? "warning" : "destructive"}>
                    T{s.riskTier}
                  </Badge>
                </div>
                <p className="text-xs capitalize text-muted-foreground">
                  {s.protocol} · {s.pair} · {s.type}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">APY</p>
                    <p className="font-semibold text-positive">{formatApy(s.apy)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">TVL</p>
                    <p className="font-semibold">{formatUsd(s.tvl)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sharpe</p>
                    <p className="font-semibold">{s.sharpeRatio.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max DD</p>
                    <p className="font-semibold">{formatPct(s.maxDrawdown)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IL</p>
                    <p className="font-semibold">{formatPct(s.impermanentLoss)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Utilization</p>
                    <p className="font-semibold">{formatPct(s.utilization)}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                  {manager ? (
                    <Link
                      href={`/manager/${manager.id}`}
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      {manager.name} · score {manager.score.total}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <Link href={`/strategies/${s.id}`}>
                    <Button size="sm" variant="outline">
                      Invest <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card className="md:col-span-2 lg:col-span-3">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No strategies match the current filters.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
