import { describe, expect, it } from "vitest";
import {
  formatMoneyCents,
  formatMoneyUsd,
  formatShortDate,
} from "./format-money.js";

describe("formatMoneyUsd", () => {
  it("formats positive amounts without a plus in auto mode", () => {
    expect(formatMoneyUsd(1234.5)).toBe("$1,234.50");
  });

  it("prefixes outflows with a minus sign", () => {
    expect(formatMoneyUsd(-87.2)).toBe("−$87.20");
  });

  it("shows explicit plus when sign is always", () => {
    expect(formatMoneyUsd(50, { sign: "always" })).toBe("+$50.00");
    expect(formatMoneyUsd(-50, { sign: "always" })).toBe("−$50.00");
  });

  it("uses accounting parentheses for negatives", () => {
    expect(formatMoneyUsd(-12.34, { sign: "accounting" })).toBe("($12.34)");
    expect(formatMoneyUsd(12.34, { sign: "accounting" })).toBe("$12.34");
  });

  it("omits sign when sign is never", () => {
    expect(formatMoneyUsd(-9.99, { sign: "never" })).toBe("$9.99");
  });

  it("can hide cents", () => {
    expect(formatMoneyUsd(1000.99, { showCents: false })).toBe("$1,001");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatMoneyUsd(Number.NaN)).toBe("—");
    expect(formatMoneyUsd(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatMoneyCents", () => {
  it("converts integer cents to USD display", () => {
    expect(formatMoneyCents(-199)).toBe("−$1.99");
    expect(formatMoneyCents(341218)).toBe("$3,412.18");
  });
});

describe("formatShortDate", () => {
  it("formats ISO dates in short month/day form", () => {
    expect(formatShortDate("2026-06-22")).toMatch(/Jun\s+2[12]/);
  });

  it("returns em dash for invalid dates", () => {
    expect(formatShortDate("not-a-date")).toBe("—");
  });
});
