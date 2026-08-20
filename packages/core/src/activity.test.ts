import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAccounts } from "./account.js";
import { listActivity } from "./activity.js";
import { openDatabase } from "./db.js";
import { FakePlaidAdapter } from "./ingest/fake-plaid-adapter.js";
import { listTransactions } from "./plaid/store.js";
import { connectSandboxPlaid } from "./plaid/sync.js";
import { createTenant } from "./tenant.js";
import { LocalVaultPort, setVaultForTests } from "./vault/local-vault.js";

describe("listTransactions filters (P1)", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-act-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-act-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault, adapter: new FakePlaidAdapter() };
  }

  it("returns the sandbox register and attaches account labels", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxPlaid(db, adapter, vault);
    const rows = listActivity(db);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.accountLabel.includes("Checking"))).toBe(true);
    db.close();
  });

  it("filters pending vs posted", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxPlaid(db, adapter, vault);
    const pending = listTransactions(db, { pending: true });
    const posted = listTransactions(db, { pending: false });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.payee).toMatch(/Uber/);
    expect(posted).toHaveLength(4);
    expect(posted.every((t) => t.pending === false)).toBe(true);
    db.close();
  });

  it("filters by account; unknown account is empty (negative)", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxPlaid(db, adapter, vault);
    const savings = listAccounts(db).find((a) => a.kind === "savings")!;
    expect(listTransactions(db, { accountId: savings.id })).toEqual([]);
    expect(listTransactions(db, { accountId: "missing-account" })).toEqual([]);
    db.close();
  });

  it("filters by posted date window", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxPlaid(db, adapter, vault);
    const all = listTransactions(db);
    const newest = all[0]!.postedDate;
    const onlyNewest = listTransactions(db, { fromDate: newest, toDate: newest });
    expect(onlyNewest.length).toBeGreaterThanOrEqual(1);
    expect(onlyNewest.every((t) => t.postedDate === newest)).toBe(true);
    db.close();
  });

  it("rejects malformed dates (negative)", () => {
    const { db } = setup();
    expect(() => listTransactions(db, { fromDate: "yesterday" })).toThrow(/YYYY-MM-DD/);
    expect(() => listTransactions(db, { toDate: "2026/01/01" })).toThrow(/YYYY-MM-DD/);
    db.close();
  });
});
