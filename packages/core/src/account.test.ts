import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db.js";
import { createTenant } from "./tenant.js";
import { FakePlaidAdapter } from "./ingest/fake-plaid-adapter.js";
import { connectSandboxPlaid } from "./plaid/sync.js";
import { LocalVaultPort, setVaultForTests } from "./vault/local-vault.js";
import {
  createAccount,
  deleteManualAccount,
  getAccount,
  listAccounts,
  parseFundingKind,
  sumLiabilityUsd,
  sumLiquidBalanceUsd,
  updateManualAccount,
} from "./account.js";

describe("account management", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-acct-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    return { db };
  }

  it("updates manual account fields", () => {
    const { db } = setup();
    const acct = createAccount(db, { name: "Checking", balanceUsd: 100 });
    const updated = updateManualAccount(db, acct.id, {
      name: "Main Checking",
      balanceUsd: 250,
    });
    expect(updated.name).toBe("Main Checking");
    expect(updated.balanceUsd).toBe(250);
    db.close();
  });

  it("rejects update on plaid-linked account", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-acct-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    setVaultForTests(new LocalVaultPort(vaultDir, null));
    await connectSandboxPlaid(db, new FakePlaidAdapter(), new LocalVaultPort(vaultDir, null));
    const plaidAcct = listAccounts(db).find((a) => a.plaidAccountId)!;
    expect(() => updateManualAccount(db, plaidAcct.id, { balanceUsd: 1 })).toThrow(
      /plaid/i,
    );
    db.close();
  });

  it("deletes manual account", () => {
    const { db } = setup();
    const acct = createAccount(db, { name: "Cash", balanceUsd: 50 });
    deleteManualAccount(db, acct.id);
    expect(getAccount(db, acct.id)).toBeNull();
    db.close();
  });

  it("lists accounts sorted by name", () => {
    const { db } = setup();
    createAccount(db, { name: "Zebra", balanceUsd: 1 });
    createAccount(db, { name: "Alpha", balanceUsd: 2 });
    expect(listAccounts(db).map((a) => a.name)).toEqual(["Alpha", "Zebra"]);
    db.close();
  });

  it("excludes brokerage and liabilities from liquid runway", () => {
    const { db } = setup();
    createAccount(db, { name: "Checking", balanceUsd: 100, kind: "checking" });
    createAccount(db, { name: "Broker", balanceUsd: 900, kind: "brokerage" });
    createAccount(db, { name: "Visa", balanceUsd: 40, kind: "credit" });
    createAccount(db, { name: "Mortgage", balanceUsd: 200, kind: "loan" });
    const accounts = listAccounts(db);
    expect(sumLiquidBalanceUsd(accounts)).toBe(100);
    expect(sumLiabilityUsd(accounts)).toBe(240);
    db.close();
  });

  it("rejects unknown kinds (negative)", () => {
    const { db } = setup();
    expect(() =>
      createAccount(db, { name: "X", balanceUsd: 1, kind: "foo" as never }),
    ).toThrow(/kind must be/);
    expect(() => parseFundingKind("envelope")).toThrow(/kind must be/);
    db.close();
  });
});
