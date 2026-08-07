"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { decodeTransaction } from "@/lib/solana";
import { Loader2, Plus, Unplug, Wallet, Coins, TrendingUp, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState } from "@/components/error-state";

const ATLAS_MINT = "7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa";
const SOL_DECIMALS = 1_000_000_000;

function formatSol(lamports: number): string {
  return (lamports / SOL_DECIMALS).toFixed(4);
}

export default function StakingPage() {
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";

  const [bondAmount, setBondAmount] = useState("");
  const [faucetAmount, setFaucetAmount] = useState("");
  const [saleSol, setSaleSol] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bondStatusQuery = useQuery({
    queryKey: ["bondStatus", wallet],
    queryFn: () => api.stakingBondStatus(wallet),
    enabled: !!wallet,
  });

  const balanceQuery = useQuery({
    queryKey: ["tokenBalance", wallet],
    queryFn: () => api.tokenBalance(wallet),
    enabled: !!wallet,
  });

  const saleInfoQuery = useQuery({
    queryKey: ["tokenSaleInfo"],
    queryFn: api.tokenSaleInfo,
  });

  const bondMutation = useMutation({
    mutationFn: () => api.stakingBond(wallet, Number(bondAmount)),
    onSuccess: async (data) => {
      if (!sendTransaction) {
        setError("Wallet does not support sending transactions.");
        return;
      }
      try {
        const transaction = decodeTransaction((data as { transaction: string }).transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(transaction, connection);
        setError(null);
        setBondAmount("");
        bondStatusQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bond transaction failed");
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Bond failed"),
  });

  const unbondMutation = useMutation({
    mutationFn: () => api.stakingUnbond(wallet),
    onSuccess: async (data) => {
      if (!sendTransaction) {
        setError("Wallet does not support sending transactions.");
        return;
      }
      try {
        const transaction = decodeTransaction((data as { transaction: string }).transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(transaction, connection);
        setError(null);
        bondStatusQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbond transaction failed");
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Unbond failed"),
  });

  const claimMutation = useMutation({
    mutationFn: () => api.stakingClaim(wallet),
    onSuccess: async (data) => {
      if (!sendTransaction) {
        setError("Wallet does not support sending transactions.");
        return;
      }
      try {
        const transaction = decodeTransaction((data as { transaction: string }).transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(transaction, connection);
        setError(null);
        bondStatusQuery.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Claim transaction failed");
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Claim failed"),
  });

  const faucetMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect your wallet first");
      const amount = Number(faucetAmount) || saleInfoQuery.data?.faucetAmount || 1000;
      return api.tokenFaucet(wallet, amount);
    },
    onSuccess: () => {
      setError(null);
      setFaucetAmount("");
      balanceQuery.refetch();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Faucet failed"),
  });

  const saleMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect your wallet first");
      if (!signTransaction || !sendTransaction) throw new Error("Wallet does not support signing transactions.");
      const solAmount = Number(saleSol);
      if (!solAmount || solAmount <= 0) throw new Error("Enter a valid SOL amount");
      const data = await api.tokenSaleBuild(wallet, solAmount);
      const txBuffer = Buffer.from(data.transaction, "base64");
      const transaction = Transaction.from(txBuffer);
      const signed = await signTransaction(transaction);
      const connection = new Connection("https://api.devnet.solana.com");
      const signature = await sendTransaction(signed, connection);
      await connection.confirmTransaction(signature, "confirmed");
      return { signature, data };
    },
    onSuccess: () => {
      setError(null);
      setSaleSol("");
      balanceQuery.refetch();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Purchase failed"),
  });

  const atlasBalance = balanceQuery.data?.balance ?? 0;
  const rate = saleInfoQuery.data?.rate ?? 1000;
  const minSol = saleInfoQuery.data?.minSol ?? 0.01;
  const maxSol = saleInfoQuery.data?.maxSol ?? 10;
  const estimatedAtlas = Number(saleSol) > 0 ? Math.floor(Number(saleSol) * rate) : 0;

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Staking & Token</h1>
          <p className="mt-2 text-sm text-muted-foreground">Bond ATLAS to become a manager, or get ATLAS for governance and staking.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connect your wallet to manage your bond and ATLAS tokens.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Staking & Token</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage your ATLAS bond, unlock governance weight, and get ATLAS.</p>
      </div>

      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

      <Tabs defaultValue="staking">
        <TabsList>
          <TabsTrigger value="staking">Staking</TabsTrigger>
          <TabsTrigger value="token">Token</TabsTrigger>
        </TabsList>
        <TabsContent value="staking" className="space-y-4">
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
        </TabsContent>
        <TabsContent value="token" className="space-y-4">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-md bg-accent p-2 text-accent-foreground">
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Your ATLAS</p>
                  <p className="text-xl font-semibold">{atlasBalance.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-md bg-accent p-2 text-accent-foreground">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sale rate</p>
                  <p className="text-xl font-semibold">{rate.toLocaleString()} ATLAS / SOL</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="rounded-md bg-accent p-2 text-accent-foreground">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Mint</p>
                  <p className="truncate text-sm font-mono">{ATLAS_MINT.slice(0, 8)}…</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <Tabs defaultValue="faucet">
            <TabsList>
              <TabsTrigger value="faucet">Faucet</TabsTrigger>
              <TabsTrigger value="sale">Token Sale</TabsTrigger>
            </TabsList>
            <TabsContent value="faucet" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Devnet Faucet</CardTitle>
                  <CardDescription>Request free ATLAS for testing and governance participation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="faucet-amount">Amount (ATLAS)</Label>
                      <Input
                        id="faucet-amount"
                        type="number"
                        value={faucetAmount}
                        onChange={(e) => setFaucetAmount(e.target.value)}
                        placeholder={`Default: ${saleInfoQuery.data?.faucetAmount || 1000}`}
                        min="1"
                        step="1"
                      />
                    </div>
                    <Button
                      onClick={() => faucetMutation.mutate()}
                      disabled={faucetMutation.isPending}
                      className="w-full"
                    >
                      {faucetMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Gift className="mr-2 h-4 w-4" /> Request ATLAS</>}
                    </Button>
                    {saleInfoQuery.data && (
                      <p className="text-xs text-muted-foreground">
                        Cooldown: {Math.floor((saleInfoQuery.data.faucetCooldownSecs || 3600) / 60)} minutes between claims.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="sale" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Buy ATLAS with SOL</CardTitle>
                  <CardDescription>Purchase ATLAS at a fixed rate. Minimum {minSol} SOL, maximum {maxSol} SOL.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="sale-sol">SOL Amount</Label>
                      <Input
                        id="sale-sol"
                        type="number"
                        value={saleSol}
                        onChange={(e) => setSaleSol(e.target.value)}
                        placeholder={`Min ${minSol} — Max ${maxSol}`}
                        min={minSol}
                        max={maxSol}
                        step="0.01"
                      />
                    </div>
                    {estimatedAtlas > 0 && (
                      <div className="rounded-md border border-border p-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">You pay</span>
                          <span className="font-medium">{formatSol(Math.floor(Number(saleSol) * SOL_DECIMALS))} SOL</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">You receive</span>
                          <span className="font-semibold">{estimatedAtlas.toLocaleString()} ATLAS</span>
                        </div>
                      </div>
                    )}
                    <Button
                      onClick={() => saleMutation.mutate()}
                      disabled={saleMutation.isPending || !saleSol || Number(saleSol) < minSol || Number(saleSol) > maxSol}
                      className="w-full"
                    >
                      {saleMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><TrendingUp className="mr-2 h-4 w-4" /> Buy ATLAS</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
