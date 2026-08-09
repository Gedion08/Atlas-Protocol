import { beforeEach, describe, expect, it, vi } from "vitest";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import {
  buildSetScoreInstruction,
  clampScore,
  encodeScoreInput,
  managerProfilePda,
  REGISTRY_PROGRAM_ID,
  registryConfigPda,
  SET_SCORE_DISCRIMINATOR,
  SolanaSubmitter,
} from "../src/services/oracle/solana.js";
import type { OracleSubmission } from "../src/services/oracle/index.js";

const sendTx = vi.hoisted(() =>
  vi.fn(async (_connection: unknown, _tx: Transaction, _signers: unknown[]) => "fake-signature"),
);
vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  return { ...actual, sendAndConfirmTransaction: sendTx };
});

const owner = Keypair.generate();
const oracle = Keypair.generate();

const submission: OracleSubmission = {
  managerId: owner.publicKey.toBase58(),
  score: {
    total: 55,
    breakdown: {
      feeGeneration: 60.4,
      risk: 10.5,
      drawdown: 5,
      capitalRetention: 95,
      consistency: 80,
      tvlGrowth: 50,
      governanceParticipation: 40,
    },
    weights: {
      feeGeneration: 0.2,
      risk: 0.2,
      drawdown: 0.15,
      capitalRetention: 0.1,
      consistency: 0.15,
      tvlGrowth: 0.1,
      governanceParticipation: 0.1,
    },
  },
  riskTier: 3,
  action: "ok",
  period: "2026-07-31",
  submittedAt: 0,
};

const connection = {
  getLatestBlockhash: async () => ({ blockhash: "fake-blockhash", lastValidBlockHeight: 1 }),
} as unknown as Connection;

describe("set_score instruction encoding", () => {
  it("has the anchor discriminator for global:set_score", () => {
    const expected = new Uint8Array([
      0xda, 0xa7, 0x19, 0x79, 0xd0, 0xbe, 0x08, 0x57,
    ]);
    expect(Array.from(SET_SCORE_DISCRIMINATOR)).toEqual(Array.from(expected));
  });

  it("clamps and rounds components to u8 range", () => {
    expect(clampScore(101)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(60.4)).toBe(60);
  });

  it("encodes the seven components in borsh order", () => {
    const encoded = encodeScoreInput(submission.score);
    expect(Array.from(encoded)).toEqual([60, 11, 5, 95, 80, 50, 40]);
  });

  it("targets the config and manager profile PDAs", () => {
    const instruction = buildSetScoreInstruction({
      programId: REGISTRY_PROGRAM_ID,
      owner: owner.publicKey,
      oracle: oracle.publicKey,
      score: submission.score,
    });
    const [config] = registryConfigPda(REGISTRY_PROGRAM_ID);
    const [profile] = managerProfilePda(owner.publicKey, REGISTRY_PROGRAM_ID);
    expect(instruction.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      profile.toBase58(),
      oracle.publicKey.toBase58(),
    ]);
    expect(instruction.keys[1].isWritable).toBe(true);
    expect(instruction.keys[2].isSigner).toBe(true);
    expect(instruction.data.subarray(0, 8)).toEqual(Buffer.from(SET_SCORE_DISCRIMINATOR));
  });
});

describe("SolanaSubmitter", () => {
  beforeEach(() => {
    sendTx.mockClear();
  });

  it("sends the set_score transaction and records the signature", async () => {
    const submitter = new SolanaSubmitter({ connection, oracleKeypair: oracle });
    await submitter.submit(submission);

    expect(sendTx).toHaveBeenCalledTimes(1);
    const tx = sendTx.mock.calls[0][1] as Transaction;
    expect(tx.instructions).toHaveLength(1);
    expect(tx.feePayer!.equals(oracle.publicKey)).toBe(true);
    expect(submitter.signatures).toEqual(["fake-signature"]);
    expect(submitter.sendCount).toEqual({ attempted: 1, skipped: 0 });
  });

  it("skips unchanged scores and re-sends after a change", async () => {
    const submitter = new SolanaSubmitter({ connection, oracleKeypair: oracle });
    await submitter.submit(submission);
    await submitter.submit(submission);
    expect(sendTx).toHaveBeenCalledTimes(1);
    expect(submitter.sendCount.skipped).toBe(1);

    await submitter.submit({
      ...submission,
      score: { ...submission.score, breakdown: { ...submission.score.breakdown, risk: 20 } },
    });
    expect(sendTx).toHaveBeenCalledTimes(2);
    expect(submitter.sendCount.attempted).toBe(2);
  });

  it("surfaces send errors via onError without throwing", async () => {
    const onError = vi.fn();
    const failingConnection = {
      getLatestBlockhash: async () => {
        throw new Error("rpc down");
      },
    } as unknown as Connection;
    const submitter = new SolanaSubmitter({
      connection: failingConnection,
      oracleKeypair: oracle,
      onError,
    });
    await expect(submitter.submit(submission)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(submitter.sendCount.attempted).toBe(0);
  });
});
