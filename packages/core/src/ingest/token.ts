import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { defaultInboxDir } from "../db.js";

const META_KEY = "ingest_token";

/**
 * Per-tenant email ingress token stored in app_meta (VS-4).
 * Display address bills+{token}@ingest.attache.app. Live hosted delivery is
 * BYO Mailgun (BL-8) when ATTACHE_MAILGUN_SIGNING_KEY is set — not Attache SMTP.
 */
export function getOrCreateIngestToken(db: Database.Database): string {
  const existing = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(META_KEY) as { value: string } | undefined;
  if (existing?.value) return existing.value;

  const token = randomBytes(12).toString("hex");
  db.prepare(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
  ).run(META_KEY, token);
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(META_KEY) as { value: string };
  return row.value;
}

export function ingestEmailAddress(token: string): string {
  return `bills+${token}@ingest.attache.app`;
}

/** Parse tenant ingest token from forwarded To: address (plus-addressing). */
export function parseIngestTokenFromAddress(to: string): string | null {
  const match = to.match(/bills\+([a-f0-9]+)@/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function inboxDirForToken(token: string, baseDir = defaultInboxDir()): string {
  return join(baseDir, token);
}
