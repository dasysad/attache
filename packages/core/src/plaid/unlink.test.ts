import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "../account.js";
import { createTransferProposal } from "../agent/transfer-queue.js";
import { openDatabase } from "../db.js";
import { FakePlaidAdapter } from "../ingest/fake-plaid-adapter.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import { PlaidError } from "./errors.js";
import { listPlaidItems, markPlaidItemError } from "./store.js";
import { connectSandboxPlaid, syncAllPlaidItems } from "./sync.js";
import { unlinkPlaidItem } from "./unlink.js";

describe("unlinkPlaidItem", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  async function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-unlink-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-unlink-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    const { itemId } = await connectSandboxPlaid(db, new FakePlaidAdapter(), vault);
    return { db, vault, itemId };
  }

  it("removes item, accounts, txs, and vault secret", async () => {
    const { db, vault, itemId } = await setup();
    const item = listPlaidItems(db)[0]!;
    expect(vault.get(item.vaultCredentialRef)).toBeTruthy();
    expect(listAccounts(db).some((a) => a.provenance === "plaid")).toBe(true);

    const result = unlinkPlaidItem(db, itemId, vault);
    expect(result.accountsRemoved).toBe(2);
    expect(result.transactionsRemoved).toBeGreaterThan(0);
    expect(result.vaultCleared).toBe(true);
    expect(listPlaidItems(db)).toHaveLength(0);
    expect(listAccounts(db).filter((a) => a.provenance === "plaid")).toHaveLength(0);
    expect(vault.get(item.vaultCredentialRef)).toBeNull();
    db.close();
  });

  it("rejects unknown item (negative)", async () => {
    const { db, vault } = await setup();
    expect(() => unlinkPlaidItem(db, "missing", vault)).toThrow(/not found/i);
    db.close();
  });

  it("blocks unlink when pending transfer references linked account", async () => {
    const { db, vault, itemId } = await setup();
    const plaidAcct = listAccounts(db).find((a) => a.provenance === "plaid")!;
    createTransferProposal(db, {
      fromAccountId: plaidAcct.id,
      amountUsd: 10,
      proposedBy: "cli",
    });
    expect(() => unlinkPlaidItem(db, itemId, vault)).toThrow(/pending transfer/i);
    expect(listPlaidItems(db)).toHaveLength(1);
    db.close();
  });

  it("leaves manual accounts alone", async () => {
    const { db, vault, itemId } = await setup();
    createAccount(db, { name: "Cash", balanceUsd: 40, kind: "cash" });
    unlinkPlaidItem(db, itemId, vault);
    expect(listAccounts(db).map((a) => a.name)).toEqual(["Cash"]);
    db.close();
  });
});

describe("sync error fan-out", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  it("marks linked accounts error when item errors", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-syncerr-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-syncerr-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    const { itemId } = await connectSandboxPlaid(db, new FakePlaidAdapter(), vault);

    markPlaidItemError(db, itemId, "ITEM_LOGIN_REQUIRED", "need re-auth");
    const accounts = listAccounts(db).filter((a) => a.plaidItemId === itemId);
    expect(accounts.every((a) => a.syncStatus === "error")).toBe(true);

    const broken = {
      mode: "sandbox" as const,
      institutionName: async () => "X",
      fetchSnapshot: async () => {
        throw new PlaidError("ITEM_LOGIN_REQUIRED", "login");
      },
    };
    const results = await syncAllPlaidItems(db, broken, vault);
    expect(results).toHaveLength(1);
    expect(results[0]!.error).toBeTruthy();
    db.close();
  });
});
