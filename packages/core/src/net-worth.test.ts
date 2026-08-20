import { describe, expect, it } from "vitest";
import { computeNetWorth } from "./net-worth.js";

describe("computeNetWorth", () => {
  it("is liquid + invested minus liabilities", () => {
    const snap = computeNetWorth([
      { balanceUsd: 1000, kind: "checking" },
      { balanceUsd: 500, kind: "savings" },
      { balanceUsd: 2000, kind: "brokerage" },
      { balanceUsd: 300, kind: "credit" },
      { balanceUsd: 700, kind: "loan" },
    ]);
    expect(snap.liquidUsd).toBe(1500);
    expect(snap.investedUsd).toBe(2000);
    expect(snap.assetsUsd).toBe(3500);
    expect(snap.otherAssetsUsd).toBe(0);
    expect(snap.unvaluedAssetCount).toBe(0);
    expect(snap.householdAssetCount).toBe(0);
    expect(snap.liabilitiesUsd).toBe(1000);
    expect(snap.netWorthUsd).toBe(2500);
    expect(snap.hasLiabilities).toBe(true);
  });

  it("can be negative when only liabilities exist (negative space)", () => {
    const snap = computeNetWorth([{ balanceUsd: 400, kind: "credit" }]);
    expect(snap.assetsUsd).toBe(0);
    expect(snap.liabilitiesUsd).toBe(400);
    expect(snap.netWorthUsd).toBe(-400);
    expect(snap.hasLiabilities).toBe(true);
  });

  it("adds valued household assets and omits unvalued estimates (negative)", () => {
    const snap = computeNetWorth([{ balanceUsd: 100, kind: "checking" }], [
      { estimatedUsd: 50 },
      { estimatedUsd: null },
    ]);
    expect(snap.otherAssetsUsd).toBe(50);
    expect(snap.unvaluedAssetCount).toBe(1);
    expect(snap.householdAssetCount).toBe(2);
    expect(snap.assetsUsd).toBe(150);
    expect(snap.netWorthUsd).toBe(150);
  });

  it("treats empty household as zero with no liabilities (negative)", () => {
    const snap = computeNetWorth([]);
    expect(snap).toEqual({
      liquidUsd: 0,
      investedUsd: 0,
      otherAssetsUsd: 0,
      unvaluedAssetCount: 0,
      householdAssetCount: 0,
      assetsUsd: 0,
      liabilitiesUsd: 0,
      netWorthUsd: 0,
      hasLiabilities: false,
    });
  });
});
