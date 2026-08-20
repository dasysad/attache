import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { BankTransaction, PlaidItem } from "../domain.js";
import { getTenant } from "../tenant.js";

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

interface ItemRow {
  id: string;
  tenant_id: string;
  external_item_id: string;
  institution_name: string;
  vault_credential_ref: string;
  status: string;
  last_sync_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function mapItem(row: ItemRow): PlaidItem {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    externalItemId: row.external_item_id,
    institutionName: row.institution_name,
    vaultCredentialRef: row.vault_credential_ref,
    status: row.status as PlaidItem["status"],
    lastSyncAt: row.last_sync_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPlaidItems(db: Database.Database): PlaidItem[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(`SELECT * FROM plaid_item WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId) as ItemRow[];
  return rows.map(mapItem);
}

export function getPlaidItem(db: Database.Database, itemId: string): PlaidItem | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM plaid_item WHERE id = ? AND tenant_id = ?`)
    .get(itemId, tenantId) as ItemRow | undefined;
  return row ? mapItem(row) : null;
}

export function countPlaidLinkedAccounts(db: Database.Database): number {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM funding_account WHERE tenant_id = ? AND provenance = 'plaid'`,
    )
    .get(tenantId) as { c: number };
  return row.c;
}

/** Funding accounts tied to a Plaid item (for unlink / error fan-out). */
export function listAccountsForPlaidItem(
  db: Database.Database,
  plaidItemId: string,
): Array<{ id: string; name: string }> {
  const tenantId = requireTenant(db);
  return db
    .prepare(
      `SELECT id, name FROM funding_account
       WHERE tenant_id = ? AND plaid_item_id = ?
       ORDER BY name ASC`,
    )
    .all(tenantId, plaidItemId) as Array<{ id: string; name: string }>;
}

/** Mark every funding account on an item as sync error (UI + agents). */
export function markPlaidLinkedAccountsError(
  db: Database.Database,
  plaidItemId: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE funding_account SET sync_status = 'error', updated_at = ?
     WHERE plaid_item_id = ?`,
  ).run(now, plaidItemId);
}

export function createPlaidItem(
  db: Database.Database,
  input: {
    externalItemId: string;
    institutionName: string;
    vaultCredentialRef: string;
  },
): PlaidItem {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO plaid_item
     (id, tenant_id, external_item_id, institution_name, vault_credential_ref, status, last_sync_at, error_code, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', NULL, NULL, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.externalItemId,
    input.institutionName,
    input.vaultCredentialRef,
    now,
    now,
  );
  return mapItem(
    db.prepare("SELECT * FROM plaid_item WHERE id = ?").get(id) as ItemRow,
  );
}

export function touchPlaidItemSync(db: Database.Database, itemId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE plaid_item SET last_sync_at = ?, updated_at = ?, status = 'active',
       error_code = NULL, error_message = NULL WHERE id = ?`,
  ).run(now, now, itemId);
}

/** Record a Plaid API failure on the item for UI/agent re-link prompts. */
export function markPlaidItemError(
  db: Database.Database,
  itemId: string,
  errorCode: string,
  errorMessage: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE plaid_item SET status = 'error', error_code = ?, error_message = ?,
       updated_at = ? WHERE id = ?`,
  ).run(errorCode, errorMessage.slice(0, 500), now, itemId);
  markPlaidLinkedAccountsError(db, itemId);
}

interface TxRow {
  id: string;
  tenant_id: string;
  funding_account_id: string;
  ingested_event_id: string | null;
  external_id: string;
  payee: string;
  amount_usd: number;
  posted_date: string;
  pending: number;
  category: string | null;
  provenance: string;
  created_at: string;
}

function mapTx(row: TxRow): BankTransaction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fundingAccountId: row.funding_account_id,
    ingestedEventId: row.ingested_event_id,
    externalId: row.external_id,
    payee: row.payee,
    amountUsd: row.amount_usd,
    postedDate: row.posted_date,
    pending: row.pending === 1,
    category: row.category,
    provenance: row.provenance as BankTransaction["provenance"],
    createdAt: row.created_at,
  };
}

