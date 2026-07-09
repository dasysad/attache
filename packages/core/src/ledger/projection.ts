import type Database from "better-sqlite3";
import { minorToUsd } from "./types.js";

/**
 * Sync `funding_account.balance_usd` from the ledger projection (ADR-001 P0).
 *
 * WHAT: after a journal post, update the denormalized balance the UI reads.
 * WHY: forecast/dashboard stay fast; ledger remains authoritative.
 */
export function syncFundingBalanceProjection(
  db: Database.Database,
  tenantId: string,
  fundingAccountId: string,
): void {
  const row = db
    .prepare(
      `SELECT la.id AS ledger_id
       FROM ledger_account la
       WHERE la.tenant_id = ? AND la.funding_account_id = ?`,
    )
    .get(tenantId, fundingAccountId) as { ledger_id: string } | undefined;
  if (!row) return;

  const balance = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total
       FROM ledger_entry WHERE account_id = ?`,
    )
    .get(row.ledger_id) as { total: number };

  const balanceUsd = minorToUsd(balance.total);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE funding_account SET balance_usd = ?, updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  ).run(balanceUsd, now, fundingAccountId, tenantId);
}
