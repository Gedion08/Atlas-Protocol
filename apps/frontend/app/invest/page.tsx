"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowDownToLine, ArrowUpFromLine, Wallet } from "lucide-react";
import type { InvestorPosition, Vault } from "atlas-types";
import { api } from "@/lib/api";
import { formatApy, formatNumber, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/error-state";
import { VaultCardSkeleton } from "@/components/skeletons/vault-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestDialog } from "@/components/invest-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function InvestPage() {
  const { connected, publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const [activeVault, setActiveVault] = useState<Vault | null>(null);
  const [dialogMode, setDialogMode] = useState<"deposit" | "withdraw">("deposit");
  const [withdrawPosition, setWithdrawPosition] = useState<InvestorPosition | null>(null);

  const { data: vaults, refetch: refetchVaults } = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["investor", wallet],
    queryFn: () => api.investorSummary(wallet as string),
    enabled: !!wallet,
  });
  const { data: positions, refetch: refetchPositions } = useQuery({
    queryKey: ["positions", wallet],
    queryFn: () => api.investorPositions(wallet as string),
    enabled: !!wallet,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("vault");
    if (!target || !vaults) return;
    const vault = vaults.find((v) => v.address === target);
    if (vault) {
      setActiveVault(vault);
      setDialogMode("deposit");
      setWithdrawPosition(null);
    }
  }, [vaults]);

  const activePositions = (positions ?? []).filter((p) => p.status !== "withdrawn");
  const vaultByAddress = new Map((vaults ?? []).map((v) => [v.address, v]));

  function currentValue(position: InvestorPosition): number {
    const vault = vaultByAddress.get(position.vaultAddress);
    if (!vault || vault.sharesOutstanding <= 0) return position.amount;
    return position.shares * (vault.tvl / vault.sharesOutstanding);
  }

  function onInvestSuccess() {
    void refetchVaults();
    if (wallet) {
      void refetchSummary();
      void refetchPositions();
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Invest</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Deposit into oracle-priced vaults and receive shares. Capital is allocated across verified
          managers by the on-chain score. Withdraw anytime — there is no lock-up.
        </p>
      </section>

      {!connected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Connect your wallet to invest</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your wallet signs deposits so Atlas can mint priced shares against your vault positions.
              Use the wallet button in the header to connect.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Phantom and Solflare are supported.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total invested</p>
              <p className="mt-1 text-2xl font-semibold">{formatUsd(summary?.totalInvested ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current value</p>
              <p className="mt-1 text-2xl font-semibold">{formatUsd(summary?.currentValue ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Open positions</p>
              <p className="mt-1 text-2xl font-semibold">{summary?.positionCount ?? activePositions.length}</p>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Vaults</h2>
            <p className="text-sm text-muted-foreground">Oracle-priced shares · no lock-up</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(vaults ?? []).map((vault) => {
            const sharePrice =
              vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 1;
            return (
              <Card key={vault.address} className="transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{vault.name}</CardTitle>
                      <CardDescription>{vault.baseAsset} vault</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {vault.onchain && (
                        <Badge variant="outline" className="text-xs">On-chain</Badge>
                      )}
                      <Badge variant="positive">{formatApy(vault.apy)} APY</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">TVL</dt>
                      <dd className="font-semibold">{formatUsd(vault.tvl)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Share price</dt>
                      <dd className="font-semibold">{formatUsd(sharePrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Min deposit</dt>
                      <dd className="font-semibold">{formatUsd(vault.minDeposit)}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={!connected || vault.status !== "active"}
                      onClick={() => {
                        setActiveVault(vault);
                        setDialogMode("deposit");
                        setWithdrawPosition(null);
                      }}
                    >
                      <ArrowDownToLine className="h-4 w-4" /> Deposit
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={
                        !connected ||
                        !(activePositions ?? []).some((p) => p.vaultAddress === vault.address)
                      }
                      onClick={() => {
                        setActiveVault(vault);
                        setDialogMode("withdraw");
                        setWithdrawPosition(
                          (activePositions ?? []).find((p) => p.vaultAddress === vault.address) ?? null,
                        );
                      }}
                    >
                      <ArrowUpFromLine className="h-4 w-4" /> Withdraw
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {(vaults ?? []).length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No vaults available right now. Check back shortly.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {connected && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">My positions</h2>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vault</TableHead>
                  <TableHead>Deposited</TableHead>
                  <TableHead>Shares</TableHead>
                  <TableHead>Share price</TableHead>
                  <TableHead>Current value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(positions ?? []).map((position) => {
                  const vault = vaultByAddress.get(position.vaultAddress);
                  return (
                    <TableRow key={position.id}>
                      <TableCell className="font-medium">{vault?.name ?? position.vaultAddress.slice(0, 8)}</TableCell>
                      <TableCell>{formatUsd(position.amount)}</TableCell>
                      <TableCell>{formatNumber(position.shares, 6)}</TableCell>
                      <TableCell>{formatUsd(position.sharePrice)}</TableCell>
                      <TableCell className={position.status === "active" ? "text-positive" : "text-muted-foreground"}>
                        {formatUsd(currentValue(position))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={position.status === "active" ? "positive" : "outline"}>
                          {position.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {(position.claimable ?? 0) > 0 && vault ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveVault(vault);
                              setDialogMode("withdraw");
                              setWithdrawPosition(position);
                            }}
                          >
                            Settle
                          </Button>
                        ) : position.status === "active" && vault ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveVault(vault);
                              setDialogMode("withdraw");
                              setWithdrawPosition(position);
                            }}
                          >
                            Withdraw
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(positions ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No positions yet. Deposit into a vault to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      )}

      {activeVault && (
        <InvestDialog
          vault={activeVault}
          open={true}
          onOpenChange={(open) => {
            if (!open) setActiveVault(null);
          }}
          mode={dialogMode}
          position={withdrawPosition ?? undefined}
          onSuccess={onInvestSuccess}
        />
      )}
    </div>
  );
}
