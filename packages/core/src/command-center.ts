/**
 * Command-center projections — shared by Home, CLI `agent attention`, and MCP.
 *
 * Why: the web dashboard must not invent a second source of truth. Attention
 * items and account grouping are pure domain so agents and humans see the same
 * list. See ADR-014.
 */
import type Database from "better-sqlite3";
import type { FundingAccount, FundingAccountKind, SolvencyForecast } from "./domain.js";
import { listAccounts } from "./account.js";
import { listObligations } from "./obligation.js";
import { computeSolvencyForecast } from "./forecast.js";
import { listPendingBillReviews } from "./ingest/bill.js";
import {
  countUnconfirmedAssetHints,
  listDiscoverCandidates,
} from "./ingest/discover.js";
import {
  countPendingTransferProposals,
  listTransferProposals,
} from "./agent/transfer-queue.js";
import { listIncomeStreams } from "./income-stream.js";
import { isSetupComplete } from "./setup.js";
import { listSetupGaps } from "./setup-coverage.js";

/** Display order: liquid assets, invested, then liabilities. */
export const ACCOUNT_KIND_ORDER: FundingAccountKind[] = [
  "checking",
  "savings",
  "cash",
  "brokerage",
  "credit",
  "loan",
];

export const ACCOUNT_KIND_LABEL: Record<FundingAccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  brokerage: "Brokerage",
  credit: "Credit cards",
  loan: "Loans",
};

export interface AccountKindGroup<T extends { kind: string; balanceUsd: number } = FundingAccount> {
  kind: string;
  label: string;
  accounts: T[];
  subtotalUsd: number;
}

/**
 * Group funding accounts by kind, preserving ACCOUNT_KIND_ORDER.
 * Unknown kinds (forward-compat / bad data) land in a trailing "Other" group
 * so they never vanish from the household list.
 */
export function groupAccountsByKind<T extends { kind: string; balanceUsd: number }>(
  accounts: T[],
): AccountKindGroup<T>[] {
  const known = new Set<string>(ACCOUNT_KIND_ORDER);
  const groups: AccountKindGroup<T>[] = [];

  for (const kind of ACCOUNT_KIND_ORDER) {
    const rows = accounts.filter((a) => a.kind === kind);
    if (rows.length === 0) continue;
    groups.push({
      kind,
      label: ACCOUNT_KIND_LABEL[kind],
      accounts: rows,
      subtotalUsd: rows.reduce((s, a) => s + a.balanceUsd, 0),
    });
  }

  const leftovers = accounts.filter((a) => !known.has(a.kind));
  if (leftovers.length > 0) {
    groups.push({
      kind: "other",
      label: "Other",
      accounts: leftovers,
      subtotalUsd: leftovers.reduce((s, a) => s + a.balanceUsd, 0),
    });
  }

  return groups;
}

/** Invested equity on My Accounts — excluded from runway (see sumLiquidBalanceUsd). */
export function sumBrokerageUsd(
  accounts: Array<{ balanceUsd: number; kind?: string }>,
): number {
  return accounts.reduce((sum, a) => {
    if (a.kind === "brokerage") return sum + a.balanceUsd;
    return sum;
  }, 0);
}

export type AttentionSeverity = "action" | "warning" | "info";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  body: string;
  href: string;
  cliHint: string;
}

export interface AttentionInput {
  overdueUsd: number;
  pendingTransfers: number;
  pendingBillReviews: number;
  pendingAssetHints: number;
  syncErrorAccounts: Array<{ name: string }>;
  achPending: number;
  /** Optional setup gaps (accounts, bills, income, …). */
  setupGaps?: Array<{ id: string; title: string; body: string; href: string; cliHint: string }>;
}

/**
 * Build the Home attention strip from already-computed counts.
 * Order is severity-of-job: overdue bills → HITL → ACH in flight → ingest → sync → setup.
 */
