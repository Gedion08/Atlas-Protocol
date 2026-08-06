import { Connection, PublicKey } from "@solana/web3.js";
import type { InvestorPosition, OnchainVaultMeta, Vault } from "atlas-types";
import {
  buildDepositTransaction,
  buildRequestWithdrawTransaction,
  buildSettleWithdrawTransaction,
  buildEmergencyExitTransaction,
  fetchUserPosition,
  fetchVaultState,
  SHARE_PRICE_SCALE,
  VAULT_PROGRAM_ID,
  type BuildTransactionResult,
} from "./solana.js";

export type InvestAction = "deposit" | "request_withdraw" | "settle_withdraw" | "emergency_exit";

/**
 * Read-side client over the on-chain atlas-vault program. The backend assembles
 * transactions and reads live vault/position state; the chain is the source of
 * truth for vaults that carry `onchain` metadata. Demo vaults are untouched.
 */
export class VaultClient {
  constructor(
    readonly connection: Connection,
    readonly programId: PublicKey = VAULT_PROGRAM_ID,
  ) {}

  /** Enriches a vault DTO with live on-chain state (falls back to DB on errors). */
  async enrichVault(vault: Vault): Promise<Vault> {
    if (!vault.onchain) return vault;
    try {
      const state = await fetchVaultState(this.connection, vault.onchain, this.programId);
      const status =
        state.status === 0 ? "active" : state.status === 1 ? "paused" : "emergency";
      return {
        ...vault,
        tvl: state.totalValue,
        sharesOutstanding: state.sharesOutstanding,
        status,
        minDeposit: state.minDeposit / 10 ** vault.onchain.decimals,
        sharePrice:
          state.sharePrice !== null ? state.sharePrice / SHARE_PRICE_SCALE : undefined,
      };
    } catch {
      return vault;
    }
  }

  async listVaults(vaults: Vault[]): Promise<Vault[]> {
    return Promise.all(vaults.map((v) => this.enrichVault(v)));
  }

  /** Live chain-backed positions for `wallet` across the given on-chain vaults. */
  async listPositions(wallet: string, vaults: Vault[]): Promise<InvestorPosition[]> {
    const positions: InvestorPosition[] = [];
    for (const vault of vaults) {
      if (!vault.onchain) continue;
      try {
        const pos = await fetchUserPosition(
          this.connection,
          vault.onchain,
          new PublicKey(wallet),
          this.programId,
        );
        if (pos && (pos.shares > 0 || pos.pending)) {
          const pending = pos.pending;
          positions.push({
            id: `onchain_${vault.address.slice(-10)}_${wallet.slice(-10)}`,
            investor: wallet,
            vaultAddress: vault.address,
            amount: 0,
            shares: pos.shares,
            sharePrice: 0,
            status: pending && !pending.settled ? "pending" : "active",
            createdAt: Date.now(),
            claimable: pos.claimable > 0 ? pos.claimable : undefined,
            pendingShares: pending && !pending.settled ? pending.shares : undefined,
            settlementSlot: pending && !pending.settled ? pending.settlementSlot : undefined,
          });
        }
      } catch {
        // unreachable vault — skip rather than fail the whole list
      }
    }
    return positions;
  }

  /**
   * Assembles a fee-payer=owner transaction for an invest action. The returned
   * `Transaction` is serialized and returned to the client; the wallet signs it.
   * `amount`/`shares` are in base units (value * 10^decimals).
   */
  async buildInvestTransaction(args: {
    meta: OnchainVaultMeta;
    owner: string;
    action: InvestAction;
    amount?: number;
    shares?: number;
  }): Promise<BuildTransactionResult> {
    const user = new PublicKey(args.owner);
    switch (args.action) {
      case "deposit": {
        if (!args.amount || args.amount <= 0) {
          throw new Error("amount (base units) is required for deposit");
        }
        return buildDepositTransaction({
          connection: this.connection,
          programId: this.programId,
          meta: args.meta,
          user,
          amount: args.amount,
        });
      }
      case "request_withdraw": {
        if (!args.shares || args.shares <= 0) {
          throw new Error("shares (base units) is required for request_withdraw");
        }
        return buildRequestWithdrawTransaction({
          connection: this.connection,
          programId: this.programId,
          meta: args.meta,
          user,
          shares: args.shares,
        });
      }
      case "settle_withdraw":
        return buildSettleWithdrawTransaction({
          connection: this.connection,
          programId: this.programId,
          meta: args.meta,
          user,
        });
      case "emergency_exit":
        return buildEmergencyExitTransaction({
          connection: this.connection,
          programId: this.programId,
          meta: args.meta,
          authority: user,
        });
    }
  }
}
