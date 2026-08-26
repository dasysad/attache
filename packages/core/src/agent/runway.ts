import type Database from "better-sqlite3";
import type { SolvencyForecast } from "../domain.js";
import { listAccounts } from "../account.js";
import { listIncomeStreams } from "../income-stream.js";
import { listObligations } from "../obligation.js";
import { computeSolvencyForecast } from "../forecast.js";
import { getTenant, isOnboarded } from "../tenant.js";

/** Agent-facing runway summary — trimmed from full SolvencyForecast. */
export interface RunwaySnapshot {
  tenantName: string;
  liquidBalanceUsd: number;
  runwayDays: number;
  horizonDays: number;
  dueIn7dUsd: number;
  overdueUsd: number;
  plannedIncomeUsd: number;
  hasIncomeStreams: boolean;
  upcomingCount: number;
}

/**
 * Build runway context for MCP `get_runway` and agent prompts.
 * Why: agents need solvency without full dashboard series payload.
 */
export function getRunwaySnapshot(
  db: Database.Database,
  horizonDays = 30,
): RunwaySnapshot {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  const tenant = getTenant(db)!;
  const forecast = computeSolvencyForecast(
    listAccounts(db),
    listObligations(db),
    horizonDays,
    listIncomeStreams(db),
  );
  return {
    tenantName: tenant.name,
    ...summarizeForecast(forecast),
  };
}

function summarizeForecast(forecast: SolvencyForecast): Omit<RunwaySnapshot, "tenantName"> {
  return {
    liquidBalanceUsd: forecast.liquidBalanceUsd,
    runwayDays: forecast.runwayDays,
    horizonDays: forecast.horizonDays,
    dueIn7dUsd: forecast.dueIn7dUsd,
    overdueUsd: forecast.overdueUsd,
    plannedIncomeUsd: forecast.plannedIncomeUsd,
    hasIncomeStreams: forecast.hasIncomeStreams,
    upcomingCount: forecast.upcoming.length,
  };
}
