"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { DepositInput, InvestorPosition, Vault, WithdrawInput } from "atlas-types";
import { api, type InvestAction } from "@/lib/api";
import { bs58Encode, formatBps, formatNumber, formatUsd } from "@/lib/format";
import { decodeTransaction, toBaseUnits } from "@/lib/solana";import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary";

interface InvestDialogProps {
  vault: Vault;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "deposit" | "withdraw";
  position?: InvestorPosition;
  strategyId?: string;
  onSuccess?: () => void;
}

export function InvestDialog({
  vault,
  open,
  onOpenChange,
  mode = "deposit",
  position,
  strategyId,
  onSuccess,
}: InvestDialogProps) {
  const queryClient = useQueryClient();
  const { connection } = useConnection();
  const { wallets, select, connect, connected, publicKey, signMessage, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");

  const isOnchain = Boolean(vault.onchain);
  const decimals = vault.onchain?.decimals ?? 6;
  const sharePrice =
    vault.sharePrice ??
    (vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 1);
  const owner = publicKey?.toBase58() ?? "";

  const parsedAmount = Number(amount);
  const parsedShares = Number(shares);
  const previewShares = Number.isFinite(parsedAmount) ? parsedAmount / sharePrice : 0;
  const maxShares = position?.shares ?? 0;
  const redeemShares = Number.isFinite(parsedShares)
    ? Math.min(parsedShares, maxShares)
    : 0;
  const previewProceeds = redeemShares * sharePrice;
  const canSettle = isOnchain && mode === "withdraw" && (position?.claimable ?? 0) > 0;

  const canSign =
    connected &&
    owner !== "" &&
    (isOnchain ? typeof sendTransaction === "function" : typeof signMessage === "function");
  const validAmount = mode === "deposit" && parsedAmount >= vault.minDeposit;
  const validShares = mode === "withdraw" && parsedShares > 0 && parsedShares <= maxShares;
  const canSubmit =
    canSign && (mode === "deposit" ? validAmount : validShares);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["vaults"] });
    queryClient.invalidateQueries({ queryKey: ["investor", owner] });
    queryClient.invalidateQueries({ queryKey: ["positions", owner] });
    onSuccess?.();
  };

  const signAndSend = async (action: InvestAction, amountBase?: number, sharesBase?: number) => {
    if (!isOnchain || !sendTransaction) throw new Error("Wallet cannot sign transactions");
    const built = await api.buildInvestTransaction(
      vault.address,
      { action, amount: amountBase, shares: sharesBase },
      owner,
    );
    const tx = decodeTransaction(built.transaction);
    return sendTransaction(tx, connection);
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!canSign || !signMessage) throw new Error("Wallet cannot sign messages");
      if (isOnchain) {
        const signature = await signAndSend(
          mode === "deposit" ? "deposit" : "request_withdraw",
          mode === "deposit" ? toBaseUnits(parsedAmount, decimals) : undefined,
          mode === "withdraw" ? toBaseUnits(redeemShares, 9) : undefined,
        );
        return `Confirmed ${signature.slice(0, 8)}…`;
      }
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload: DepositInput | WithdrawInput =
        mode === "deposit"
          ? { investor: owner, amount: parsedAmount, strategyId }
          : { investor: owner, shares: redeemShares };
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(payload)),
      );
      const payloadSha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const message = ["atlas.request v1", owner, nonce, payloadSha256].join("\n");
      const signature = bs58Encode(await signMessage(new TextEncoder().encode(message)));
      const auth = { owner, nonce, signature };
      if (mode === "deposit") {
        await api.deposit(vault.address, payload as DepositInput, auth);
        return `Deposited ${formatNumber(previewShares, 6)} shares`;
      }
      await api.withdraw(vault.address, payload as WithdrawInput, auth);
      return `Withdrew ${formatUsd(previewProceeds)}`;
    },
    onSuccess: (result: string) => {
      invalidate();
      setLastMessage(result);
      setTimeout(() => {
        onOpenChange(false);
        setAmount("");
        setShares("");
      }, 1_800);
    },
  });

  const settleMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      const signature = await signAndSend("settle_withdraw");
      return `Settled ${signature.slice(0, 8)}…`;
    },
    onSuccess: (result: string) => {
      invalidate();
      setLastMessage(result);
      setTimeout(() => onOpenChange(false), 1_800);
    },
  });

  const [lastMessage, setLastMessage] = useState("");

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={mode === "deposit" ? `Invest in ${vault.name}` : `Withdraw from ${vault.name}`}
      description={`${vault.baseAsset} vault · ${formatBps(vault.managementFeeBps)} mgmt / ${formatBps(vault.performanceFeeBps)} perf${isOnchain ? " · on-chain" : ""}`}
    >
      {!connected ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect a wallet to {isOnchain ? "sign and send" : "sign"} your{" "}
            {mode === "deposit" ? "deposit and mint vault shares" : "withdrawal"}.
          </p>
          {wallets.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No wallet extensions detected. Install Phantom or Solflare to continue.
            </p>
          )}
          <div className="space-y-1">
            {wallets.map((wallet) => (
              <button
                key={wallet.adapter.name}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent"
                onClick={async () => {
                  try {
                    await select(wallet.adapter.name);
                    await connect();
                  } catch {
                    alert("Wallet connection failed");
                  }
                }}
              >
                <span>{wallet.adapter.name}</span>
                <span className="text-xs text-muted-foreground">Connect</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {mode === "deposit" ? `Amount (${vault.baseAsset})` : canSettle ? "Withdrawal ready" : `Shares to redeem`}
              </span>
              {mode === "withdraw" && !canSettle && (
                <span className="text-muted-foreground">
                  Balance {formatNumber(position?.shares ?? 0, 6)}
                </span>
              )}
            </div>
            {canSettle ? (
              <p className="text-xs text-muted-foreground">
                Your withdrawal request has settled. Claim{" "}
                {formatNumber((position?.claimable ?? 0) / 10 ** decimals, 6)} {vault.baseAsset} on-chain.
              </p>
            ) : (
              <input
                type="number"
                min={mode === "deposit" ? vault.minDeposit : 0}
                step="any"
                value={mode === "deposit" ? amount : shares}
                onChange={(e) => (mode === "deposit" ? setAmount(e.target.value) : setShares(e.target.value))}
                className={inputClass}
                placeholder={mode === "deposit" ? `Min ${formatUsd(vault.minDeposit)}` : "0.000000"}
                required
              />
            )}
          </div>

          {!canSettle && (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              {mode === "deposit" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Share price</span>
                    <span>{formatUsd(sharePrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You will receive</span>
                    <span className="font-semibold">{formatNumber(previewShares, 6)} shares</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. annual yield</span>
                    <span className="text-positive">{vault.apy.toFixed(1)}% APY</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Redeem</span>
                    <span>{formatNumber(redeemShares, 6)} shares</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="font-semibold">{formatUsd(previewProceeds)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current share price</span>
                    <span>{formatUsd(sharePrice)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {isOnchain && mode === "withdraw" && !canSettle && (
            <p className="text-xs text-muted-foreground">
              Withdrawals settle after the on-chain lockup, then you claim them here.
            </p>
          )}

          <div className="flex items-center gap-3">
            {canSettle ? (
              <Button
                type="button"
                disabled={settleMutation.isPending}
                onClick={() => settleMutation.mutate()}
              >
                {settleMutation.isPending ? "Settling…" : "Settle & claim"}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={mutation.isPending || !canSubmit}
              >
                {mutation.isPending
                  ? "Confirm in wallet…"
                  : mode === "deposit"
                    ? "Sign & Deposit"
                    : isOnchain
                      ? "Sign & Request Withdrawal"
                      : "Sign & Withdraw"}
              </Button>
            )}
            {mode === "deposit" && !validAmount && amount !== "" && (
              <Badge variant="destructive">
                Min {vault.minDeposit} {vault.baseAsset}
              </Badge>
            )}
          </div>

          {!canSign && (
            <p className="text-xs text-muted-foreground">
              {isOnchain
                ? "This wallet adapter cannot sign transactions. Try a different wallet."
                : "This wallet adapter cannot sign messages. Try a different wallet."}
            </p>
          )}
          {mutation.isError && (
            <Badge variant="destructive">{(mutation.error as Error).message}</Badge>
          )}
          {settleMutation.isError && (
            <Badge variant="destructive">{(settleMutation.error as Error).message}</Badge>
          )}
          {mutation.isSuccess && (
            <Badge variant="positive">{lastMessage}</Badge>
          )}
          {settleMutation.isSuccess && (
            <Badge variant="positive">{lastMessage}</Badge>
          )}
        </form>
      )}
    </Dialog>
  );
}
