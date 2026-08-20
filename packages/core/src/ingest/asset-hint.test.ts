import { describe, expect, it } from "vitest";
import { inferAssetHint } from "./asset-hint.js";
import { isLikelyBillEmail, isLikelyPhiEmail } from "../imap/filter.js";

describe("ADR-015 P4 asset hints + PHI", () => {
  it("maps property tax to home and auto policy to vehicle", () => {
    expect(
      inferAssetHint({ payee: "County Tax Collector", rawText: "property tax bill" }),
    ).toEqual({ kind: "home", label: "County Tax Collector" });
    expect(
      inferAssetHint({ payee: "Geico", rawText: "Your auto insurance premium is due" }),
    ).toEqual({ kind: "vehicle", label: "Geico" });
  });

  it("does not treat generic insurance or a utility bill as an asset (negative)", () => {
    expect(inferAssetHint({ payee: "PG&E", rawText: "utility bill amount due" })).toBeNull();
    expect(
      inferAssetHint({ payee: "Acme Health", rawText: "health insurance premium due" }),
    ).toBeNull();
    expect(inferAssetHint({ payee: "IRS", rawText: "federal income tax" })).toBeNull();
  });

  it("never hints an asset from PHI-looking text (negative)", () => {
    expect(
      inferAssetHint({
        payee: "Blue Cross",
        rawText: "Explanation of Benefits\nPatient ID: 1\nclaim",
      }),
    ).toBeNull();
  });

  it("drops EOBs even when they say amount due (negative)", () => {
    const eob = {
      subject: "Your explanation of benefits is ready",
      from: "eob@healthplan.example",
      bodyText: "Explanation of Benefits. Amount due: $12.00",
      attachmentMimeTypes: ["application/pdf"],
    };
    expect(isLikelyPhiEmail(eob)).toBe(true);
    expect(isLikelyBillEmail(eob)).toBe(false);
  });
});
