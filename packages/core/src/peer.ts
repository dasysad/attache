import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { openDatabase } from "./db.js";

const SITE_ID_KEY = "site_id";

/**
 * Stable install identity for mesh sync (ADR-003).
 * Persisted in app_meta before any tenant exists.
 */
export function getOrCreateSiteId(db: Database.Database): string {
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(SITE_ID_KEY) as { value: string } | undefined;
  if (row) return row.value;

  const siteId = randomUUID();
  db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
    SITE_ID_KEY,
    siteId,
  );
  return siteId;
}

export interface PeerRecord {
  siteId: string;
  tenantId: string;
  displayName: string;
  role: "primary" | "replica";
  createdAt: string;
  lastSeenAt: string;
}

export function registerPeer(
  db: Database.Database,
  input: {
    siteId: string;
    tenantId: string;
    displayName: string;
    role?: "primary" | "replica";
  },
): PeerRecord {
  const now = new Date().toISOString();
  const role = input.role ?? "primary";
  db.prepare(
    `INSERT INTO peer_identity (site_id, tenant_id, display_name, role, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       display_name = excluded.display_name,
       role = excluded.role,
       last_seen_at = excluded.last_seen_at`,
  ).run(input.siteId, input.tenantId, input.displayName, role, now, now);

  return {
    siteId: input.siteId,
    tenantId: input.tenantId,
    displayName: input.displayName,
    role,
    createdAt: now,
    lastSeenAt: now,
  };
}

export function touchPeer(db: Database.Database, siteId: string): void {
  db.prepare("UPDATE peer_identity SET last_seen_at = ? WHERE site_id = ?").run(
    new Date().toISOString(),
    siteId,
  );
}

/** Convenience for CLI/tests: open DB and ensure site_id exists. */
export function bootstrapSiteId(dataDir?: string): string {
  const db = openDatabase(dataDir);
  try {
    return getOrCreateSiteId(db);
  } finally {
    db.close();
  }
}
