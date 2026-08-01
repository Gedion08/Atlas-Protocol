import { describe, expect, it, vi } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  CircuitBreakerLoop,
  DryRunCircuitBreakerSubmitter,
  ManagerStatusTag,
  SET_STATUS_DISCRIMINATOR,
  SolanaCircuitBreakerSubmitter,
  buildSetStatusInstruction,
} from "../src/services/circuit-breaker/index.js";
import { managerProfilePda, registryConfigPda } from "../src/services/oracle/solana.js";
import type { ManagerProfile } from "atlas-types";

const PROGRAM_ID = new PublicKey("9h29CPwoYFgQ4wYN2oWWCyA9rS3nMYaeS99Y676zSGa8");

function profile(overrides: Partial<ManagerProfile> = {}): ManagerProfile {
  return {
    id: "mgr_quantum",
    owner: Keypair.generate().publicKey.toBase58(),
    name: "Quantum",
    status: "active",
    score: {
      feeGeneration: 80,
      risk: 20,
      drawdown: 30,
      capitalRetention: 70,
      consistency: 80,
      tvlGrowth: 60,
      governanceParticipation: 50,
      total: 70,
    },
    bondAmount: 50_000,
    tvl: 5_000_000,
    assetsUnderManagement: 5_000_000,
    pnl: 500_000,
    maxDrawdown: 0.05,
    feesGenerated: 200_000,
    poolsTraded: 12,
    protocolsUsed: ["orca", "meteora"],
    yearsActive: 3,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makePoint(managerId: string, index: number, nav: number, dailyPnl = 0) {
  return {
    managerId,
    timestamp: 1_700_000_000_000 + index * 3600_000,
    tvl: nav,
    nav,
    feesGenerated: 0,
    dailyPnl,
    maxDrawdown: 0,
    volatility: 0,
    protocolsUsed: 2,
    poolsTraded: 5,
    governanceActions: 0,
  };
}

describe("buildSetStatusInstruction", () => {
  it("encodes the set_status discriminator and the status tag", () => {
    const owner = Keypair.generate().publicKey;
    const signer = Keypair.generate().publicKey;
    const ix = buildSetStatusInstruction({
      programId: PROGRAM_ID,
      owner,
      signer,
      status: ManagerStatusTag.Suspended,
    });
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    expect([...ix.data]).toEqual([...SET_STATUS_DISCRIMINATOR, 2]);
    expect([...SET_STATUS_DISCRIMINATOR]).toHaveLength(8);
  });

  it("targets the config and manager-profile PDAs with the right writability", () => {
    const owner = Keypair.generate().publicKey;
    const signer = Keypair.generate().publicKey;
    const ix = buildSetStatusInstruction({
      programId: PROGRAM_ID,
      owner,
      signer,
      status: ManagerStatusTag.Suspended,
    });
    const [config] = registryConfigPda(PROGRAM_ID);
    const [profile] = managerProfilePda(owner, PROGRAM_ID);
    expect(ix.keys.map((k) => k.pubkey.toBase58())).toEqual([
      config.toBase58(),
      profile.toBase58(),
      signer.toBase58(),
    ]);
    expect(ix.keys[1].isWritable).toBe(true);
    expect(ix.keys[2].isSigner).toBe(true);
  });
});

describe("SolanaCircuitBreakerSubmitter", () => {
  it("deduplicates suspensions per manager and records signatures", async () => {
    const keypair = Keypair.generate();
    const connection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "8bB2XqRqbUSxCj6mZ2Z9yN8Mq7GxYwVvJbPaYpLfQhG",
      }),
    } as unknown as Connection;
    const submitter = new SolanaCircuitBreakerSubmitter({
      connection,
      signerKeypair: keypair,
    });
    const manager = profile();
    const send = vi.fn().mockResolvedValue("sig1");
    submitter["options"]["send"] = send;

    await submitter.suspend(manager);
    await submitter.suspend(manager);

    expect(send).toHaveBeenCalledTimes(1);
    expect(submitter.signatures).toEqual(["sig1"]);
    expect(submitter.sendCount).toEqual({ attempted: 1, skipped: 1 });
  });

  it("swallows send errors and reports via onError", async () => {
    const keypair = Keypair.generate();
    const connection = {
      getLatestBlockhash: vi.fn().mockRejectedValue(new Error("rpc down")),
    } as unknown as Connection;
    const onError = vi.fn();
    const submitter = new SolanaCircuitBreakerSubmitter({
      connection,
      signerKeypair: keypair,
      onError,
    });
    await submitter.suspend(profile());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(submitter.sendCount.attempted).toBe(0);
  });
});

