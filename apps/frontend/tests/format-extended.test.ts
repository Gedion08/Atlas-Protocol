import { describe, expect, it } from "vitest";
import { formatUsd, formatPct, formatAddress, formatBps, formatCompact, formatNumber } from "@/lib/format";

describe("formatUsd", () => {
  it("formats billions", () => {
    expect(formatUsd(2_500_000_000)).toBe("$2.50B");
  });

  it("formats millions", () => {
    expect(formatUsd(12_400_000)).toBe("$12.40M");
  });

  it("formats thousands", () => {
    expect(formatUsd(850_000)).toBe("$850.0K");
  });

  it("formats sub-thousand", () => {
    expect(formatUsd(99.5)).toBe("$99.50");
  });

  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatPct", () => {
  it("converts decimals to percentages", () => {
    expect(formatPct(0.15)).toBe("15.0%");
    expect(formatPct(0.0325, 2)).toBe("3.25%");
  });

  it("handles zero", () => {
    expect(formatPct(0)).toBe("0.0%");
  });
});

describe("formatAddress", () => {
  it("shortens long addresses", () => {
    expect(formatAddress("ABCDEFGHIJKLMNOP")).toBe("ABCD…MNOP");
  });

  it("handles short strings without error", () => {
    expect(formatAddress("ABC")).toBe("ABC…ABC");
  });
});

describe("formatBps", () => {
  it("converts basis points to percentage", () => {
    expect(formatBps(100)).toBe("1.00%");
    expect(formatBps(50)).toBe("0.50%");
  });
});

describe("formatCompact", () => {
  it("formats large absolute values", () => {
    expect(formatCompact(2_500_000_000)).toBe("2.50B");
    expect(formatCompact(-1_500_000)).toBe("-1.50M");
  });
});

describe("formatNumber", () => {
  it("formats with locale", () => {
    expect(formatNumber(1234.567)).toBe("1,234.57");
    expect(formatNumber(1000, 0)).toBe("1,000");
  });
});
