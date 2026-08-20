/**
 * CEL guards for transfer rules (ADR-017 P1).
 *
 * What: evaluate an optional `whenCel` expression against a household snapshot.
 * Why: same grammar Starflow uses for edge conditions (ADR-048) — sandboxed,
 *      non-Turing-complete. Typed caps/accounts stay fields; CEL is only a guard.
 * How: @marcbachmann/cel-js Environment with doubles/ints only — no I/O.
 */
import { Environment } from "@marcbachmann/cel-js";

export interface TransferRuleCelSnapshot {
  liquidBalanceUsd: number;
  runwayDays: number;
  dueIn7dUsd: number;
  fromBalanceUsd: number;
  toBalanceUsd: number;
  amountUsd: number;
}

export class TransferRuleCelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferRuleCelError";
  }
}

/** Reject JS-style === at create time (Starflow does the same). */
export function assertValidWhenCel(expression: string): void {
  const trimmed = expression.trim();
  if (!trimmed) throw new TransferRuleCelError("whenCel must be non-empty");
  if (trimmed.includes("===")) {
    throw new TransferRuleCelError(
      "whenCel uses CEL equality (==), not JavaScript (===)",
    );
  }
  // Compile once to fail fast on syntax errors.
  try {
    buildEnv().evaluate(trimmed, sampleVars());
  } catch (e) {
    throw new TransferRuleCelError(
      e instanceof Error ? `invalid whenCel: ${e.message}` : "invalid whenCel",
    );
  }
}

function buildEnv(): Environment {
  return new Environment()
    .registerVariable("liquidBalanceUsd", "double")
    .registerVariable("runwayDays", "int")
    .registerVariable("dueIn7dUsd", "double")
    .registerVariable("fromBalanceUsd", "double")
    .registerVariable("toBalanceUsd", "double")
    .registerVariable("amountUsd", "double");
}

function sampleVars(): Record<string, number | bigint> {
  return {
    liquidBalanceUsd: 0,
    runwayDays: 0n,
    dueIn7dUsd: 0,
    fromBalanceUsd: 0,
    toBalanceUsd: 0,
    amountUsd: 0,
  };
}

function toCelVars(
  snapshot: TransferRuleCelSnapshot,
): Record<string, number | bigint> {
  return {
    liquidBalanceUsd: snapshot.liquidBalanceUsd,
    runwayDays: BigInt(Math.trunc(snapshot.runwayDays)),
    dueIn7dUsd: snapshot.dueIn7dUsd,
    fromBalanceUsd: snapshot.fromBalanceUsd,
    toBalanceUsd: snapshot.toBalanceUsd,
    amountUsd: snapshot.amountUsd,
  };
}

/**
 * Evaluate whenCel. Missing/blank → true (no guard).
 * Non-boolean result → error (do not fire).
 */
export function evaluateWhenCel(
  expression: string | null | undefined,
  snapshot: TransferRuleCelSnapshot,
): boolean {
  if (!expression?.trim()) return true;
  try {
    const result = buildEnv().evaluate(expression.trim(), toCelVars(snapshot));
    if (typeof result !== "boolean") {
      throw new TransferRuleCelError(
        `whenCel must evaluate to bool, got ${typeof result}`,
      );
    }
    return result;
  } catch (e) {
    if (e instanceof TransferRuleCelError) throw e;
    throw new TransferRuleCelError(
      e instanceof Error ? e.message : "whenCel evaluation failed",
    );
  }
}
