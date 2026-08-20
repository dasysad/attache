import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { SnapTradeConnection } from "../domain.js";
import { getTenant } from "../tenant.js";

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

interface ConnRow {
  id: string;
  tenant_id: string;
  external_user_id: string;
  label: string;
  brokerage_name: string | null;
  vault_credential_ref: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ConnRow): SnapTradeConnection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    externalUserId: row.external_user_id,
    label: row.label,
    brokerageName: row.brokerage_name,
    vaultCredentialRef: row.vault_credential_ref,
    status: row.status as SnapTradeConnection["status"],
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function snaptradeVaultRef(externalUserId: string): string {
  const safe = externalUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `snaptrade/user/${safe}`;
}

export function listSnapTradeConnections(db: Database.Database): SnapTradeConnection[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM snaptrade_connection WHERE tenant_id = ? ORDER BY created_at DESC`,
    )
    .all(tenantId) as ConnRow[];
  return rows.map(mapRow);
}

export function getSnapTradeConnection(
  db: Database.Database,
  id: string,
): SnapTradeConnection | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM snaptrade_connection WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as ConnRow | undefined;
  return row ? mapRow(row) : null;
}

export function countSnapTradeLinkedAccounts(db: Database.Database): number {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM funding_account
       WHERE tenant_id = ? AND provenance = 'snaptrade'`,
    )
    .get(tenantId) as { c: number };
  return row.c;
}

export function listAccountsForSnapTradeConnection(
  db: Database.Database,
  connectionId: string,
): Array<{ id: string; name: string }> {
  const tenantId = requireTenant(db);
  return db
    .prepare(
      `SELECT id, name FROM funding_account
       WHERE tenant_id = ? AND snaptrade_connection_id = ?
       ORDER BY name ASC`,
    )
    .all(tenantId, connectionId) as Array<{ id: string; name: string }>;
}

export function createSnapTradeConnection(
  db: Database.Database,
  input: {
    externalUserId: string;
    label: string;
    vaultCredentialRef: string;
    brokerageName?: string | null;
  },
): SnapTradeConnection {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT * FROM snaptrade_connection WHERE tenant_id = ? AND external_user_id = ?`,
    )
    .get(tenantId, input.externalUserId) as ConnRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE snaptrade_connection SET label = ?, vault_credential_ref = ?,
       brokerage_name = COALESCE(?, brokerage_name), status = 'active',
       last_error = NULL, updated_at = ? WHERE id = ?`,
    ).run(
      input.label,
      input.vaultCredentialRef,
      input.brokerageName ?? null,
      now,
      existing.id,
    );
    return mapRow(
      db.prepare(`SELECT * FROM snaptrade_connection WHERE id = ?`).get(existing.id) as ConnRow,
    );
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO snaptrade_connection
     (id, tenant_id, external_user_id, label, brokerage_name, vault_credential_ref,
      status, last_sync_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.externalUserId,
    input.label,
    input.brokerageName ?? null,
    input.vaultCredentialRef,
    now,
    now,
  );
  return mapRow(
    db.prepare(`SELECT * FROM snaptrade_connection WHERE id = ?`).get(id) as ConnRow,
  );
}

export interface StoredSnapTradePosition {
  id: string;
  connectionId: string;
  snaptradeAccountId: string | null;
  /** Funding account name when we can join on snaptrade_account_id. */
  accountName: string | null;
  symbol: string;
  units: number;
  priceUsd: number;
  marketValueUsd: number;
  updatedAt: string;
}

/**
 * Replace the cached holdings for one connection (last snapshot wins).
 * Why: Home/Investments and agents must list positions without a live SnapTrade call.
 */
export function replaceSnapTradePositions(
  db: Database.Database,
  connectionId: string,
  positions: Array<{
    symbol: string;
    units: number;
    priceUsd: number;
    marketValueUsd: number;
    snaptradeAccountId?: string | null;
  }>,
): number {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM snaptrade_position WHERE connection_id = ?`).run(connectionId);
    const insert = db.prepare(
      `INSERT INTO snaptrade_position
       (id, tenant_id, connection_id, snaptrade_account_id, symbol, units,
        price_usd, market_value_usd, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of positions) {
      insert.run(
        randomUUID(),
        tenantId,
        connectionId,
        p.snaptradeAccountId ?? null,
        p.symbol,
        p.units,
        p.priceUsd,
        p.marketValueUsd,
        now,
      );
    }
  });
  run();
  return positions.length;
}

export function listSnapTradePositions(
  db: Database.Database,
  options: { connectionId?: string } = {},
): StoredSnapTradePosition[] {
  const tenantId = requireTenant(db);
  const clauses = ["p.tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (options.connectionId) {
    clauses.push("p.connection_id = ?");
    params.push(options.connectionId);
  }
  const rows = db
    .prepare(
      `SELECT p.*, a.name AS account_name
       FROM snaptrade_position p
       LEFT JOIN funding_account a
         ON a.snaptrade_account_id = p.snaptrade_account_id
        AND a.tenant_id = p.tenant_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY p.market_value_usd DESC, p.symbol ASC`,
    )
    .all(...params) as Array<{
    id: string;
    connection_id: string;
    snaptrade_account_id: string | null;
    account_name: string | null;
    symbol: string;
    units: number;
    price_usd: number;
    market_value_usd: number;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    connectionId: row.connection_id,
    snaptradeAccountId: row.snaptrade_account_id,
    accountName: row.account_name,
    symbol: row.symbol,
    units: row.units,
    priceUsd: row.price_usd,
    marketValueUsd: row.market_value_usd,
    updatedAt: row.updated_at,
  }));
}

export function touchSnapTradeSync(
  db: Database.Database,
  connectionId: string,
  brokerageName?: string | null,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE snaptrade_connection SET last_sync_at = ?, status = 'active', last_error = NULL,
       brokerage_name = COALESCE(?, brokerage_name), updated_at = ? WHERE id = ?`,
  ).run(now, brokerageName ?? null, now, connectionId);
}

export function markSnapTradeConnectionError(
  db: Database.Database,
  connectionId: string,
  message: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE snaptrade_connection SET status = 'error', last_error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(message.slice(0, 500), now, connectionId);
  db.prepare(
    `UPDATE funding_account SET sync_status = 'error', updated_at = ?
     WHERE snaptrade_connection_id = ?`,
  ).run(now, connectionId);
}
