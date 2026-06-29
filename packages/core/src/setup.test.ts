import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "./account.js";
import { openDatabase } from "./db.js";
import {
  isSetupComplete,
  markSetupComplete,
  setupWizardPath,
} from "./setup.js";
import { createTenant } from "./tenant.js";

describe("setup wizard VS-2", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("routes new tenant to account step", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-setup-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    expect(isSetupComplete(db)).toBe(false);
    expect(setupWizardPath(db)).toBe("/onboard/account");
    db.close();
  });

  it("routes tenant with account to obligation step", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-setup-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    createAccount(db, { name: "Checking", balanceUsd: 1000 });
    expect(setupWizardPath(db)).toBe("/onboard/obligation");
    db.close();
  });

  it("returns null when setup complete", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-setup-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    markSetupComplete(db);
    expect(setupWizardPath(db)).toBeNull();
    db.close();
  });
});
