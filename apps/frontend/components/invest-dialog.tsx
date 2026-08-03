"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import type { DepositInput, InvestorPosition, Vault, WithdrawInput } from "atlas-types";
import { api } from "@/lib/api";
import { bs58Encode, formatBps, formatNumber, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
  const { wallets, select, connect, connected, publicKey, signMessage } = useWallet();
  const [amount, setAmount] = useState("");
  const [shares, setShares] = useState("");

  const sharePrice =
    vault.sharesOutstanding > 0 ? vault.tvl / vault.sharesOutstanding : 1;
  const owner = publicKey?.toBase58() ?? "";

  const parsedAmount = Number(amount);
  const parsedShares = Number(shares);
  const previewShares = Number.isFinite(parsedAmount) ? parsedAmount / sharePrice : 0;
  const maxShares = position?.shares ?? 0;
  const redeemShares = Number.isFinite(parsedShares)
    ? Math.min(parsedShares, maxShares)
    : 0;
  const previewProceeds = redeemShares * sharePrice;

  const canSign = connected && owner !== "" && typeof signMessage === "function";
  const validAmount = mode === "deposit" && parsedAmount >= vault.minDeposit;
  const validShares = mode === "withdraw" && parsedShares > 0 && parsedShares <= maxShares;
  const canSubmit =
    canSign && (mode === "deposit" ? validAmount : validShares);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!canSign || !signMessage) throw new Error("Wallet cannot sign messages");
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
      return mode === "deposit"
        ? api.deposit(vault.address, payload as DepositInput, auth)
        : api.withdraw(vault.address, payload as WithdrawInput, auth);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vaults"] });
      queryClient.invalidateQueries({ queryKey: ["investor", owner] });
      queryClient.invalidateQueries({ queryKey: ["positions", owner] });
      onSuccess?.();
      setTimeout(() => {
        onOpenChange(false);
        setAmount("");
        setShares("");
      }, 1_800);
    },
  });

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={mode === "deposit" ? `Invest in ${vault.name}` : `Withdraw from ${vault.name}`}
      description={`${vault.baseAsset} vault · ${formatBps(vault.managementFeeBps)} mgmt / ${formatBps(vault.performanceFeeBps)} perf`}
    >
      {!connected ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect a wallet to sign your deposit and mint vault shares.
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
                {mode === "deposit" ? `Amount (${vault.baseAsset})` : `Shares to redeem`}
              </span>
              {mode === "withdraw" && (
                <span className="text-muted-foreground">
                  Balance {formatNumber(position?.shares ?? 0, 6)}
                </span>
              )}
            </div>
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
          </div>

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

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={mutation.isPending || !canSubmit}
            >
              {mutation.isPending
                ? "Signing…"
                : mode === "deposit"
                  ? "Sign & Deposit"
                  : "Sign & Withdraw"}
            </Button>
            {mode === "deposit" && !validAmount && amount !== "" && (
              <Badge variant="destructive">
                Min {vault.minDeposit} {vault.baseAsset}
              </Badge>
            )}
          </div>

          {!canSign && (
            <p className="text-xs text-muted-foreground">
              This wallet adapter cannot sign messages. Try a different wallet.
            </p>
          )}
          {mutation.isError && (
            <Badge variant="destructive">{mutation.error.message}</Badge>
          )}
          {mutation.isSuccess && (
            <Badge variant="positive">
              {mode === "deposit"
                ? `Deposited ${formatNumber(previewShares, 6)} shares`
                : `Withdrew ${formatUsd(previewProceeds)}`}
            </Badge>
          )}
        </form>
      )}
    </Dialog>
  );
}
