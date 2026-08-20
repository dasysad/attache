/**
 * Activity register — Plaid (and later manual) transactions with filters.
 *
 * Shared by `/app/activity`, `attache activity list`, and MCP `list_transactions`.
 * See ADR-014 P1.
 */
import type Database from "better-sqlite3";
import type { BankTransaction } from "./domain.js";
import { listTransactions, type ListTransactionsFilter } from "./plaid/store.js";
import { accountLabelForTransaction } from "./plaid/sync.js";

export type ActivityFilter = ListTransactionsFilter;

export type ActivityRow = BankTransaction & { accountLabel: string };

export function listActivity(
  db: Database.Database,
  filter: ActivityFilter = {},
): ActivityRow[] {
  return listTransactions(db, filter).map((t) => ({
    ...t,
    accountLabel: accountLabelForTransaction(db, t.fundingAccountId),
  }));
}
