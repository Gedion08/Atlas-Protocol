"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { Coins, Wallet, Loader2, TrendingUp, Gift } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ATLAS_MINT = "7roukPrgB6rjLrJ9mqHoiCrMTjwYzT8UKbxGgtTRVtEa";
const SOL_DECIMALS = 1_000_000_000;

function formatSol(lamports: number): string {
  return (lamports / SOL_DECIMALS).toFixed(4);
}

export default function TokenPage() {
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";

  const [faucetAmount, setFaucetAmount] = useState("");
  const [saleSol, setSaleSol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const balanceQuery = useQuery({
    queryKey: ["tokenBalance", wallet],
    queryFn: () => api.tokenBalance(wallet),
    enabled: !!wallet,
  });

  const saleInfoQuery = useQuery({
    queryKey: ["tokenSaleInfo"],
    queryFn: api.tokenSaleInfo,
  });

  const faucetMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Connect your wallet first");
      const amount = Number(faucetAmount) || saleInfoQuery.data?.faucetAmount || 1000;
      return api.tokenFaucet(wallet, amount);
    },
    onSuccess: (data) => {
      setSuccess(`Faucet sent! Signature: ${data.signature.slice(0, 16)}...`);
      setFaucetAmount("");
      setError(null);
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
    onSuccess: ({ signature, data }) => {
      setSuccess(`Purchase complete! ${data.atlasAmount} ATLAS sent. Signature: ${signature.slice(0, 16)}...`);
      setSaleSol("");
      setError(null);
      balanceQuery.refetch();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Purchase failed"),
  });

  const atlasBalance = balanceQuery.data?.balance ?? 0;
  const rate = saleInfoQuery.data?.rate ?? 1000;
  const minSol = saleInfoQuery.data?.minSol ?? 0.01;
  const maxSol = saleInfoQuery.data?.maxSol ?? 10;
  const estimatedAtlas = Number(saleSol) > 0 ? Math.floor(Number(saleSol) * rate) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">ATLAS Token</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Get ATLAS for governance and staking. Use the faucet for free devnet tokens or purchase ATLAS with SOL.
        </p>
      </div>

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

      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}
      {success && <Card><CardContent className="p-4 text-sm text-green-600">{success}</CardContent></Card>}

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
              {!connected ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Wallet className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Connect your wallet to request ATLAS.</p>
                </div>
              ) : (
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
              )}
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
              {!connected ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Wallet className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Connect your wallet to purchase ATLAS.</p>
                </div>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
