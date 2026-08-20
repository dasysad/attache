import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAccounts } from "../account.js";
import { transferHonesty } from "../agent/transfer-honesty.js";
import { openDatabase } from "../db.js";
import { computeSolvencyForecast } from "../forecast.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import { FakeSnapTradeAdapter } from "./fake-adapter.js";
import { listSnapTradeConnections, listSnapTradePositions } from "./store.js";
import { connectSandboxSnapTrade, syncAllSnapTradeConnections } from "./sync.js";
import { unlinkSnapTradeConnection } from "./unlink.js";

describe("BL-5 SnapTrade brokerage", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-st-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-st-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault, adapter: new FakeSnapTradeAdapter() };
  }

  it("connects sandbox and upserts brokerage accounts on My Accounts", async () => {
    const { db, vault, adapter } = setup();
    const { connectionId, sync } = await connectSandboxSnapTrade(db, adapter, vault);
    expect(connectionId).toBeTruthy();
    expect(sync.accountsUpdated).toBe(2);
    expect(sync.positionCount).toBe(2);
    const brokerage = listAccounts(db).filter((a) => a.provenance === "snaptrade");
    expect(brokerage).toHaveLength(2);
    expect(brokerage.every((a) => a.kind === "brokerage")).toBe(true);
    expect(listSnapTradeConnections(db)).toHaveLength(1);
    const positions = listSnapTradePositions(db);
    expect(positions.map((p) => p.symbol).sort()).toEqual(["VTI", "VXUS"]);
    expect(positions.every((p) => p.accountName)).toBe(true);
    db.close();
  });

  it("excludes brokerage from liquid runway forecast", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxSnapTrade(db, adapter, vault);
    const forecast = computeSolvencyForecast(listAccounts(db), [], 30);
    expect(forecast.liquidBalanceUsd).toBe(0);
    db.close();
  });

  it("treats snaptrade legs as approval_only (honesty)", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxSnapTrade(db, adapter, vault);
    const acct = listAccounts(db).find((a) => a.provenance === "snaptrade")!;
    const h = transferHonesty(db, acct.id);
    expect(h.mode).toBe("approval_only");
    expect(h.willExecute).toBe(false);
    db.close();
  });

  it("unlinks connection and clears vault (negative: missing)", async () => {
    const { db, vault, adapter } = setup();
    const { connectionId } = await connectSandboxSnapTrade(db, adapter, vault);
    const conn = listSnapTradeConnections(db)[0]!;
    expect(vault.get(conn.vaultCredentialRef)).toBeTruthy();

    const result = unlinkSnapTradeConnection(db, connectionId, vault);
    expect(result.accountsRemoved).toBe(2);
    expect(listAccounts(db).filter((a) => a.provenance === "snaptrade")).toHaveLength(0);
    expect(listSnapTradeConnections(db)).toHaveLength(0);
    expect(listSnapTradePositions(db)).toHaveLength(0);
    expect(vault.get(conn.vaultCredentialRef)).toBeNull();

    expect(() => unlinkSnapTradeConnection(db, "missing", vault)).toThrow(/not found/i);
    db.close();
  });

  it("re-sync is idempotent on account count", async () => {
    const { db, vault, adapter } = setup();
    await connectSandboxSnapTrade(db, adapter, vault);
    const again = await syncAllSnapTradeConnections(db, adapter, vault);
    expect(again).toHaveLength(1);
    expect(again[0]!.accountsUpdated).toBe(2);
    expect(listAccounts(db).filter((a) => a.provenance === "snaptrade")).toHaveLength(2);
    db.close();
  });

  it("lists positions for one connection; unknown id is empty (negative)", async () => {
    const { db, vault, adapter } = setup();
    const { connectionId } = await connectSandboxSnapTrade(db, adapter, vault);
    expect(listSnapTradePositions(db, { connectionId })).toHaveLength(2);
    expect(listSnapTradePositions(db, { connectionId: "missing" })).toEqual([]);
    db.close();
  });
});
