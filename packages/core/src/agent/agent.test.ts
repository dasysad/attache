import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createAccount } from "../account.js";
import { createObligation } from "../obligation.js";
import { createTenant } from "../tenant.js";
import { getRunwaySnapshot } from "./runway.js";
import { listObligationsForAgent } from "./obligations.js";
import { proposeTransfer } from "./transfer.js";

describe("VS-5 agent tools", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-agent-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Test Home", holderDisplayName: "A" });
    createAccount(db, { name: "Checking", balanceUsd: 5000 });
    createAccount(db, { name: "Savings", balanceUsd: 10000 });
    return { db };
  }

  it("getRunwaySnapshot requires onboarded tenant", () => {
    const db = openDatabase(mkdtempSync(join(tmpdir(), "attache-agent-")));
    expect(() => getRunwaySnapshot(db)).toThrow(/not onboarded/);
    db.close();
  });

  it("returns runway snapshot", () => {
    const { db } = setup();
    const snap = getRunwaySnapshot(db);
    expect(snap.tenantName).toBe("Test Home");
    expect(snap.liquidBalanceUsd).toBe(15000);
    expect(snap.runwayDays).toBe(30);
    db.close();
  });

  it("lists unpaid obligations", () => {
    const { db } = setup();
    createObligation(db, {
      payee: "Rent",
      amountUsd: 2000,
      dueDate: "2099-06-01",
    });
    const rows = listObligationsForAgent(db, "unpaid");
    expect(rows.some((r) => r.payee === "Rent")).toBe(true);
    db.close();
  });

  it("proposeTransfer blocks insufficient balance", () => {
    const { db } = setup();
    const accounts = db.prepare("SELECT id FROM funding_account").all() as Array<{ id: string }>;
    const checking = accounts[0]!.id;
    const result = proposeTransfer(db, {
      fromAccountId: checking,
      amountUsd: 999_999,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    db.close();
  });

  it("internal transfer does not change liquid total", () => {
    const { db } = setup();
    const rows = db.prepare("SELECT id, name FROM funding_account ORDER BY name").all() as Array<{
      id: string;
      name: string;
    }>;
    const checking = rows.find((r) => r.name === "Checking")!.id;
    const savings = rows.find((r) => r.name === "Savings")!.id;
    const result = proposeTransfer(db, {
      fromAccountId: checking,
      toAccountId: savings,
      amountUsd: 500,
    });
    expect(result.allowed).toBe(true);
    expect(result.forecastBefore.liquidBalanceUsd).toBe(result.forecastAfter.liquidBalanceUsd);
    db.close();
  });

  it("outbound transfer reduces liquid balance", () => {
    const { db } = setup();
    const checking = (db.prepare("SELECT id FROM funding_account LIMIT 1").get() as { id: string }).id;
    const result = proposeTransfer(db, {
      fromAccountId: checking,
      amountUsd: 1000,
      memo: "pay contractor",
    });
    expect(result.allowed).toBe(true);
    expect(result.forecastAfter.liquidBalanceUsd).toBe(14000);
    expect(result.dryRun).toBe(true);
    db.close();
  });
});
