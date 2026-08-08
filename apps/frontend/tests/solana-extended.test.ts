import { describe, expect, it } from "vitest";
import { base64ToBytes, toBaseUnits } from "@/lib/solana";

describe("base64ToBytes", () => {
  it("decodes base64 correctly", () => {
    const bytes = base64ToBytes("aGVsbG8=");
    expect([...bytes]).toEqual([104, 101, 108, 108, 111]);
  });

  it("handles empty string", () => {
    const bytes = base64ToBytes("");
    expect(bytes.length).toBe(0);
  });
});

describe("toBaseUnits", () => {
  it("converts display amounts to base units", () => {
    expect(toBaseUnits(1.5, 6)).toBe(1_500_000);
    expect(toBaseUnits(0.01, 9)).toBe(10_000_000);
  });

  it("rounds fractional results", () => {
    expect(toBaseUnits(0.123456789, 6)).toBe(123_457);
  });

  it("handles zero", () => {
    expect(toBaseUnits(0, 6)).toBe(0);
  });
});
