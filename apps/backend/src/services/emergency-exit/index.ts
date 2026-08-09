import type { Vault } from "atlas-types";
import { buildEmergencyExitTransaction, VAULT_PROGRAM_ID } from "../vault/solana.js";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { withRetry } from "../../utils/retry.js";

export interface EmergencyExitResult {
  vaultAddress: string;
  triggered: boolean;
  signature?: string;
  error?: string;
}

export interface UnwindResult {
  vaultAddress: string;
  emergencyTriggered: boolean;
  redemptionCount: number;
  totalSharesSettled: number;
  signatures: string[];
  errors: string[];
}

export class EmergencyExitService {
  constructor(
    private readonly connection: Connection,
    private readonly governanceKeypair: Keypair,
    private readonly programId: PublicKey = VAULT_PROGRAM_ID,
  ) {}

  async triggerEmergencyExit(vault: Vault): Promise<EmergencyExitResult> {
    if (!vault.onchain) {
      return { vaultAddress: vault.address, triggered: false, error: "Vault has no on-chain metadata" };
    }

    try {
      const tx = await buildEmergencyExitTransaction({
        connection: this.connection,
        programId: this.programId,
        meta: vault.onchain,
        authority: this.governanceKeypair.publicKey,
      });

      const signature = await withRetry(
        () =>
          sendAndConfirmTransaction(
            this.connection,
            tx.transaction,
            [this.governanceKeypair],
            { commitment: "confirmed" },
          ),
        { attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 },
      );

      return { vaultAddress: vault.address, triggered: true, signature };
    } catch (err) {
      return {
        vaultAddress: vault.address,
        triggered: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async unwindVault(
    vault: Vault,
    positions: { investor: string; pendingShares: number }[],
  ): Promise<UnwindResult> {
    const exitResult = await this.triggerEmergencyExit(vault);
    const signatures: string[] = [];
    const errors: string[] = [];

    if (exitResult.signature) {
      signatures.push(exitResult.signature);
    }
    if (exitResult.error) {
      errors.push(exitResult.error);
    }

    let totalSharesSettled = 0;
    for (const pos of positions) {
      if (pos.pendingShares <= 0) continue;
      try {
        const result = await this.settleWithdraw(vault, pos.investor, pos.pendingShares);
        if (result.signature) {
          signatures.push(result.signature);
          totalSharesSettled += pos.pendingShares;
        }
        if (result.error) {
          errors.push(result.error);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Settlement failed");
      }
    }

    return {
      vaultAddress: vault.address,
      emergencyTriggered: exitResult.triggered,
      redemptionCount: positions.filter((p) => p.pendingShares > 0).length,
      totalSharesSettled,
      signatures,
      errors,
    };
  }

  private async settleWithdraw(
    vault: Vault,
    investor: string,
    _shares: number,
  ): Promise<{ signature?: string; error?: string }> {
    if (!vault.onchain) {
      return { error: "Missing on-chain metadata" };
    }

    try {
      const userPubkey = new PublicKey(investor);
      const { buildSettleWithdrawTransaction } = await import("../vault/solana.js");
      const tx = await buildSettleWithdrawTransaction({
        connection: this.connection,
        programId: this.programId,
        meta: vault.onchain,
        user: userPubkey,
      });

      tx.transaction.feePayer = this.governanceKeypair.publicKey;
      tx.transaction.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;

      const signature = await withRetry(
        () =>
          sendAndConfirmTransaction(
            this.connection,
            tx.transaction,
            [this.governanceKeypair],
            { commitment: "confirmed" },
          ),
        { attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 },
      );

      return { signature };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Settlement failed" };
    }
  }
}
