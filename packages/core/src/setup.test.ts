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

describe("setup hub (ADR-015 + vs-ui-household-basics)", () => {
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

  it("routes new tenant to setup hub (not linear discover)", () => {
    const { db } = setup();
    expect(isSetupComplete(db)).toBe(false);
    expect(setupWizardPath(db)).toBe("/app/setup");
    expect(setupWizardStepNumber("/onboard/discover")).toBe(2);
    db.close();
  });

  it("stays on hub until explicit complete (negative: gaps do not auto-finish)", () => {
    const { db } = setup();
    markSetupDiscoverDone(db);
    expect(isSetupDiscoverDone(db)).toBe(true);
    expect(setupWizardPath(db)).toBe("/app/setup");
    createAccount(db, { name: "Checking", balanceUsd: 1000 });
    createObligation(db, {
      payee: "Rent",
      amountUsd: 10,
      dueDate: "2099-01-01",
    });
    maybeMarkSetupComplete(db);
    expect(isSetupComplete(db)).toBe(false);
    expect(setupWizardPath(db)).toBe("/app/setup");
    db.close();
  });

  it("returns null when setup marked complete even without accounts", () => {
    const { db } = setup();
    markSetupComplete(db);
    expect(setupWizardPath(db)).toBeNull();
    db.close();
  });

  it("allows all app routes while hub is open (negative: no bounce off Plaid)", () => {
    const { db } = setup();
    const allowed = setupAllowedAppPaths(db);
    expect(allowed).toContain("/app/plaid");
    expect(allowed).toContain("/app/ingest");
    expect(allowed).toContain("/onboard/discover");
    expect(allowed).toContain("/app/accounts");
    expect(allowed).toContain("/app/obligations");
    db.close();
  });

  it("discover accelerators do not change hub path (negative: no auto-Link routing)", async () => {
    const { db } = setup();
    vaultDir = mkdtempSync(join(tmpdir(), "attache-setup-vault-"));
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    await discoverMailCandidates(db, vault, createDocumentAdapter(), { sandbox: true });
    markSetupDiscoverDone(db);
    expect(setupWizardPath(db)).toBe("/app/setup");
    markSetupConnectHintsDone(db);
    expect(setupWizardPath(db)).toBe("/app/setup");
    db.close();
  });

  it("names setup status after onboard; --complete-setup skips hub (negative)", () => {
    expect(setupOnboardNextHint("cli", false)).toContain("setup status");
    expect(setupOnboardNextHint("mcp", false)).toContain("setup_status");
    expect(setupOnboardNextHint("cli", true)).not.toContain("discover");
    expect(setupOnboardNextHint("mcp", true)).toBe(
      "create_account or plaid_connect_sandbox",
    );
  });
});
