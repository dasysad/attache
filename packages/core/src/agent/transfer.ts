import type Database from "better-sqlite3";
import type { FundingAccount, SolvencyForecast } from "../domain.js";
import { listAccounts } from "../account.js";
import { listObligations } from "../obligation.js";
import { computeSolvencyForecast } from "../forecast.js";
import { isOnboarded } from "../tenant.js";
import { transferHonesty, transferHonestyWarning } from "./transfer-honesty.js";

export interface TransferProposalInput {
  fromAccountId: string;
  /** Omit for external/outbound transfer (reduces liquid balance). */
  toAccountId?: string;
  amountUsd: number;
  memo?: string;
  horizonDays?: number;
}

export interface TransferProposalResult {
  /** VS-5: never executes — dry-run only until licensed rails (v1.1). */
  dryRun: true;
  allowed: boolean;
  amountUsd: number;
  memo: string | null;
  fromAccount: {
    id: string;
    name: string;
    balanceUsd: number;
    balanceAfterUsd: number;
  };
  toAccount: {
    id: string;
    name: string;
    balanceAfterUsd: number;
  } | null;
  forecastBefore: Pick<SolvencyForecast, "liquidBalanceUsd" | "runwayDays" | "dueIn7dUsd">;
  forecastAfter: Pick<SolvencyForecast, "liquidBalanceUsd" | "runwayDays" | "dueIn7dUsd">;
  warnings: string[];
  blockers: string[];
}

/**
 * Simulate a transfer and return solvency impact — no money moves (ADR-001 / PRD v1).
 * Why: agents propose; humans approve via HITL queue (VS-5.1).
 */
export function proposeTransfer(
  db: Database.Database,
  input: TransferProposalInput,
): TransferProposalResult {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("amount must be positive");
  }

  const horizon = input.horizonDays ?? 30;
  const accounts = listAccounts(db);
  const obligations = listObligations(db);

  const from = accounts.find((a) => a.id === input.fromAccountId);
  if (!from) throw new Error("from account not found");

  const to = input.toAccountId
    ? accounts.find((a) => a.id === input.toAccountId)
    : undefined;
  if (input.toAccountId && !to) throw new Error("to account not found");
  if (to && to.id === from.id) throw new Error("from and to account must differ");

  const before = computeSolvencyForecast(accounts, obligations, horizon);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (from.balanceUsd < input.amountUsd) {
    blockers.push(
      `Insufficient balance on ${from.name}: $${from.balanceUsd.toFixed(2)} available, $${input.amountUsd.toFixed(2)} requested`,
    );
  }

  const simAccounts = simulateTransfer(accounts, from.id, to?.id, input.amountUsd);
  const after = computeSolvencyForecast(simAccounts, obligations, horizon);

  if (!to && after.liquidBalanceUsd < before.liquidBalanceUsd) {
    warnings.push("Outbound transfer reduces household liquid balance");
  }

  if (after.runwayDays < before.runwayDays) {
    warnings.push(
      `Runway decreases from ${before.runwayDays} to ${after.runwayDays} day(s) within ${horizon}d horizon`,
    );
  }

  if (after.runwayDays === 0 && before.runwayDays > 0) {
    blockers.push("Transfer would cause insolvency within forecast horizon");
  }

  if (after.dueIn7dUsd > after.liquidBalanceUsd) {
    warnings.push(
      `After transfer, liquid balance ($${after.liquidBalanceUsd.toFixed(2)}) is below due-in-7d ($${after.dueIn7dUsd.toFixed(2)})`,
    );
  }

  const honesty = transferHonesty(db, from.id, to?.id);
  const honestyWarn = transferHonestyWarning(honesty);
  if (honestyWarn) warnings.push(honestyWarn);

  const fromAfter = simAccounts.find((a) => a.id === from.id)!;
  const toAfter = to ? simAccounts.find((a) => a.id === to.id)! : null;

  return {
    dryRun: true,
    allowed: blockers.length === 0,
    amountUsd: input.amountUsd,
    memo: input.memo?.trim() || null,
    fromAccount: {
      id: from.id,
      name: from.name,
      balanceUsd: from.balanceUsd,
      balanceAfterUsd: fromAfter.balanceUsd,
    },
    toAccount: toAfter
      ? { id: toAfter.id, name: toAfter.name, balanceAfterUsd: toAfter.balanceUsd }
      : null,
    forecastBefore: pickForecast(before),
    forecastAfter: pickForecast(after),
    warnings,
    blockers,
  };
}

function simulateTransfer(
  accounts: FundingAccount[],
  fromId: string,
  toId: string | undefined,
  amountUsd: number,
): FundingAccount[] {
  return accounts.map((a) => {
    if (a.id === fromId) return { ...a, balanceUsd: a.balanceUsd - amountUsd };
    if (toId && a.id === toId) return { ...a, balanceUsd: a.balanceUsd + amountUsd };
    return { ...a };
  });
}

function pickForecast(f: SolvencyForecast) {
  return {
    liquidBalanceUsd: f.liquidBalanceUsd,
    runwayDays: f.runwayDays,
    dueIn7dUsd: f.dueIn7dUsd,
  };
}
