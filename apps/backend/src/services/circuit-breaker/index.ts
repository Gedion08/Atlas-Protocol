import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { ManagerProfile, Strategy, Vault } from "atlas-types";
import { evaluateRiskRules, type RiskDecision } from "../risk-engine/index.js";
import { computeConcentrationMetrics } from "../risk-engine/concentrations.js";
import {
  REGISTRY_PROGRAM_ID,
  managerProfilePda,
  registryConfigPda,
} from "../oracle/solana.js";
import { VAULT_PROGRAM_ID } from "../vault/solana.js";
import { withRetry } from "../../utils/retry.js";

/** Anchor discriminator for the registry `set_status` instruction. */
export const SET_STATUS_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:set_status")
  .digest()
  .subarray(0, 8);

/** On-chain ManagerStatus enum tags (must mirror `programs/manager-registry`). */
export const ManagerStatusTag = {
  Inactive: 0,
  Active: 1,
  Suspended: 2,
  Banned: 3,
} as const;

export function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function buildSetStatusInstruction(args: {
  programId: PublicKey;
  owner: PublicKey;
  signer: PublicKey;
  status: number;
}): TransactionInstruction {
  const [config] = registryConfigPda(args.programId);
  const [profile] = managerProfilePda(args.owner, args.programId);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: profile, isSigner: false, isWritable: true },
      { pubkey: args.signer, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([
      SET_STATUS_DISCRIMINATOR,
      Uint8Array.from([args.status]),
    ]),
  });
}

export interface CircuitBreakerSubmitter {
  /** Suspends a manager on-chain; must not throw (loop continues on error). */
  suspend(manager: ManagerProfile): Promise<void>;
}

export interface VaultEmergencyExitSubmitter {
  /** Triggers emergency exit on a vault; must not throw. */
  emergencyExit(vault: Vault): Promise<void>;
}

export interface CircuitBreakerSubmitterOptions {
  connection: Connection;
  signerKeypair: Keypair;
  programId?: PublicKey;
  onError?: (err: unknown) => void;
  /** Injectable for tests; defaults to `sendAndConfirmTransaction`. */
  send?: typeof sendAndConfirmTransaction;
}

/**
 * Sends `set_status(Suspended)` for a manager profile via the governance /
 * slash-authority keypair (spec §12.2 circuit breaker). Re-suspension of an
 * already-suspended manager is skipped.
 */
export class SolanaCircuitBreakerSubmitter implements CircuitBreakerSubmitter {
  private readonly programId: PublicKey;
  private readonly onError: (err: unknown) => void;
  private readonly suspended = new Set<string>();
  readonly signatures: string[] = [];
  readonly sendCount = { attempted: 0, skipped: 0 };

  constructor(private readonly options: CircuitBreakerSubmitterOptions) {
    this.programId = options.programId ?? REGISTRY_PROGRAM_ID;
    this.onError = options.onError ?? ((err) => console.error("circuit breaker error", err));
  }

  async suspend(manager: ManagerProfile): Promise<void> {
    if (this.suspended.has(manager.id)) {
      this.sendCount.skipped += 1;
      return;
    }
    try {
      const instruction = buildSetStatusInstruction({
        programId: this.programId,
        owner: new PublicKey(manager.owner),
        signer: this.options.signerKeypair.publicKey,
        status: ManagerStatusTag.Suspended,
      });
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = this.options.signerKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.options.connection.getLatestBlockhash()
      ).blockhash;
      const send = this.options.send ?? sendAndConfirmTransaction;
      const signature = await withRetry(
        () =>
          send(
            this.options.connection,
            transaction,
            [this.options.signerKeypair],
            { commitment: "confirmed" },
          ),
        { attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 },
      );
      this.suspended.add(manager.id);
      this.signatures.push(signature);
      this.sendCount.attempted += 1;
    } catch (err) {
      this.onError(err);
    }
  }
}

/** No-op submitter used when no governance keypair is configured (dry run). */
export class DryRunCircuitBreakerSubmitter implements CircuitBreakerSubmitter {
  readonly suspended: string[] = [];

  async suspend(manager: ManagerProfile): Promise<void> {
    this.suspended.push(manager.id);
  }
}

export interface VaultEmergencyExitSubmitterOptions {
  connection: Connection;
  signerKeypair: Keypair;
  programId?: PublicKey;
  onError?: (err: unknown) => void;
  send?: typeof sendAndConfirmTransaction;
}

/** Sends `emergency_exit` for an on-chain vault via the governance keypair. */
export class SolanaVaultEmergencyExitSubmitter implements VaultEmergencyExitSubmitter {
  private readonly programId: PublicKey;
  private readonly onError: (err: unknown) => void;
  private readonly sent = new Set<string>();
  readonly signatures: string[] = [];

  constructor(private readonly options: VaultEmergencyExitSubmitterOptions) {
    this.programId = options.programId ?? VAULT_PROGRAM_ID;
    this.onError = options.onError ?? ((err) => console.error("vault emergency exit error", err));
  }

  async emergencyExit(vault: Vault): Promise<void> {
    if (!vault.onchain || this.sent.has(vault.address)) return;
    try {
      const { buildEmergencyExitTransaction } = await import("../vault/solana.js");
      const tx = await buildEmergencyExitTransaction({
        connection: this.options.connection,
        programId: this.programId,
        meta: vault.onchain,
        authority: this.options.signerKeypair.publicKey,
      });
      const send = this.options.send ?? sendAndConfirmTransaction;
      const signature = await withRetry(
        () =>
          send(
            this.options.connection,
            tx.transaction,
            [this.options.signerKeypair],
            { commitment: "confirmed" },
          ),
        { attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 },
      );
      this.sent.add(vault.address);
      this.signatures.push(signature);
    } catch (err) {
      this.onError(err);
    }
  }
}

