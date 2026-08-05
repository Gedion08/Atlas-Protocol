import { createHash } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { OracleSubmission, OracleSubmitter } from "./index.js";
import { withRetry } from "../../utils/retry.js";

/** on-chain atlas-manager-registry program id (deployed on devnet). */
export const REGISTRY_PROGRAM_ID = new PublicKey(
  "CgLpJydFMSrkAHLjhmEZX3pFF4M5BC8CY36ajBe2bvTs",
);

/** anchor discriminator for `set_score`: sha256("global:set_score")[..8] */
export const SET_SCORE_DISCRIMINATOR: Uint8Array = createHash("sha256")
  .update("global:set_score")
  .digest()
  .subarray(0, 8);

/** On-chain ScoreInput components are u8s; clamp and round to [0, 100]. */
export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Serializes the registry `ScoreInput` struct (borsh: seven u8 fields, no prefix). */
export function encodeScoreInput(score: OracleSubmission["score"]): Uint8Array {
  const b = score.breakdown;
  return Uint8Array.from([
    clampScore(b.feeGeneration),
    clampScore(b.risk),
    clampScore(b.drawdown),
    clampScore(b.capitalRetention),
    clampScore(b.consistency),
    clampScore(b.tvlGrowth),
    clampScore(b.governanceParticipation),
  ]);
}

export function registryConfigPda(
  programId: PublicKey = REGISTRY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("atlas_registry_config")], programId);
}

export function managerProfilePda(
  owner: PublicKey,
  programId: PublicKey = REGISTRY_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("manager"), owner.toBuffer()], programId);
}

export function buildSetScoreInstruction(args: {
  programId: PublicKey;
  owner: PublicKey;
  oracle: PublicKey;
  score: OracleSubmission["score"];
}): TransactionInstruction {
  const [config] = registryConfigPda(args.programId);
  const [profile] = managerProfilePda(args.owner, args.programId);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: profile, isSigner: false, isWritable: true },
      { pubkey: args.oracle, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([SET_SCORE_DISCRIMINATOR, encodeScoreInput(args.score)]),
  });
}

export interface SolanaSubmitterOptions {
  connection: Connection;
  oracleKeypair: Keypair;
  programId?: PublicKey;
  onError?: (err: unknown) => void;
}

/**
 * Relays oracle submissions on-chain via the registry's `set_score` instruction
 * (spec §3.3). `managerId` must be the manager's wallet public key (base58) that
 * their on-chain profile is seeded with. Submissions whose encoded score is
 * unchanged are skipped; the on-chain auto-suspend already fired on the first send.
 */
export class SolanaSubmitter implements OracleSubmitter {
  private readonly programId: PublicKey;
  private readonly onError: (err: unknown) => void;
  private readonly lastSent = new Map<string, string>();
  readonly signatures: string[] = [];
  readonly sendCount = { attempted: 0, skipped: 0 };

  constructor(private readonly options: SolanaSubmitterOptions) {
    this.programId = options.programId ?? REGISTRY_PROGRAM_ID;
    this.onError = options.onError ?? ((err) => console.error("oracle submitter error", err));
  }

  async submit(submission: OracleSubmission): Promise<void> {
    const dataKey = Buffer.from(encodeScoreInput(submission.score)).toString("hex");
    if (this.lastSent.get(submission.managerId) === dataKey) {
      this.sendCount.skipped += 1;
      return;
    }
    try {
      const instruction = buildSetScoreInstruction({
        programId: this.programId,
        owner: new PublicKey(submission.managerId),
        oracle: this.options.oracleKeypair.publicKey,
        score: submission.score,
      });
      const transaction = new Transaction().add(instruction);
      transaction.feePayer = this.options.oracleKeypair.publicKey;
      transaction.recentBlockhash = (
        await this.options.connection.getLatestBlockhash()
      ).blockhash;
      const signature = await withRetry(
        () =>
          sendAndConfirmTransaction(
            this.options.connection,
            transaction,
            [this.options.oracleKeypair],
            { commitment: "confirmed" },
          ),
        { attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 },
      );
      this.lastSent.set(submission.managerId, dataKey);
      this.signatures.push(signature);
      this.sendCount.attempted += 1;
    } catch (err) {
      this.onError(err);
    }
  }
}