export function listRecentTransactions(
  db: Database.Database,
  limit = 20,
): BankTransaction[] {
  return listTransactions(db, { limit });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ListTransactionsFilter {
  /** Funding account id. Unknown id → empty list (not an error). */
  accountId?: string;
  /** true = pending only; false = posted only; omit = both. */
  pending?: boolean;
  /** Inclusive YYYY-MM-DD. */
  fromDate?: string;
  /** Inclusive YYYY-MM-DD. */
  toDate?: string;
  limit?: number;
}

/**
 * Bank register with optional filters (Activity P1).
 * Why: CLI/MCP/web share one query so a household filter is not UI-only.
 */
export function listTransactions(
  db: Database.Database,
  filter: ListTransactionsFilter = {},
): BankTransaction[] {
  const tenantId = requireTenant(db);
  if (filter.fromDate && !ISO_DATE.test(filter.fromDate)) {
    throw new Error("fromDate must be YYYY-MM-DD");
  }
  if (filter.toDate && !ISO_DATE.test(filter.toDate)) {
    throw new Error("toDate must be YYYY-MM-DD");
  }

  const clauses = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (filter.accountId) {
    clauses.push("funding_account_id = ?");
    params.push(filter.accountId);
  }
  if (filter.pending === true) clauses.push("pending = 1");
  if (filter.pending === false) clauses.push("pending = 0");
  if (filter.fromDate) {
    clauses.push("posted_date >= ?");
    params.push(filter.fromDate);
  }
  if (filter.toDate) {
    clauses.push("posted_date <= ?");
    params.push(filter.toDate);
  }
  const limit = filter.limit ?? 100;
  const rows = db
    .prepare(
      `SELECT * FROM bank_transaction WHERE ${clauses.join(" AND ")}
       ORDER BY posted_date DESC, created_at DESC LIMIT ?`,
    )
    .all(...params, limit) as TxRow[];
  return rows.map(mapTx);
}

export function upsertBankTransaction(
  db: Database.Database,
  input: {
    fundingAccountId: string;
    ingestedEventId?: string;
    externalId: string;
    payee: string;
    amountUsd: number;
    postedDate: string;
    pending: boolean;
    category?: string;
  },
): BankTransaction {
  const tenantId = requireTenant(db);
  const existing = db
    .prepare(`SELECT * FROM bank_transaction WHERE tenant_id = ? AND external_id = ?`)
    .get(tenantId, input.externalId) as TxRow | undefined;
  if (existing) return mapTx(existing);

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO bank_transaction
     (id, tenant_id, funding_account_id, ingested_event_id, external_id, payee,
      amount_usd, posted_date, pending, category, provenance, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'plaid', ?)`,
  ).run(
    id,
    tenantId,
    input.fundingAccountId,
    input.ingestedEventId ?? null,
    input.externalId,
    input.payee,
    input.amountUsd,
    input.postedDate,
    input.pending ? 1 : 0,
    input.category ?? null,
    now,
  );
  return mapTx(db.prepare("SELECT * FROM bank_transaction WHERE id = ?").get(id) as TxRow);
}

export function getBankTransaction(
  db: Database.Database,
  id: string,
): BankTransaction | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM bank_transaction WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as TxRow | undefined;
  return row ? mapTx(row) : null;
}

/**
 * Recategorize a posted (or pending) bank line.
 * Empty / whitespace category clears to null so cash-flow buckets as (uncategorized).
 */
export function setTransactionCategory(
  db: Database.Database,
  id: string,
  category: string | null,
): BankTransaction {
  const existing = getBankTransaction(db, id);
  if (!existing) throw new Error("transaction not found");
  const next = category?.trim() || null;
  db.prepare(`UPDATE bank_transaction SET category = ? WHERE id = ?`).run(next, id);
  return getBankTransaction(db, id)!;
}
