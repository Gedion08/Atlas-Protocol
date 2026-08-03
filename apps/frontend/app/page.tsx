"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, Landmark, ShieldCheck, Target, TrendingUp, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatApy, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

export default function HomePage() {
  const { data: vaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });

  const totalTvl = vaults?.reduce((acc, v) => acc + v.tvl, 0) ?? 0;
  const activeManagers = (managers ?? []).filter((m) => m.status === "active");
  const topVaults = [...(vaults ?? [])].sort((a, b) => b.tvl - a.tvl).slice(0, 3);
  const topManagers = [...(managers ?? [])].sort((a, b) => b.score.total - a.score.total).slice(0, 3);

  return (
    <div className="space-y-16">
      <section className="bg-grid rounded-2xl border px-6 py-16 text-center sm:px-12">
        <Badge variant="outline" className="mb-6">
          Solana-native · on-chain verified
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          The operating system for professional liquidity providers
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Atlas allocates your capital to verified LP managers on Solana. Managers are ranked by
          transparent, on-chain performance — never by marketing. Every allocation is enforced by a
          risk engine with automatic circuit breakers.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/invest">
            <Button size="lg">
              Start investing <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/strategies">
            <Button size="lg" variant="outline">
              Explore strategies
            </Button>
          </Link>
          <Link href="/leaderboard">
            <Button size="lg" variant="ghost">
              View leaderboard
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label="Protocol TVL" value={formatUsd(totalTvl)} />
        <Stat icon={Users} label="Active Managers" value={String(activeManagers.length)} />
        <Stat icon={Target} label="Live Strategies" value={String(strategies?.length ?? 0)} />
        <Stat
          icon={TrendingUp}
          label="Weighted APY"
          value={
            vaults?.length
              ? formatApy(vaults.reduce((acc, v) => acc + v.apy * v.tvl, 0) / Math.max(1, totalTvl))
              : "—"
          }
        />
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">How Atlas works</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              title: "Deposit into vaults",
              body: "Connect your wallet and deposit into a vault. You receive oracle-priced shares instantly.",
            },
            {
              title: "Capital is allocated by score",
              body: "An allocation engine weights every manager by score, risk, drawdown, consistency and track record.",
            },
            {
              title: "Risk rules run automatically",
              body: "A risk engine monitors VaR, concentration, oracle health and liquidity. Violations trigger reallocation or a circuit-breaker pause.",
            },
          ].map((step, i) => (
            <Card key={step.title}>
              <CardContent className="p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Step {i + 1}</p>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Featured vaults</h2>
            <p className="mt-1 text-sm text-muted-foreground">Top vaults by assets under management</p>
          </div>
          <Link href="/invest" className="text-sm text-primary hover:underline">
            All vaults
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {topVaults.map((vault) => {
            const manager = (managers ?? []).find((m) => m.id === vault.managerId);
            return (
              <Card key={vault.address} className="transition-colors hover:border-primary/50">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{vault.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {vault.baseAsset} · managed by {manager?.name ?? "Atlas"}
                      </p>
                    </div>
                    <Badge variant="positive">{formatApy(vault.apy)} APY</Badge>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">TVL</dt>
                      <dd className="font-semibold">{formatUsd(vault.tvl)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Min deposit</dt>
                      <dd className="font-semibold">{formatUsd(vault.minDeposit)}</dd>
                    </div>
                  </dl>
                  <Link href={`/invest?vault=${encodeURIComponent(vault.address)}`} className="mt-5 block">
                    <Button variant="outline" className="w-full">
                      Invest <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Top managers</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ranked by the on-chain weighted score</p>
          </div>
          <Link href="/leaderboard" className="text-sm text-primary hover:underline">
            Full leaderboard
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {topManagers.map((m) => (
            <Link key={m.id} href={`/manager/${m.id}`} className="group">
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <p className="font-semibold group-hover:text-primary">{m.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.protocolsUsed.join(", ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-primary">{m.score.total}</p>
                    <p className="text-xs text-muted-foreground">{formatUsd(m.tvl)} managed</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-accent/30 p-10 text-center">
        <Landmark className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mx-auto mt-4 max-w-xl text-2xl font-semibold tracking-tight">
          Atlas does not predict markets and does not create yield. It allocates to managers who do.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Manager bonds are slashed for provable misconduct — never for a bad quarter. Poor
          performance is managed by automatic de-allocation and the circuit breaker.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/protocol">
            <Button variant="outline">
              <ShieldCheck className="h-4 w-4" /> Read the risk model
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
