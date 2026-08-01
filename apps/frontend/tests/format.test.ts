import { describe, expect, it } from "vitest";
import { formatApy, formatAddress, formatPct, formatUsd } from "@/lib/format";

describe("formatUsd", () => {
  it("formats billions, millions and thousands", () => {
    expect(formatUsd(2_500_000_000)).toBe("$2.50B");
    expect(formatUsd(12_400_000)).toBe("$12.40M");
    expect(formatUsd(850_000)).toBe("$850.0K");
    expect(formatUsd(99.5)).toBe("$99.50");
  });
});

describe("formatPct", () => {
  it("converts decimals to percentages", () => {
    expect(formatPct(0.15)).toBe("15.0%");
    expect(formatPct(0.0325, 2)).toBe("3.25%");
  });
});

describe("formatApy", () => {
  it("keeps one decimal", () => {
    expect(formatApy(17.55)).toBe("17.6%");
  });
});

describe("formatAddress", () => {
  it("shortens addresses", () => {
    expect(formatAddress("ABCDEFGHIJKLMNOP")).toBe("ABCD…MNOP");
  });
});
