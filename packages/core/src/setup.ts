import type Database from "better-sqlite3";
import { listAccounts } from "./account.js";
import { listUnsatisfiedConnectHints } from "./ingest/discover.js";
import { listObligations } from "./obligation.js";
import { isOnboarded } from "./tenant.js";

const SETUP_COMPLETE_KEY = "setup_complete";
const SETUP_DISCOVER_DONE_KEY = "setup_discover_done";
const SETUP_CONNECT_HINTS_DONE_KEY = "setup_connect_hints_done";

/** ADR-015 P3 — household → find mail → connect hints → account → bill. */
export const SETUP_WIZARD_TOTAL = 5;

export const SETUP_WIZARD_LABELS = [
  "Household",
  "Find mail",
  "Connect",
  "Account",
  "Bills",
] as const;

export type SetupWizardPath =
  | "/onboard"
  | "/onboard/discover"
  | "/onboard/connect"
  | "/onboard/account"
  | "/onboard/obligation";

function metaIsTrue(db: Database.Database, key: string): boolean {
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value === "true";
}

function setMetaTrue(db: Database.Database, key: string): void {
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, 'true')
     ON CONFLICT(key) DO UPDATE SET value = 'true'`,
  ).run(key);
}

/** VS-2: first-run wizard finished (skipped or fully filled). */
export function isSetupComplete(db: Database.Database): boolean {
  return metaIsTrue(db, SETUP_COMPLETE_KEY);
}

export function markSetupComplete(db: Database.Database): void {
  setMetaTrue(db, SETUP_COMPLETE_KEY);
}

/** User skipped or continued past the Gmail discover step (ADR-015). */
export function isSetupDiscoverDone(db: Database.Database): boolean {
  return metaIsTrue(db, SETUP_DISCOVER_DONE_KEY);
}

export function markSetupDiscoverDone(db: Database.Database): void {
  setMetaTrue(db, SETUP_DISCOVER_DONE_KEY);
}

/**
 * User skipped leftover statement hints. Empty hints skip this step without the flag.
 */
export function isSetupConnectHintsDone(db: Database.Database): boolean {
  return metaIsTrue(db, SETUP_CONNECT_HINTS_DONE_KEY);
}

export function markSetupConnectHintsDone(db: Database.Database): void {
  setMetaTrue(db, SETUP_CONNECT_HINTS_DONE_KEY);
}

/**
 * Next setup wizard step, or null when the dashboard is ready.
 *
 * Order (ADR-015 P3): discover (skip) → connect hints if any (skip) →
 * account if none → obligation if none. Gmail and Plaid are never required.
 * `--complete-setup` / Skip bills still short-circuit via isSetupComplete.
 */
export function setupWizardPath(db: Database.Database): string | null {
  if (!isOnboarded(db)) return "/onboard";
  if (isSetupComplete(db)) return null;
  if (!isSetupDiscoverDone(db)) return "/onboard/discover";
  const hints = listUnsatisfiedConnectHints(db);
  if (!isSetupConnectHintsDone(db) && hints.length > 0) return "/onboard/connect";
  if (listAccounts(db).length === 0) return "/onboard/account";
  if (listObligations(db).length === 0) return "/onboard/obligation";
  return null;
}

/**
 * Persist setup_complete when every skippable step is satisfied.
 * Call after wizard mutations — not inside setupWizardPath (keep that pure).
 */
export function maybeMarkSetupComplete(db: Database.Database): void {
  if (!isOnboarded(db) || isSetupComplete(db)) return;
  if (setupWizardPath(db) === null) markSetupComplete(db);
}

/**
 * Paths humans/agents may visit while the optional setup wizard is unfinished.
 * Why: Plaid-first, CLI accounts, and Inbox discover must not bounce off My Accounts.
 */
export function setupAllowedAppPaths(db: Database.Database): string[] {
  const next = setupWizardPath(db);
  if (!next) return [];
  const base = [
    "/app/accounts",
    "/app/plaid",
    "/app/snaptrade",
    "/app/connections",
    "/app/ingest",
    "/app/setup",
    "/app/assets",
    "/app/entities",
    "/app/statements",
    "/app/people",
    "/app/income",
    "/onboard/discover",
    "/onboard/discover/skip",
    "/onboard/discover/continue",
    "/onboard/connect",
    "/onboard/connect/skip",
    "/onboard/connect/continue",
    "/onboard/account",
    "/onboard/obligation",
  ];
  if (!base.includes(next)) base.push(next);
  return base;
}

/**
 * Agent-facing next after household create.
 * Why: CLI/MCP must name discover (optional) — not jump straight to accounts —
 * while `--complete-setup` still skips the rest (ADR-015: Gmail/Plaid never required).
 */
export function setupOnboardNextHint(
  surface: "cli" | "mcp",
  completeSetup: boolean,
): string {
  if (completeSetup) {
    return surface === "cli"
      ? "attache accounts create … or attache plaid connect-sandbox"
      : "create_account or plaid_connect_sandbox";
  }
  return surface === "cli"
    ? "attache ingest discover-sandbox (optional) · attache accounts create … · Gmail/Plaid never required"
    : "ingest_discover { sandbox: true } (optional) or create_account — Gmail/Plaid never required";
}

/** 1-based index for <att-wizard-steps current> (household is 1). */
export function setupWizardStepNumber(path: string): number {
  switch (path) {
    case "/onboard":
      return 1;
    case "/onboard/discover":
      return 2;
    case "/onboard/connect":
      return 3;
    case "/onboard/account":
      return 4;
    case "/onboard/obligation":
      return 5;
    default:
      return 1;
  }
}
