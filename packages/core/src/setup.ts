import type Database from "better-sqlite3";
import { listAccounts } from "./account.js";
import { isOnboarded } from "./tenant.js";

const SETUP_COMPLETE_KEY = "setup_complete";

/** VS-2: first-run wizard finished (account + optional obligation). */
export function isSetupComplete(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(SETUP_COMPLETE_KEY) as { value: string } | undefined;
  return row?.value === "true";
}

export function markSetupComplete(db: Database.Database): void {
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, 'true')
     ON CONFLICT(key) DO UPDATE SET value = 'true'`,
  ).run(SETUP_COMPLETE_KEY);
}

/**
 * Next setup wizard step, or null when dashboard is ready.
 */
export function setupWizardPath(db: Database.Database): string | null {
  if (!isOnboarded(db)) return "/onboard";
  if (isSetupComplete(db)) return null;
  if (listAccounts(db).length === 0) return "/onboard/account";
  return "/onboard/obligation";
}
