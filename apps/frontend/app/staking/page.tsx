"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { Loader2, Plus, Unplug, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/error-state";

export default function StakingPage() {
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const [bondAmount, setBondAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bondStatusQuery = useQuery({
    queryKey: ["bondStatus", wallet],
    queryFn: () => api.stakingBondStatus(wallet),
    enabled: !!wallet,
  });

  const bondMutation = useMutation({
    mutationFn: () => api.stakingBond(wallet, Number(bondAmount)),
    onSuccess: async (data) => {
      if (!signTransaction || !sendTransaction) {
        setError("Wallet does not support signing transactions.");
        return;
      }
      try {
        const txBuffer = Buffer.from((data as { transaction: string }).transaction, "base64");
        const transaction = Transaction.from(txBuffer);
        const signed = await signTransaction(transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(signed, connection);
        setError(null);
        setBondAmount("");
        bondStatusQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bond transaction failed");
      }
    },
  });

  const unbondMutation = useMutation({
    mutationFn: () => api.stakingUnbond(wallet),
    onSuccess: async (data) => {
      if (!signTransaction || !sendTransaction) {
        setError("Wallet does not support signing transactions.");
        return;
      }
      try {
        const txBuffer = Buffer.from((data as { transaction: string }).transaction, "base64");
        const transaction = Transaction.from(txBuffer);
        const signed = await signTransaction(transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(signed, connection);
        setError(null);
        bondStatusQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbond transaction failed");
      }
    },
  });

  const claimMutation = useMutation({
    mutationFn: () => api.stakingClaim(wallet),
    onSuccess: async (data) => {
      if (!signTransaction || !sendTransaction) {
        setError("Wallet does not support signing transactions.");
        return;
      }
      try {
        const txBuffer = Buffer.from((data as { transaction: string }).transaction, "base64");
        const transaction = Transaction.from(txBuffer);
        const signed = await signTransaction(transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(signed, connection);
        setError(null);
        bondStatusQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Claim transaction failed");
      }
    },
  });

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Staking</h1>
          <p className="mt-2 text-sm text-muted-foreground">Bond ATLAS to become a manager or lock for governance weight.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connect your wallet to view your bond.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Staking</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage your ATLAS bond and ve-lock positions.</p>
      </div>

      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

      <Tabs defaultValue="bond">
        <TabsList>
          <TabsTrigger value="bond">Bond</TabsTrigger>
          <TabsTrigger value="unbond">Unbond</TabsTrigger>
          <TabsTrigger value="claim">Claim</TabsTrigger>
        </TabsList>
        <TabsContent value="bond" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bond ATLAS</CardTitle>
              <CardDescription>Lock ATLAS as a performance bond. Required to register as a manager.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bondStatusQuery.isLoading && <p className="text-sm text-muted-foreground">Loading bond status...</p>}
              {bondStatusQuery.isError && <ErrorState message="Failed to load bond status." onRetry={() => bondStatusQuery.refetch()} />}
              {bondStatusQuery.data?.exists && (
                <div className="flex items-center gap-2">
                  <Badge variant="positive">Bond Active</Badge>
                  <span className="text-sm text-muted-foreground">PDA: {bondStatusQuery.data.address?.slice(0, 8)}...</span>
                </div>
              )}
              {!bondStatusQuery.data?.exists && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="amount">Amount (ATLAS)</Label>
                    <Input id="amount" type="number" value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} min="1000" step="1000" />
                  </div>
                  <Button onClick={() => bondMutation.mutate()} disabled={bondMutation.isPending || Number(bondAmount) < 1000}>
                    {bondMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bonding...</> : <><Plus className="mr-2 h-4 w-4" /> Bond ATLAS</>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="unbond" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Unbond</CardTitle>
              <CardDescription>Start the unbonding process. There is a cooldown period before you can claim.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => unbondMutation.mutate()} disabled={unbondMutation.isPending || !bondStatusQuery.data?.exists}>
                {unbondMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Unbonding...</> : <><Unplug className="mr-2 h-4 w-4" /> Start Unbond</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="claim" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Claim</CardTitle>
              <CardDescription>Claim your ATLAS after the unbonding cooldown has elapsed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending || !bondStatusQuery.data?.exists}>
                {claimMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Claiming...</> : "Claim ATLAS"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
