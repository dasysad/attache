/**
 * BL-7 P2: assisted change — URL + suggested password, nothing stored.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "../account.js";
import { openDatabase } from "../db.js";
import { connectSandboxGmail } from "../gmail/store.js";
import { createObligation } from "../obligation.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort } from "../vault/local-vault.js";
import {
  changePasswordUrlForEmail,
  changePasswordUrlForName,
} from "./change-password-url.js";
import {
  credentialAssist,
  generateSuggestedPassword,
  resolveAssistTarget,
} from "./assist.js";
import { SANDBOX_HIBP_EMAIL } from "./fake-adapter.js";

describe("BL-7 P2 credential assist", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-cred-assist-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-cred-assist-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Assist", holderDisplayName: "A" });
    return { db, vault: new LocalVaultPort(vaultDir, null) };
  }

  it("maps gmail.com to Google account password URL", () => {
    expect(changePasswordUrlForEmail(SANDBOX_HIBP_EMAIL)).toMatch(
      /myaccount\.google\.com/,
    );
    expect(changePasswordUrlForEmail("user@utility.example")).toBe(
      "https://utility.example/.well-known/change-password",
    );
    expect(() => changePasswordUrlForEmail("not-an-email")).toThrow(/invalid/);
  });

  it("returns null for generic payee names (negative)", () => {
    expect(changePasswordUrlForName("Rent")).toBeNull();
    expect(changePasswordUrlForName("Chase")).toMatch(/chase\.com/);
  });

  it("rejects targets not on the shortlist (negative)", () => {
    const { db } = setup();
    expect(() =>
      resolveAssistTarget(db, { email: "stranger@example.com" }),
    ).toThrow(/shortlist/);
    expect(() => resolveAssistTarget(db, {})).toThrow(/exactly one/);
    expect(() =>
      resolveAssistTarget(db, { email: "a@b.com", payee: "Rent" }),
    ).toThrow(/exactly one/);
    db.close();
  });

  it("assist returns URL + password for sandbox gmail; generic payee has no URL", () => {
    const { db, vault } = setup();
    connectSandboxGmail(db, vault);
    createObligation(db, {
      payee: "Rent",
      amountUsd: 1800,
      dueDate: "2026-09-01",
    });
    createAccount(db, {
      name: "Checking",
      balanceUsd: 100,
      institution: "Chase",
    });

    const emailAssist = credentialAssist(db, { email: SANDBOX_HIBP_EMAIL });
    expect(emailAssist.changePasswordUrl).toMatch(/google\.com/);
    expect(emailAssist.suggestedPassword.length).toBeGreaterThanOrEqual(12);
    expect(emailAssist.honesty).toMatch(/does not store/);

    const payeeAssist = credentialAssist(db, { payee: "Rent" });
    expect(payeeAssist.changePasswordUrl).toBeNull();
    expect(payeeAssist.message).toMatch(/manually/);

    const bankAssist = credentialAssist(db, { institution: "Chase" });
    expect(bankAssist.changePasswordUrl).toMatch(/chase\.com/);

    db.close();
  });

  it("generateSuggestedPassword rejects invalid lengths (negative)", () => {
    expect(() => generateSuggestedPassword(8)).toThrow(/12–64/);
    expect(generateSuggestedPassword(16)).toMatch(/[A-Za-z0-9!@#$%^&*]/);
  });
});
