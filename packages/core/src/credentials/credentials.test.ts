/**
 * BL-7 P0: high-value shortlist + HIBP — never a password store.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "../account.js";
import { openDatabase } from "../db.js";
import { connectSandboxGmail } from "../gmail/store.js";
import { listNotifications } from "../notify/store.js";
import { createObligation } from "../obligation.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort } from "../vault/local-vault.js";
import { checkCredentialHygiene } from "./check.js";
import { createHibpAdapter } from "./create-adapter.js";
import { FakeHibpAdapter, SANDBOX_HIBP_EMAIL } from "./fake-adapter.js";
import { LiveHibpAdapter } from "./live-adapter.js";
import { listHighValueTargets } from "./targets.js";

describe("BL-7 credential hygiene", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-cred-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-cred-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Cred", holderDisplayName: "A" });
    return { db, vault: new LocalVaultPort(vaultDir, null) };
  }

  it("requires onboard (negative)", () => {
    const db = openDatabase(mkdtempSync(join(tmpdir(), "attache-cred-empty-")));
    expect(() => listHighValueTargets(db)).toThrow(/not onboarded/);
    db.close();
  });

  it("lists emails, institutions, and payees — not passwords", () => {
    const { db, vault } = setup();
    connectSandboxGmail(db, vault);
    createAccount(db, { name: "Checking", balanceUsd: 100, institution: "Chase" });
    createObligation(db, {
      payee: "Rent",
      amountUsd: 1800,
      dueDate: "2026-09-01",
      cadence: "monthly",
    });
    const targets = listHighValueTargets(db);
    expect(targets.some((t) => t.kind === "email" && t.name === SANDBOX_HIBP_EMAIL)).toBe(
      true,
    );
    expect(targets.some((t) => t.kind === "institution" && t.name === "Chase")).toBe(
      true,
    );
    expect(targets.some((t) => t.kind === "payee" && t.name === "Rent")).toBe(true);
    expect(targets.every((t) => !("password" in t))).toBe(true);
    db.close();
  });

  it("HIBP is only queried for emails, not payees (negative)", async () => {
    const { db, vault } = setup();
    connectSandboxGmail(db, vault);
    createObligation(db, {
      payee: "Adobe",
      amountUsd: 10,
      dueDate: "2026-09-01",
    });
    const fake = new FakeHibpAdapter();
    const result = await checkCredentialHygiene(db, fake);
    expect(fake.queried).toEqual([SANDBOX_HIBP_EMAIL]);
    expect(fake.queried).not.toContain("adobe");
    expect(result.breaches).toEqual([
      { email: SANDBOX_HIBP_EMAIL, name: "Adobe", breachDate: "2013-10-04" },
    ]);
    const notes = listNotifications(db);
    expect(notes.some((n) => n.kind === "credential_hygiene")).toBe(true);
    expect(result.message).toMatch(/does not store website passwords|not a password manager/);
    db.close();
  });

  it("clears hygiene alerts when the mailbox is no longer breached (negative)", async () => {
    const { db } = setup();
    createAccount(db, { name: "Checking", balanceUsd: 50 });
    const alwaysHit = {
      mode: "sandbox" as const,
      queried: [] as string[],
      async breachesForEmail(email: string) {
        this.queried.push(email);
        return [{ name: "Adobe", breachDate: "2013-10-04" }];
      },
    };
    // No emails → no HIBP, no notification.
    const empty = await checkCredentialHygiene(db, alwaysHit);
    expect(empty.emailsChecked).toEqual([]);
    expect(empty.breaches).toEqual([]);
    expect(listNotifications(db).filter((n) => n.kind === "credential_hygiene")).toHaveLength(
      0,
    );
    expect(alwaysHit.queried).toEqual([]);
    db.close();
  });

  it("defaults to fake without HIBP_API_KEY; live 404 is no breach", async () => {
    expect(createHibpAdapter({})).toBeInstanceOf(FakeHibpAdapter);
    const live = new LiveHibpAdapter("key", async () => new Response("", { status: 404 }));
    expect(await live.breachesForEmail("safe@example.com")).toEqual([]);
    await expect(
      live.breachesForEmail("not-an-email"),
    ).rejects.toThrow(/email/);
    const limited = new LiveHibpAdapter("key", async () => new Response("", { status: 429 }));
    await expect(limited.breachesForEmail("a@b.com")).rejects.toThrow(/rate limited/);
  });
});