describe("CircuitBreakerLoop", () => {
  it("suspends a manager whose NAV series breaches a critical risk limit", async () => {
    const manager = profile();
    const points = Array.from({ length: 20 }, (_, i) =>
      makePoint(manager.id, i, 100 - i * 2, -1),
    );
    const submitter = new DryRunCircuitBreakerSubmitter();
    const loop = new CircuitBreakerLoop({
      store: { metricsFor: vi.fn().mockResolvedValue(points) },
      managers: { list: vi.fn().mockResolvedValue([manager]) },
      submitter,
      intervalMs: 10_000,
    });
    await loop.runOnce();
    expect(submitter.suspended).toEqual([manager.id]);
    expect(loop.decisions.at(-1)?.action).toBe("pause");
  });

  it("does not suspend a manager with a stable NAV series", async () => {
    const manager = profile();
    const points = Array.from({ length: 20 }, (_, i) =>
      makePoint(manager.id, i, 100 + i, 0.5),
    );
    const submitter = new DryRunCircuitBreakerSubmitter();
    const loop = new CircuitBreakerLoop({
      store: { metricsFor: vi.fn().mockResolvedValue(points) },
      managers: { list: vi.fn().mockResolvedValue([manager]) },
      submitter,
    });
    await loop.runOnce();
    expect(submitter.suspended).toEqual([]);
  });

  it("ignores managers with fewer than two data points", async () => {
    const manager = profile();
    const submitter = new DryRunCircuitBreakerSubmitter();
    const loop = new CircuitBreakerLoop({
      store: { metricsFor: vi.fn().mockResolvedValue([makePoint(manager.id, 0, 100)]) },
      managers: { list: vi.fn().mockResolvedValue([manager]) },
      submitter,
    });
    await loop.runOnce();
    expect(submitter.suspended).toEqual([]);
    expect(loop.decisions).toEqual([]);
  });

  it("tolerates a failing evaluation for one manager and continues", async () => {
    const managers = [profile(), profile({ id: "mgr_apex", owner: "ApXfTvFqk2zYQe5QJn8rCbW9xM3dLgV1uHnS6tRwKaZj" })];
    const submitter = new DryRunCircuitBreakerSubmitter();
    const loop = new CircuitBreakerLoop({
      store: {
        metricsFor: vi
          .fn()
          .mockRejectedValueOnce(new Error("store down"))
          .mockResolvedValue(
            Array.from({ length: 20 }, (_, i) => makePoint("mgr_apex", i, 100 - i * 2, -1)),
          ),
      },
      managers: { list: vi.fn().mockResolvedValue(managers) },
      submitter,
    });
    await loop.runOnce();
    expect(submitter.suspended).toEqual(["mgr_apex"]);
  });

  it("start/stop schedules and cancels the interval", async () => {
    const loop = new CircuitBreakerLoop({
      store: { metricsFor: vi.fn().mockResolvedValue([]) },
      managers: { list: vi.fn().mockResolvedValue([]) },
      submitter: new DryRunCircuitBreakerSubmitter(),
      intervalMs: 5_000,
    });
    loop.start();
    expect(loop["timer"]).not.toBeNull();
    loop.stop();
    expect(loop["timer"]).toBeNull();
  });
});
