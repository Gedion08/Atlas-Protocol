"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/error-state";

const STEPS = ["Connect", "Bond", "Register", "Complete"] as const;

export default function OnboardPage() {
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<(typeof STEPS)[number]>("Connect");
  const [managerName, setManagerName] = useState("");
  const [bondAmount, setBondAmount] = useState("1000");
  const [error, setError] = useState<string | null>(null);

  const wallet = publicKey?.toBase58() ?? "";

  const bondStatusQuery = useQuery({
    queryKey: ["bondStatus", wallet],
    queryFn: () => api.stakingBondStatus(wallet),
    enabled: !!wallet && step === "Bond",
  });

  const bondMutation = useMutation({
    mutationFn: () => api.stakingBond(wallet, Number(bondAmount)),
    onSuccess: async (data) => {
      if (!signTransaction || !sendTransaction) {
        setError("Wallet does not support signing transactions.");
        return;
      }
      try {
        const txBuffer = Buffer.from(data.transaction, "base64");
        const transaction = Transaction.from(txBuffer);
        const signed = await signTransaction(transaction);
        const connection = new Connection("https://api.devnet.solana.com");
        await sendTransaction(signed, connection);
        setError(null);
        setStep("Register");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bond transaction failed");
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Bond failed"),
  });

  const registerMutation = useMutation({
    mutationFn: () => api.managers(),
    onSuccess: () => {
      setStep("Complete");
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      queryClient.invalidateQueries({ queryKey: ["bondStatus", wallet] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Registration failed"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Become a Manager</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bond ATLAS, register your profile, and start allocating capital.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${step === s ? "bg-primary" : STEPS.indexOf(step) > STEPS.indexOf(s) ? "bg-positive" : "bg-muted"}`} />
            <span className={`text-xs ${step === s ? "font-medium" : "text-muted-foreground"}`}>{s}</span>
            {s !== STEPS[STEPS.length - 1] && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {error && <Card><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>}

      {step === "Connect" && (
        <Card>
          <CardHeader>
            <CardTitle>Connect your wallet</CardTitle>
            <CardDescription>You need a Solana wallet to bond ATLAS and register.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connected ? (
              <div className="space-y-2">
                <p className="text-sm">Connected: {wallet.slice(0, 8)}...{wallet.slice(-8)}</p>
                <Button onClick={() => setStep("Bond")}>Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Please connect your wallet using the button in the header.</p>
            )}
          </CardContent>
        </Card>
      )}

      {step === "Bond" && (
        <Card>
          <CardHeader>
            <CardTitle>Bond ATLAS</CardTitle>
            <CardDescription>Lock ATLAS tokens as a performance bond. This can be slashed for misconduct.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bondStatusQuery.isLoading && <p className="text-sm text-muted-foreground">Checking bond status...</p>}
            {bondStatusQuery.isError && <ErrorState message="Failed to check bond status." onRetry={() => bondStatusQuery.refetch()} />}
            {bondStatusQuery.data?.exists && (
              <div className="flex items-center gap-2">
                <Badge variant="positive">Bond Active</Badge>
                <span className="text-sm text-muted-foreground">Bond PDA: {bondStatusQuery.data.address?.slice(0, 8)}...</span>
              </div>
            )}
            {!bondStatusQuery.data?.exists && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="amount">Bond Amount (ATLAS)</Label>
                  <Input id="amount" type="number" value={bondAmount} onChange={(e) => setBondAmount(e.target.value)} min="1000" step="1000" />
                </div>
                <Button onClick={() => bondMutation.mutate()} disabled={bondMutation.isPending || Number(bondAmount) < 1000}>
                  {bondMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Bonding...</> : "Bond ATLAS"}
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setStep("Register")} disabled={!bondStatusQuery.data?.exists && !bondMutation.isSuccess}>
              Skip (already bonded) <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "Register" && (
        <Card>
          <CardHeader>
            <CardTitle>Register as Manager</CardTitle>
            <CardDescription>Create your on-chain manager profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Manager Name</Label>
              <Input id="name" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="e.g. Quantum Capital" maxLength={64} />
            </div>
            <Button onClick={() => registerMutation.mutate()} disabled={registerMutation.isPending || !managerName.trim()}>
              {registerMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering...</> : "Register Manager"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "Complete" && (
        <Card>
          <CardHeader>
            <CardTitle>You're all set!</CardTitle>
            <CardDescription>Your manager profile is now active.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant="positive">Active</Badge>
            <p className="text-sm text-muted-foreground">You can now create strategies and receive allocations.</p>
            <Button asChild><Link href="/strategies">Go to Strategies</Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
