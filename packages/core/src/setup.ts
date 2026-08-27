import type Database from "better-sqlite3";
import { isOnboarded } from "./tenant.js";

const SETUP_COMPLETE_KEY = "setup_complete";
const SETUP_DISCOVER_DONE_KEY = "setup_discover_done";
const SETUP_CONNECT_HINTS_DONE_KEY = "setup_connect_hints_done";

/** ADR-015 P3 — household → optional accelerators on /app/setup. */
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
  | "/onboard/obligation"
  | "/app/setup";

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

/** VS-2: user marked setup complete (--complete-setup, Skip, or setup hub button). */
export function isSetupComplete(db: Database.Database): boolean {
  return metaIsTrue(db, SETUP_COMPLETE_KEY);
}

export function markSetupComplete(db: Database.Database): void {
  setMetaTrue(db, SETUP_COMPLETE_KEY);
}

/** User skipped or continued past the Gmail discover accelerator (ADR-015). */
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
 * Next path when setup is unfinished: the checklist hub.
 *
 * Why: ADR-015 + vs-ui-household-basics — discover/connect/account/bill are
 * optional accelerators linked from `/app/setup`, not a forced linear wizard.
 * `--complete-setup` / explicit mark still short-circuit via isSetupComplete.
 */
export function setupWizardPath(db: Database.Database): string | null {
  if (!isOnboarded(db)) return "/onboard";
  if (isSetupComplete(db)) return null;
  return "/app/setup";
}

/**
 * Legacy hook after accelerator mutations. Hub model does not auto-complete from
 * coverage gaps — callers use markSetupComplete / --complete-setup explicitly.
 */
export function maybeMarkSetupComplete(_db: Database.Database): void {
  // Intentionally empty — setup complete is explicit (ADR-015 friction rules).
}

/**
 * Paths reachable while setup is unfinished. With the hub model, app routes are
 * not gated; only Home redirects to `/app/setup`. Kept for CLI/MCP parity tests.
 */
export function setupAllowedAppPaths(db: Database.Database): string[] {
  if (!isOnboarded(db) || isSetupComplete(db)) return [];
  return [
    "/app/setup",
    "/app/accounts",
    "/app/activity",
    "/app/net-worth",
    "/app/cashflow",
    "/app/plaid",
    "/app/snaptrade",
    "/app/connections",
    "/app/ingest",
    "/app/assets",
    "/app/entities",
    "/app/statements",
    "/app/people",
    "/app/income",
    "/app/obligations",
    "/onboard/discover",
    "/onboard/discover/skip",
    "/onboard/discover/continue",
    "/onboard/connect",
    "/onboard/connect/skip",
    "/onboard/connect/continue",
    "/onboard/account",
    "/onboard/obligation",
  ];
}

/**
 * Agent-facing next after household create.
 * Why: CLI/MCP land on setup status — accelerators are optional (ADR-015).
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
    ? "attache setup status · optional: attache ingest discover-sandbox · Gmail/Plaid never required"
    : "setup_status · optional: ingest_discover { sandbox: true } — Gmail/Plaid never required";
}

/** 1-based index for <att-wizard-steps current> on accelerator pages. */
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
