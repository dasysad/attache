import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { AccountSyncStatus, FundingAccountKind, Provenance } from "./domain.js";
import type { PlaidLinkedAccount } from "./ingest/plaid-port.js";
import { getTenant } from "./tenant.js";

interface AccountRow {
  id: string;
  tenant_id: string;
  name: string;
  institution: string | null;
  mask: string | null;
  kind: FundingAccountKind;
  balance_usd: number;
  provenance: string;
  sync_status: string;
  plaid_account_id: string | null;
  plaid_item_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapAccountRow(row: AccountRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    institution: row.institution,
    mask: row.mask,
    kind: row.kind as FundingAccountKind,
    balanceUsd: row.balance_usd,
    provenance: row.provenance as Provenance,
    syncStatus: (row.sync_status ?? "manual") as AccountSyncStatus,
    plaidAccountId: row.plaid_account_id,
    plaidItemId: row.plaid_item_id,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

export function listAccounts(db: Database.Database) {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM funding_account WHERE tenant_id = ? ORDER BY name ASC`,
    )
    .all(tenantId) as AccountRow[];
  return rows.map(mapAccountRow);
}

export function findAccountByPlaidId(
  db: Database.Database,
  plaidAccountId: string,
): ReturnType<typeof mapAccountRow> | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(
      `SELECT * FROM funding_account WHERE tenant_id = ? AND plaid_account_id = ?`,
    )
    .get(tenantId, plaidAccountId) as AccountRow | undefined;
  return row ? mapAccountRow(row) : null;
}

export function createAccount(
  db: Database.Database,
  input: {
    name: string;
    institution?: string;
    mask?: string;
    kind?: FundingAccountKind;
    balanceUsd: number;
  },
) {
  const tenantId = requireTenant(db);
  if (!input.name.trim()) throw new Error("account name required");
  if (!Number.isFinite(input.balanceUsd)) {
    throw new Error("balance must be a number");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO funding_account
     (id, tenant_id, name, institution, mask, kind, balance_usd, provenance,
      sync_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'native', 'manual', ?, ?)`,
  ).run(
    id,
    tenantId,
    input.name.trim(),
    input.institution?.trim() || null,
    input.mask?.trim() || null,
    input.kind ?? "checking",
    input.balanceUsd,
    now,
    now,
  );

  return mapAccountRow(
    db.prepare("SELECT * FROM funding_account WHERE id = ?").get(id) as AccountRow,
  );
}

/** Link or refresh a Plaid-backed funding account. */
export function upsertPlaidFundingAccount(
  db: Database.Database,
  input: {
    plaidItemId: string;
    institution: string;
    account: PlaidLinkedAccount;
  },
) {
  const tenantId = requireTenant(db);
  const existing = findAccountByPlaidId(db, input.account.plaidAccountId);
  const now = new Date().toISOString();
  const kind: FundingAccountKind =
    input.account.kind === "savings" ? "savings" : "checking";

  if (existing) {
    db.prepare(
      `UPDATE funding_account SET
         name = ?, institution = ?, mask = ?, kind = ?, balance_usd = ?,
         sync_status = 'fresh', last_synced_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.account.name,
      input.institution,
      input.account.mask,
      kind,
      input.account.balanceUsd,
      now,
      now,
      existing.id,
    );
    return mapAccountRow(
      db.prepare("SELECT * FROM funding_account WHERE id = ?").get(existing.id) as AccountRow,
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO funding_account
     (id, tenant_id, name, institution, mask, kind, balance_usd, provenance,
      sync_status, plaid_account_id, plaid_item_id, last_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'plaid', 'fresh', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.account.name,
    input.institution,
    input.account.mask,
    kind,
    input.account.balanceUsd,
    input.account.plaidAccountId,
    input.plaidItemId,
    now,
    now,
    now,
  );
  return mapAccountRow(
    db.prepare("SELECT * FROM funding_account WHERE id = ?").get(id) as AccountRow,
  );
}

export function sumLiquidBalanceUsd(
  accounts: Array<{ balanceUsd: number }>,
): number {
  return accounts.reduce((sum, a) => sum + a.balanceUsd, 0);
}

export function getAccount(db: Database.Database, accountId: string) {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM funding_account WHERE id = ? AND tenant_id = ?`)
    .get(accountId, tenantId) as AccountRow | undefined;
  return row ? mapAccountRow(row) : null;
}

/**
 * Edit a manually entered account — Plaid-linked rows sync from the bank adapter.
 */
export function updateManualAccount(
  db: Database.Database,
  accountId: string,
  input: {
    name?: string;
    institution?: string;
    mask?: string;
    kind?: FundingAccountKind;
    balanceUsd?: number;
  },
) {
  const account = getAccount(db, accountId);
  if (!account) throw new Error("account not found");
  if (account.syncStatus !== "manual" || account.plaidAccountId) {
    throw new Error("cannot edit plaid-linked account — sync via Plaid");
  }

  const name = input.name !== undefined ? input.name.trim() : account.name;
  if (!name) throw new Error("account name required");
  if (input.balanceUsd !== undefined && !Number.isFinite(input.balanceUsd)) {
    throw new Error("balance must be a number");
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE funding_account SET
       name = ?, institution = ?, mask = ?, kind = ?,
       balance_usd = COALESCE(?, balance_usd), updated_at = ?
     WHERE id = ?`,
  ).run(
    name,
    input.institution !== undefined ? input.institution.trim() || null : account.institution,
    input.mask !== undefined ? input.mask.trim() || null : account.mask,
    input.kind ?? account.kind,
    input.balanceUsd ?? null,
    now,
    accountId,
  );
  return getAccount(db, accountId)!;
}

/** Remove a manual account when it has no linked bank transactions. */
export function deleteManualAccount(db: Database.Database, accountId: string): void {
  const account = getAccount(db, accountId);
  if (!account) throw new Error("account not found");
  if (account.syncStatus !== "manual" || account.plaidAccountId) {
    throw new Error("cannot delete plaid-linked account");
  }
  const tx = db
    .prepare(
      `SELECT COUNT(*) AS c FROM bank_transaction WHERE funding_account_id = ?`,
    )
    .get(accountId) as { c: number };
  if (tx.c > 0) {
    throw new Error("account has transactions — remove via Plaid unlink first");
  }
  db.prepare(`DELETE FROM funding_account WHERE id = ?`).run(accountId);
}
