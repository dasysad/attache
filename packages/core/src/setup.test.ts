import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "./account.js";
import { openDatabase } from "./db.js";
import { createDocumentAdapter } from "./ingest/fake-document-adapter.js";
import { discoverMailCandidates } from "./ingest/discover.js";
import { createObligation } from "./obligation.js";
import {
  isSetupComplete,
  isSetupDiscoverDone,
  markSetupComplete,
  markSetupConnectHintsDone,
  markSetupDiscoverDone,
  maybeMarkSetupComplete,
  setupAllowedAppPaths,
  setupOnboardNextHint,
  setupWizardPath,
  setupWizardStepNumber,
} from "./setup.js";
import { createTenant } from "./tenant.js";
import { LocalVaultPort, setVaultForTests } from "./vault/local-vault.js";

describe("setup wizard ADR-015 P3", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-setup-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    return { db };
  }

  it("routes new tenant to discover first (not account)", () => {
    const { db } = setup();
    expect(isSetupComplete(db)).toBe(false);
    expect(setupWizardPath(db)).toBe("/onboard/discover");
    expect(setupWizardStepNumber("/onboard/discover")).toBe(2);
    db.close();
  });

  it("skipping discover without Gmail goes to manual account (negative: mail not required)", () => {
    const { db } = setup();
    markSetupDiscoverDone(db);
    expect(isSetupDiscoverDone(db)).toBe(true);
    expect(setupWizardPath(db)).toBe("/onboard/account");
    expect(setupAllowedAppPaths(db)).toContain("/app/plaid");
    expect(setupAllowedAppPaths(db)).toContain("/app/ingest");
    expect(setupAllowedAppPaths(db)).toContain("/onboard/discover");
    db.close();
  });

  it("routes tenant with account to obligation after discover is done", () => {
    const { db } = setup();
    markSetupDiscoverDone(db);
    createAccount(db, { name: "Checking", balanceUsd: 1000 });
    expect(setupWizardPath(db)).toBe("/onboard/obligation");
    db.close();
  });

  it("skips obligation step when a bill already exists", () => {
    const { db } = setup();
    markSetupDiscoverDone(db);
    createAccount(db, { name: "Checking", balanceUsd: 1000 });
    createObligation(db, {
      payee: "Rent",
      amountUsd: 10,
      dueDate: "2099-01-01",
    });
    expect(setupWizardPath(db)).toBeNull();
    maybeMarkSetupComplete(db);
    expect(isSetupComplete(db)).toBe(true);
    db.close();
  });

  it("returns null when setup complete even without accounts", () => {
    const { db } = setup();
    markSetupComplete(db);
    expect(setupWizardPath(db)).toBeNull();
    db.close();
  });

  it("allows My Accounts, Plaid, Inbox while obligation step is pending", () => {
    const { db } = setup();
    markSetupDiscoverDone(db);
    createAccount(db, { name: "Checking", balanceUsd: 1000 });
    const allowed = setupAllowedAppPaths(db);
    expect(allowed).toContain("/app/accounts");
    expect(allowed).toContain("/app/plaid");
    expect(allowed).toContain("/app/connections");
    expect(allowed).toContain("/app/ingest");
    expect(allowed).toContain("/onboard/obligation");
    db.close();
  });

  it("allows Plaid before any account (Plaid-first)", () => {
    const { db } = setup();
    expect(setupAllowedAppPaths(db)).toContain("/app/plaid");
    db.close();
  });

  it("shows connect step after sandbox discover until hints are skipped (negative: no auto-Link)", async () => {
    const { db } = setup();
    vaultDir = mkdtempSync(join(tmpdir(), "attache-setup-vault-"));
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    await discoverMailCandidates(db, vault, createDocumentAdapter(), { sandbox: true });
    markSetupDiscoverDone(db);
    expect(setupWizardPath(db)).toBe("/onboard/connect");
    expect(setupWizardPath(db)).not.toBe("/app/accounts");
    markSetupConnectHintsDone(db);
    expect(setupWizardPath(db)).toBe("/onboard/account");
    db.close();
  });

  it("names optional discover after onboard; --complete-setup skips it (negative)", () => {
    expect(setupOnboardNextHint("cli", false)).toContain("ingest discover-sandbox");
    expect(setupOnboardNextHint("mcp", false)).toContain("ingest_discover");
    expect(setupOnboardNextHint("cli", true)).not.toContain("discover");
    expect(setupOnboardNextHint("mcp", true)).toBe(
      "create_account or plaid_connect_sandbox",
    );
  });
});