export function buildAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (input.overdueUsd > 0) {
    items.push({
      id: "overdue",
      severity: "action",
      title: "Overdue bills",
      body: `$${input.overdueUsd.toFixed(2)} past due — cover these before new spending.`,
      href: "/app/obligations",
      cliHint: "attache agent obligations --filter overdue",
    });
  }

  if (input.pendingTransfers > 0) {
    const n = input.pendingTransfers;
    items.push({
      id: "hitl",
      severity: "action",
      title: "Transfers need approval",
      body: `${n} proposal${n === 1 ? "" : "s"} waiting — approve is not always a bank move.`,
      href: "/app/transfers",
      cliHint: "attache transfer list --pending",
    });
  }

  if (input.achPending > 0) {
    const n = input.achPending;
    items.push({
      id: "ach_pending",
      severity: "warning",
      title: "ACH in flight",
      body: `${n} transfer${n === 1 ? "" : "s"} submitted to the rail — not executed on the ledger yet.`,
      href: "/app/transfers",
      cliHint: "attache ach sync",
    });
  }

  if (input.pendingBillReviews > 0) {
    const n = input.pendingBillReviews;
    items.push({
      id: "ingest_review",
      severity: "warning",
      title: "Bills to confirm",
      body: `${n} ingested bill${n === 1 ? "" : "s"} waiting for confirm before they become obligations.`,
      href: "/app/ingest",
      cliHint: "attache ingest status",
    });
  }

  if (input.pendingAssetHints > 0) {
    const n = input.pendingAssetHints;
    items.push({
      id: "asset_hint",
      severity: "info",
      title: "Home/vehicle hints",
      body: `${n} mail item${n === 1 ? "" : "s"} look like a home or vehicle — confirm to add a thin register row. Estimate is optional; skip is fine.`,
      href: "/app/ingest",
      cliHint: "attache ingest discover",
    });
  }

  if (input.syncErrorAccounts.length > 0) {
    const names = input.syncErrorAccounts.map((a) => a.name).join(", ");
    items.push({
      id: "sync_error",
      severity: "warning",
      title: "Bank sync failed",
      body: `${names} — unlink or re-auth from Connections. Balances may be stale.`,
      href: "/app/connections",
      cliHint: "attache plaid status",
    });
  }

  for (const gap of input.setupGaps ?? []) {
    // Cap setup noise: only first three gaps.
    if (items.filter((i) => i.id.startsWith("setup_")).length >= 3) break;
    items.push({
      id: `setup_${gap.id}`,
      severity: "info",
      title: `Setup: ${gap.title}`,
      body: gap.body,
      href: gap.href,
      cliHint: gap.cliHint,
    });
  }

  return items;
}

/** Load attention from the live household — same payload for Home, CLI, MCP. */
export function collectAttention(db: Database.Database): AttentionItem[] {
  const accounts = listAccounts(db);
  const forecast = computeSolvencyForecast(
    accounts,
    listObligations(db),
    30,
    listIncomeStreams(db),
  );
  return buildAttention({
    overdueUsd: forecast.overdueUsd,
    pendingTransfers: countPendingTransferProposals(db),
    pendingBillReviews: listPendingBillReviews(db).length,
    pendingAssetHints: countUnconfirmedAssetHints(listDiscoverCandidates(db)),
    syncErrorAccounts: accounts
      .filter((a) => a.syncStatus === "error")
      .map((a) => ({ name: a.name })),
    achPending: listTransferProposals(db, { status: "ach_pending" }).length,
    // Setup gaps only while the wizard is unfinished — after complete-setup,
    // leftovers live on /app/setup, not the Home strip (healthy → empty).
    setupGaps: isSetupComplete(db) ? [] : listSetupGaps(db),
  });
}

export interface CommandCenterTotals {
  liquidUsd: number;
  brokerageUsd: number;
  accountCount: number;
}

export function commandCenterTotals(
  accounts: Array<{ balanceUsd: number; kind?: FundingAccountKind | string }>,
  forecast: Pick<SolvencyForecast, "liquidBalanceUsd">,
): CommandCenterTotals {
  return {
    liquidUsd: forecast.liquidBalanceUsd,
    brokerageUsd: sumBrokerageUsd(accounts),
    accountCount: accounts.length,
  };
}
