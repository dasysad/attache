/**
 * CEL when guards — syntax + snapshot eval (ADR-017 P1).
 */
import { describe, expect, it } from "vitest";
import {
  assertValidWhenCel,
  evaluateWhenCel,
  TransferRuleCelError,
} from "./transfer-rule-cel.js";

const snap = {
  liquidBalanceUsd: 5000,
  runwayDays: 30,
  dueIn7dUsd: 200,
  fromBalanceUsd: 5000,
  toBalanceUsd: 100,
  amountUsd: 200,
};

describe("transfer-rule-cel", () => {
  it("rejects empty and === (negative)", () => {
    expect(() => assertValidWhenCel("")).toThrow(TransferRuleCelError);
    expect(() => assertValidWhenCel("a === 1")).toThrow(/==/);
  });

  it("rejects invalid syntax (negative)", () => {
    expect(() => assertValidWhenCel("liquidBalanceUsd >=")).toThrow(
      /invalid whenCel/,
    );
  });

  it("evaluates bool expressions against snapshot", () => {
    expect(evaluateWhenCel(null, snap)).toBe(true);
    expect(evaluateWhenCel("liquidBalanceUsd >= 1000.0", snap)).toBe(true);
    expect(
      evaluateWhenCel(
        "liquidBalanceUsd >= 1000.0 && runwayDays > 14",
        snap,
      ),
    ).toBe(true);
    expect(evaluateWhenCel("liquidBalanceUsd < 100.0", snap)).toBe(false);
  });

  it("rejects non-bool result (negative)", () => {
    expect(() => evaluateWhenCel("liquidBalanceUsd", snap)).toThrow(
      /bool/,
    );
  });
});
