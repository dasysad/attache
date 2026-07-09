import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAccounts } from "../account.js";
import { openDatabase } from "../db.js";
import { FakePlaidAdapter } from "../ingest/fake-plaid-adapter.js";
import {
  connectSandboxPlaid,
  syncAllPlaidItems,
  syncPlaidItem,
} from "./sync.js";
import { countPlaidLinkedAccounts, listRecentTransactions, listPlaidItems } from "./store.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";

describe("VS-3 Plaid ingest", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-plaid-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault, adapter: new FakePlaidAdapter() };
  }

  it("connects sandbox and creates plaid-linked accounts", async () => {
    const { db, vault, adapter } = setup();
    const { itemId, sync } = await connectSandboxPlaid(db, adapter, vault);
    expect(itemId).toBeTruthy();
    expect(sync.accountsUpdated).toBe(2);
    expect(sync.transactionsNew).toBe(5);
    expect(listAccounts(db).filter((a) => a.provenance === "plaid")).toHaveLength(2);
    expect(countPlaidLinkedAccounts(db)).toBe(2);
    db.close();
  });

  it("deduplicates transactions on re-sync", async () => {
    const { db, vault, adapter } = setup();
    const { itemId } = await connectSandboxPlaid(db, adapter, vault);
    const first = await syncPlaidItem(db, itemId, adapter, vault);
    expect(first.transactionsNew).toBe(0);
    expect(first.transactionsSkipped).toBe(5);
    expect(listRecentTransactions(db)).toHaveLength(5);
    db.close();
  });

  it("stores access token outside sqlite", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxPlaid(db, adapter, vault);
    const item = listPlaidItems(db)[0]!;
    expect(vault.get(item.vaultCredentialRef)).toMatch(/^sandbox_access_/);
    db.close();
  });

  it("syncAllPlaidItems processes every item", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxPlaid(db, adapter, vault);
    const results = await syncAllPlaidItems(db, adapter, vault);
    expect(results).toHaveLength(1);
    db.close();
  });
});
