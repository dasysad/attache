import { describe, expect, it } from "vitest";
import { fundingKindFromPlaid, mapPlaidAccountKind } from "./kind-map.js";

describe("mapPlaidAccountKind", () => {
  it("maps savings-like subtypes to savings", () => {
    expect(mapPlaidAccountKind("savings")).toBe("savings");
    expect(mapPlaidAccountKind("money market")).toBe("savings");
    expect(mapPlaidAccountKind("cd")).toBe("savings");
    expect(mapPlaidAccountKind("hsa")).toBe("savings");
  });

  it("maps checking-like subtypes to checking", () => {
    expect(mapPlaidAccountKind("checking")).toBe("checking");
    expect(mapPlaidAccountKind("prepaid")).toBe("checking");
    expect(mapPlaidAccountKind("paypal")).toBe("checking");
  });

  it("maps credit, loan, and brokerage instead of collapsing to other", () => {
    expect(mapPlaidAccountKind("credit card", "credit")).toBe("credit");
    expect(mapPlaidAccountKind(null, "loan")).toBe("loan");
    expect(mapPlaidAccountKind("mortgage", "loan")).toBe("loan");
    expect(mapPlaidAccountKind("brokerage", "investment")).toBe("brokerage");
    expect(mapPlaidAccountKind("ira", "investment")).toBe("brokerage");
    expect(mapPlaidAccountKind("weird-subtype")).toBe("other");
  });

  it("defaults empty depository type to checking", () => {
    expect(mapPlaidAccountKind(null, "depository")).toBe("checking");
    expect(mapPlaidAccountKind(undefined, undefined)).toBe("other");
  });
});

describe("fundingKindFromPlaid", () => {
  it("collapses other → checking; keeps first-class kinds", () => {
    expect(fundingKindFromPlaid("other")).toBe("checking");
    expect(fundingKindFromPlaid("savings")).toBe("savings");
    expect(fundingKindFromPlaid("credit")).toBe("credit");
    expect(fundingKindFromPlaid("brokerage")).toBe("brokerage");
    expect(fundingKindFromPlaid("loan")).toBe("loan");
  });
});
