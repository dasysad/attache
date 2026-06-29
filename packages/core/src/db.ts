import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

/** Default local data directory for VS-0 (SQLCipher in a later slice). */
export function defaultDataDir(): string {
  return join(homedir(), ".attache", "data");
}

/** VS-3: local credential store (replace with @celestial/vault in production). */
export function defaultVaultDir(): string {
  return join(homedir(), ".attache", "vault");
}

/** VS-4: local document store (R2 in cloud tier). */
export function defaultDocumentsDir(): string {
  return join(homedir(), ".attache", "documents");
}

/** VS-4.1: maildrop inbox for forwarded .eml files per ingest token. */
export function defaultInboxDir(): string {
  return join(homedir(), ".attache", "inbox");
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function openDatabase(dataDir = defaultDataDir()): Database.Database {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "attache.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'individual',
      billing_plan TEXT NOT NULL DEFAULT 'free',
      ledger_primary_site_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'account_holder',
      auth_level TEXT NOT NULL DEFAULT 'full',
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenant(id)
    );

    CREATE TABLE IF NOT EXISTS peer_identity (
      site_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'primary',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS funding_account (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      name TEXT NOT NULL,
      institution TEXT,
      mask TEXT,
      kind TEXT NOT NULL DEFAULT 'checking',
      balance_usd REAL NOT NULL DEFAULT 0,
      provenance TEXT NOT NULL DEFAULT 'native',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS obligation (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      payee TEXT NOT NULL,
      amount_usd REAL NOT NULL CHECK(amount_usd > 0),
      cadence TEXT NOT NULL DEFAULT 'once',
      due_date TEXT NOT NULL,
      autopay INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      provenance TEXT NOT NULL DEFAULT 'native',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plaid_item (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      external_item_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      vault_credential_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_sync_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, external_item_id)
    );

    CREATE TABLE IF NOT EXISTS ingested_event (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      external_id TEXT,
      funding_account_id TEXT REFERENCES funding_account(id),
      payload_json TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1,
      reviewed INTEGER NOT NULL DEFAULT 1,
      promoted_at TEXT,
      ingested_at TEXT NOT NULL,
      UNIQUE(tenant_id, source, external_id)
    );

    CREATE TABLE IF NOT EXISTS bank_transaction (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      funding_account_id TEXT NOT NULL REFERENCES funding_account(id),
      ingested_event_id TEXT REFERENCES ingested_event(id),
      external_id TEXT NOT NULL,
      payee TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      posted_date TEXT NOT NULL,
      pending INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      provenance TEXT NOT NULL DEFAULT 'plaid',
      created_at TEXT NOT NULL,
      UNIQUE(tenant_id, external_id)
    );

    CREATE TABLE IF NOT EXISTS document_artifact (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_ref TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imap_account (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      label TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 993,
      secure INTEGER NOT NULL DEFAULT 1,
      username TEXT NOT NULL,
      vault_credential_ref TEXT NOT NULL,
      mailbox TEXT NOT NULL DEFAULT 'INBOX',
      status TEXT NOT NULL DEFAULT 'active',
      last_sync_at TEXT,
      last_uid INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, username, host)
    );

    CREATE TABLE IF NOT EXISTS gmail_account (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      email TEXT NOT NULL,
      label TEXT NOT NULL,
      vault_credential_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_sync_at TEXT,
      history_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, email)
    );

    CREATE TABLE IF NOT EXISTS notification (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      member_id TEXT REFERENCES member(id),
      severity TEXT NOT NULL,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      action_url TEXT,
      read_at TEXT,
      channels_delivered TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(tenant_id, dedupe_key)
    );

    CREATE TABLE IF NOT EXISTS push_subscription (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      endpoint TEXT NOT NULL UNIQUE,
      keys_json TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transfer_proposal (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenant(id),
      from_account_id TEXT NOT NULL REFERENCES funding_account(id),
      to_account_id TEXT REFERENCES funding_account(id),
      amount_usd REAL NOT NULL CHECK(amount_usd > 0),
      memo TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      allowed INTEGER NOT NULL DEFAULT 0,
      proposed_by TEXT NOT NULL DEFAULT 'agent',
      proposal_json TEXT NOT NULL,
      review_note TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "funding_account", "sync_status", "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(db, "funding_account", "plaid_account_id", "TEXT");
  ensureColumn(db, "funding_account", "plaid_item_id", "TEXT REFERENCES plaid_item(id)");
  ensureColumn(db, "funding_account", "last_synced_at", "TEXT");
  ensureColumn(db, "obligation", "ingested_event_id", "TEXT REFERENCES ingested_event(id)");
}
