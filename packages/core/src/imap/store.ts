import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ImapAccount } from "../domain.js";
import { getTenant } from "../tenant.js";
import type { VaultPort } from "../vault/local-vault.js";

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

interface ImapRow {
  id: string;
  tenant_id: string;
  label: string;
  host: string;
  port: number;
  secure: number;
  username: string;
  vault_credential_ref: string;
  mailbox: string;
  status: string;
  last_sync_at: string | null;
  last_uid: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ImapRow): ImapAccount {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    label: row.label,
    host: row.host,
    port: row.port,
    secure: row.secure === 1,
    username: row.username,
    vaultCredentialRef: row.vault_credential_ref,
    mailbox: row.mailbox,
    status: row.status as ImapAccount["status"],
    lastSyncAt: row.last_sync_at,
    lastUid: row.last_uid,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function imapVaultRef(username: string, host: string): string {
  const safeUser = username.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `imap/account/${safeUser}@${safeHost}`;
}

export function listImapAccounts(db: Database.Database): ImapAccount[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(`SELECT * FROM imap_account WHERE tenant_id = ? ORDER BY created_at DESC`)
    .all(tenantId) as ImapRow[];
  return rows.map(mapRow);
}

export function getImapAccount(db: Database.Database, id: string): ImapAccount | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM imap_account WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as ImapRow | undefined;
  return row ? mapRow(row) : null;
}

/** Connect mailbox — stores app password in vault, metadata in SQLite. */
export function connectImapAccount(
  db: Database.Database,
  vault: VaultPort,
  input: {
    label?: string;
    host: string;
    port?: number;
    secure?: boolean;
    username: string;
    password: string;
    mailbox?: string;
  },
): ImapAccount {
  const tenantId = requireTenant(db);
  if (!input.host.trim()) throw new Error("host required");
  if (!input.username.trim()) throw new Error("username required");
  if (!input.password) throw new Error("password required");

  const vaultRef = imapVaultRef(input.username.trim(), input.host.trim());
  vault.set(vaultRef, input.password);

  const now = new Date().toISOString();
  const existing = db
    .prepare(`SELECT * FROM imap_account WHERE tenant_id = ? AND username = ? AND host = ?`)
    .get(tenantId, input.username.trim(), input.host.trim()) as ImapRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE imap_account SET label = ?, port = ?, secure = ?, vault_credential_ref = ?,
       mailbox = ?, status = 'active', last_error = NULL, updated_at = ? WHERE id = ?`,
    ).run(
      input.label?.trim() || existing.label,
      input.port ?? 993,
      input.secure === false ? 0 : 1,
      vaultRef,
      input.mailbox?.trim() || existing.mailbox || "INBOX",
      now,
      existing.id,
    );
    return mapRow(
      db.prepare(`SELECT * FROM imap_account WHERE id = ?`).get(existing.id) as ImapRow,
    );
  }

  const id = randomUUID();
  const label = input.label?.trim() || `${input.username}@${input.host}`;
  db.prepare(
    `INSERT INTO imap_account
     (id, tenant_id, label, host, port, secure, username, vault_credential_ref, mailbox,
      status, last_sync_at, last_uid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    label,
    input.host.trim(),
    input.port ?? 993,
    input.secure === false ? 0 : 1,
    input.username.trim(),
    vaultRef,
    input.mailbox?.trim() || "INBOX",
    now,
    now,
  );

  return mapRow(db.prepare(`SELECT * FROM imap_account WHERE id = ?`).get(id) as ImapRow);
}

export function updateImapSyncCursor(
  db: Database.Database,
  accountId: string,
  highUid: number | null,
): void {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE imap_account SET last_sync_at = ?, last_uid = COALESCE(?, last_uid),
       status = 'active', last_error = NULL, updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  ).run(now, highUid, now, accountId, tenantId);
}

/** Persist poll/auth failure for UI + agents (slice 4). */
export function markImapAccountError(
  db: Database.Database,
  accountId: string,
  message = "poll failed",
): void {
  const tenantId = requireTenant(db);
  db.prepare(
    `UPDATE imap_account SET status = 'error', last_error = ?, updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  ).run(message.slice(0, 500), new Date().toISOString(), accountId, tenantId);
}

/** Clear error without reconnect — next poll will retry. */
export function clearImapAccountError(db: Database.Database, accountId: string): void {
  const tenantId = requireTenant(db);
  const acct = getImapAccount(db, accountId);
  if (!acct) throw new Error("imap account not found");
  db.prepare(
    `UPDATE imap_account SET status = 'active', last_error = NULL, updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
  ).run(new Date().toISOString(), accountId, tenantId);
}

export interface UnlinkImapResult {
  accountId: string;
  label: string;
  vaultCleared: boolean;
}

/** Remove IMAP link + vault password (slice 4). */
export function unlinkImapAccount(
  db: Database.Database,
  accountId: string,
  vault: VaultPort,
): UnlinkImapResult {
  const account = getImapAccount(db, accountId);
  if (!account) throw new Error("imap account not found");
  db.prepare(`DELETE FROM imap_account WHERE id = ?`).run(accountId);
  let vaultCleared = false;
  try {
    vault.delete(account.vaultCredentialRef);
    vaultCleared = true;
  } catch {
    /* missing secret ok */
  }
  return { accountId: account.id, label: account.label, vaultCleared };
}
