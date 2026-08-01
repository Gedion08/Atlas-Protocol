"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Landmark, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const riskRules = [
  { id: "max_drawdown", name: "Maximum drawdown", limit: 0.15, severity: "critical" },
  { id: "daily_loss", name: "Daily loss", limit: 0.05, severity: "critical" },
  { id: "weekly_loss", name: "Weekly loss", limit: 0.1, severity: "critical" },
  { id: "max_per_manager", name: "Maximum per manager", limit: 0.3, severity: "critical" },
  { id: "max_per_protocol", name: "Maximum per protocol", limit: 0.4, severity: "warning" },
  { id: "max_per_token", name: "Maximum per token", limit: 0.2, severity: "warning" },
  { id: "max_memecoins", name: "Maximum memecoin exposure", limit: 0.1, severity: "warning" },
  { id: "max_stable_pools", name: "Maximum stable pool exposure", limit: 0.25, severity: "warning" },
];

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

export default function ProtocolPage() {
  const { data: managers } = useQuery({ queryKey: ["managers"], queryFn: api.managers });
  const { data: vaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });

  const totalTvl = vaults?.reduce((a, v) => a + v.tvl, 0) ?? 0;
  const totalBonded = (managers ?? []).reduce((a, m) => a + m.bondAmount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Protocol</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Atlas is infrastructure. It does not create yield; it allocates capital and enforces risk.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Landmark} label="Protocol TVL" value={formatUsd(totalTvl)} />
        <Stat icon={Users} label="Active Managers" value={String((managers ?? []).filter((m) => m.status === "active").length)} />
        <Stat icon={ShieldCheck} label="Manager Bonds" value={formatUsd(totalBonded)} />
        <Stat icon={Activity} label="Reallocations" value="hourly" />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Risk Rules</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Severity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {riskRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{formatPct(rule.limit)}</TableCell>
                  <TableCell>
                    <Badge variant={rule.severity === "critical" ? "destructive" : "warning"}>
                      {rule.severity}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>How allocation works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                1. Investors deposit into vaults and receive shares.
              </p>
              <p>
                2. The allocation engine weights every manager by score, risk, fee efficiency,
                consistency, drawdown and track record.
              </p>
              <p>
                3. The risk engine monitors VaR, IL, concentration, oracle health and liquidity.
                Limits trigger automatic reallocation or emergency pause.
              </p>
              <p>
                4. Managers bond capital; rule violations and provable misconduct are slashed,
                poor performance alone is never slashed.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Revenue model</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Management fees, performance fees, strategy marketplace fees, analytics
              subscriptions, enterprise API, institution dashboards, white-label licensing and
              insurance fund contributions.
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