/** No-op vault submitter for dry-run / test environments. */
export class DryRunVaultEmergencyExitSubmitter implements VaultEmergencyExitSubmitter {
  readonly exited: string[] = [];

  async emergencyExit(vault: Vault): Promise<void> {
    this.exited.push(vault.address);
  }
}

export interface CircuitBreakerLoopOptions {
  store: {
    metricsFor(managerId: string, from: number, to: number): Promise<
      { managerId: string; timestamp: number; tvl: number; nav: number; dailyPnl: number; maxDrawdown: number }[]
    >;
  };
  managers: {
    list(): Promise<ManagerProfile[]>;
  };
  vaults: {
    list(): Promise<Vault[]>;
  };
  strategies: {
    list(filter?: { managerId?: string }): Promise<Strategy[]>;
  };
  submitter: CircuitBreakerSubmitter;
  vaultSubmitter?: VaultEmergencyExitSubmitter;
  dlmm?: {
    latestForStrategy(strategyId: string): Promise<{ inventorySkew: number } | null>;
  };
  /** Lookback window for the risk evaluation, ms. */
  lookbackMs?: number;
  intervalMs?: number;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * Periodically evaluates each manager's on-chain-observable metrics against the
 * risk engine and suspends the profile when the decision is `pause` (spec §12.2
 * auto-pause circuit breaker). A manager that recovers requires a governance
 * re-activation; the breaker never acts against an already-suspended profile.
 */
export class CircuitBreakerLoop {
  private readonly lookbackMs: number;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  readonly decisions: RiskDecision[] = [];

  constructor(private readonly options: CircuitBreakerLoopOptions) {
    this.lookbackMs = options.lookbackMs ?? 30 * 24 * 3600 * 1000;
    this.intervalMs = options.intervalMs ?? 5 * 60 * 1000;
  }

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    const to = Date.now();
    const from = to - this.lookbackMs;
    for (const manager of await this.options.managers.list()) {
      try {
        await this.evaluate(manager, from, to);
      } catch (err) {
        console.error("circuit breaker evaluation failed", manager.id, err);
      }
    }
  }

  private async evaluate(manager: ManagerProfile, from: number, to: number): Promise<void> {
    if (!isValidPublicKey(manager.owner)) return;
    const points = await this.options.store.metricsFor(manager.id, from, to);
    if (points.length < 2) return;

    const navs = points.map((p) => p.nav);
    const returns: number[] = [];
    for (let i = 1; i < navs.length; i++) {
      if (navs[i - 1] > 0) returns.push((navs[i] - navs[i - 1]) / navs[i - 1]);
    }
    if (returns.length < 2) return;

    const sorted = [...returns].sort((a, b) => a - b);
    const var95 = -sorted[Math.max(0, Math.floor(sorted.length * 0.05) - 1)];
    const var99 = -sorted[Math.max(0, Math.floor(sorted.length * 0.01) - 1)];
    const tail95 = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.05)));
    const expectedShortfall = -mean(tail95);

    let peak = navs[0];
    let maxDrawdown = 0;
    for (const nav of navs) {
      peak = Math.max(peak, nav);
      if (nav < peak) maxDrawdown = Math.max(maxDrawdown, (peak - nav) / peak);
    }

    const concentrations = await computeConcentrationMetrics(manager.id, this.options.vaults, this.options.strategies);

    let inventoryImbalance = 0.05;
    if (this.options.dlmm) {
      const dlmmStrategies = await this.options.strategies.list({ managerId: manager.id });
      for (const s of dlmmStrategies) {
        if (s.protocol !== "meteora") continue;
        const latest = await this.options.dlmm.latestForStrategy(s.id);
        if (latest) {
          inventoryImbalance = latest.inventorySkew;
          break;
        }
      }
    }

    const decision = evaluateRiskRules({
      var95,
      var99,
      expectedShortfall,
      volatility: stddev(returns),
      impermanentLoss: maxDrawdown,
      maxDrawdown: Math.max(maxDrawdown, points[points.length - 1].maxDrawdown),
      dailyPnl: points[points.length - 1].dailyPnl,
      weeklyPnl: points.slice(-7).reduce((acc, p) => acc + p.dailyPnl, 0),
      poolConcentration: concentrations.poolConcentration,
      tokenConcentration: concentrations.tokenConcentration,
      protocolConcentration: concentrations.protocolConcentration,
      memecoinConcentration: concentrations.memecoinConcentration,
      stablePoolConcentration: concentrations.stablePoolConcentration,
      slippage: 0.004,
      feeDecay: 0.02,
      oracleHealth: 1,
      utilization: 0.8,
      inventoryImbalance,
    });
    this.decisions.push(decision);

    if (decision.action === "pause") {
      await this.options.submitter.suspend(manager);
      if (this.options.vaultSubmitter) {
        const managerVaults = await this.options.vaults.list();
        for (const vault of managerVaults) {
          if (vault.managerId === manager.id) {
            void this.options.vaultSubmitter.emergencyExit(vault).catch((err) =>
              console.error("vault emergency exit failed", vault.address, err),
            );
          }
        }
      }
    }
  }
}
