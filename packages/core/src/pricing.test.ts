import { describe, expect, it } from "vitest";
import {
  estimateMonthlyCost,
  PASS_THROUGH_RATES,
  PLATFORM_PRICING,
  PRICING_SCENARIOS,
} from "./pricing.js";

describe("estimateMonthlyCost", () => {
  it("returns zero for free manual-only tier", () => {
    const est = estimateMonthlyCost(PRICING_SCENARIOS.free.input);
    expect(est.totalUsd).toBe(0);
    expect(est.lineItems).toHaveLength(0);
  });

  it("separates platform from pass-through for typical household", () => {
    const est = estimateMonthlyCost(PRICING_SCENARIOS.typical.input);
    expect(est.platformSubtotalUsd).toBe(PLATFORM_PRICING.monthlyUsd);
    expect(est.passThroughSubtotalUsd).toBe(
      PASS_THROUGH_RATES.plaidPerAccountMonth * 3,
    );
    expect(est.totalUsd).toBeGreaterThan(7);
    expect(est.totalUsd).toBeLessThan(12);
  });

  it("includes snaptrade only when premium invest users set", () => {
    const est = estimateMonthlyCost(PRICING_SCENARIOS.premium.input);
    const snap = est.lineItems.find((l) => l.id === "snaptrade");
    expect(snap).toBeDefined();
    expect(snap!.vendor).toBe("SnapTrade");
    expect(snap!.totalUsd).toBe(2);
  });

  it("rejects negative plaid accounts", () => {
    expect(() =>
      estimateMonthlyCost({ plaidAccountCount: -1 }),
    ).toThrow();
  });

  it("marks pass-through lines as optional", () => {
    const est = estimateMonthlyCost({
      platformEnabled: true,
      plaidAccountCount: 1,
    });
    const plaid = est.lineItems.find((l) => l.id === "plaid");
    expect(plaid?.optional).toBe(true);
    expect(plaid?.category).toBe("pass_through");
  });
});
