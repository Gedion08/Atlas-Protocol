import { describe, expect, it } from "vitest";
import { allocate, computeRawWeight, reallocationNeeded } from "../src/services/allocation/index.js";
import type { ManagerAllocationInput } from "atlas-types";

function input(overrides: Partial<ManagerAllocationInput> = {}): ManagerAllocationInput {
  return {
    id: "mgr_a",
    riskScore: 20,
    managerScore: 80,
    tvl: 10_000_000,
    feeEfficiency: 0.7,
    sharpe: 1.8,
    impermanentLoss: 0.02,
    volatility: 25,
    consistency: 80,
    utilization: 0.8,
    ageDays: 365,
    ...overrides,
  };
}

describe("allocate", () => {
  it("keeps a cash reserve", () => {
    const result = allocate([input({ id: "mgr_a" })], 1_000_000);
    expect(result.cashReserve).toBeGreaterThanOrEqual(0.1);
    expect(result.cashAmount).toBeGreaterThan(0);
  });

  it("allocates more to better managers", () => {
    const result = allocate(
      [
        input({ id: "mgr_strong", managerScore: 95, riskScore: 5 }),
        input({ id: "mgr_mid_1", managerScore: 70, riskScore: 30 }),
        input({ id: "mgr_mid_2", managerScore: 70, riskScore: 30 }),
        input({ id: "mgr_mid_3", managerScore: 70, riskScore: 30 }),
        input({ id: "mgr_weak", managerScore: 30, riskScore: 90 }),
      ],
      1_000_000,
    );
    const strong = result.shares.find((s) => s.managerId === "mgr_strong")!;
    const mid = result.shares.find((s) => s.managerId === "mgr_mid_1")!;
    const weak = result.shares.find((s) => s.managerId === "mgr_weak")!;
    expect(strong.share).toBeGreaterThan(mid.share);
    expect(mid.share).toBeGreaterThan(weak.share);
  });

  it("caps allocation per manager and keeps excess as reserve", () => {
    const result = allocate(
      [
        input({ id: "mgr_a" }),
        input({ id: "mgr_b" }),
        input({ id: "mgr_c", managerScore: 95, riskScore: 5 }),
      ],
      1_000_000,
    );
    for (const share of result.shares) {
      expect(share.share).toBeLessThanOrEqual(0.3);
    }
    expect(result.cashReserve).toBeGreaterThanOrEqual(0.1);
  });

  it("normalizes shares to approximately 100% minus reserve", () => {
    const result = allocate(
      [input({ id: "a" }), input({ id: "b" }), input({ id: "c" })],
      1_000_000,
    );
    const sum = result.shares.reduce((acc, s) => acc + s.share, 0);
    expect(sum + result.cashReserve).toBeCloseTo(1, 1);
  });

  it("returns empty allocation for no managers", () => {
    const result = allocate([], 1_000_000);
    expect(result.shares).toEqual([]);
    expect(result.cashReserve).toBe(0.1);
  });
});

describe("computeRawWeight", () => {
  it("is zero for untracked managers", () => {
    expect(computeRawWeight(input({ tvl: 0 }))).toBeCloseTo(0, 2);
  });

  it("increases with manager score", () => {
    const low = computeRawWeight(input({ managerScore: 40 }));
    const high = computeRawWeight(input({ managerScore: 90 }));
    expect(high).toBeGreaterThan(low);
  });

  it("decreases with risk", () => {
    const low = computeRawWeight(input({ riskScore: 10 }));
    const high = computeRawWeight(input({ riskScore: 90 }));
    expect(low).toBeGreaterThan(high);
  });
});

describe("reallocationNeeded", () => {
  it("detects drift beyond threshold", () => {
    const previous = allocate(
      [
        input({ id: "a", managerScore: 90, riskScore: 10 }),
        input({ id: "b", managerScore: 40, riskScore: 70 }),
        input({ id: "c", managerScore: 40, riskScore: 70 }),
        input({ id: "d", managerScore: 40, riskScore: 70 }),
      ],
      1_000_000,
    );
    const current = [
      input({ id: "a", managerScore: 20, riskScore: 90 }),
      input({ id: "b", managerScore: 90, riskScore: 10 }),
      input({ id: "c", managerScore: 40, riskScore: 70 }),
      input({ id: "d", managerScore: 40, riskScore: 70 }),
    ];
    expect(reallocationNeeded(previous, current, 0.05)).toBe(true);
  });

  it("returns false when nothing changed", () => {
    const inputs = [
      input({ id: "a", managerScore: 90, riskScore: 10 }),
      input({ id: "b", managerScore: 60, riskScore: 50 }),
    ];
    const previous = allocate(inputs, 1_000_000);
    expect(reallocationNeeded(previous, inputs, 0.05)).toBe(false);
  });
});
