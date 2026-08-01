"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatApy, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function LeaderboardPage() {
  const { data: leaders } = useQuery({ queryKey: ["leaderboard"], queryFn: api.leaderboard });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Manager Leaderboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ranked by the on-chain weighted score. Capital flows automatically toward managers with
          the best risk-adjusted outcomes.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">#</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>TVL</TableHead>
              <TableHead>APY</TableHead>
              <TableHead>Sharpe</TableHead>
              <TableHead>Max DD</TableHead>
              <TableHead>Years</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(leaders ?? []).map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-semibold text-muted-foreground">{m.rank}</TableCell>
                <TableCell>
                  <Link href={`/manager/${m.id}`} className="font-medium hover:text-primary">
                    {m.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={m.score.total >= 75 ? "positive" : "outline"}>{m.score.total}</Badge>
                </TableCell>
                <TableCell>{formatUsd(m.tvl)}</TableCell>
                <TableCell className="text-positive">{formatApy(m.apy)}</TableCell>
                <TableCell>{m.sharpe.toFixed(2)}</TableCell>
                <TableCell>{formatPct(m.maxDrawdown)}</TableCell>
                <TableCell className="text-muted-foreground">{m.yearsActive}</TableCell>
                <TableCell>
                  <Badge variant={m.status === "active" ? "positive" : "destructive"}>{m.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
