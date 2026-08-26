import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "./account.js";
import { openDatabase } from "./db.js";
import { computeSolvencyForecast, expandObligation } from "./forecast.js";
import { createObligation, listObligations, markObligationPaid } from "./obligation.js";
import { createTenant } from "./tenant.js";

describe("VS-1 accounts", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("requires onboarded tenant", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-v1-"));
    const db = openDatabase(dataDir);
    expect(() => createAccount(db, { name: "Checking", balanceUsd: 100 })).toThrow(
      /not onboarded/,
    );
    db.close();
  });

  it("creates and lists manual accounts", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-v1-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Test", holderDisplayName: "A" });
    createAccount(db, {
      name: "Checking",
      mask: "4821",
      balanceUsd: 3412.18,
    });
    const accounts = listAccounts(db);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.balanceUsd).toBe(3412.18);
    db.close();
  });
});

describe("VS-1 obligations", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("rejects invalid due date", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-v1-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Test", holderDisplayName: "A" });
    expect(() =>
      createObligation(db, {
        payee: "PG&E",
        amountUsd: 100,
        dueDate: "06/28/2026",
      }),
    ).toThrow(/YYYY-MM-DD/);
    db.close();
  });

  it("marks obligation paid", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-v1-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Test", holderDisplayName: "A" });
    const ob = createObligation(db, {
      payee: "Water",
      amountUsd: 78,
      dueDate: "2026-06-18",
    });
    markObligationPaid(db, ob.id);
    const rows = listObligations(db);
    expect(rows.find((r) => r.id === ob.id)?.paidAt).not.toBeNull();
    db.close();
  });
});

describe("computeSolvencyForecast", () => {
  it("returns full runway when solvent for 30 days", () => {
    const accounts = [
      {
        id: "1",
        tenantId: "t",
        name: "Checking",
        institution: null,
        mask: null,
        kind: "checking" as const,
        balanceUsd: 10_000,
        provenance: "native" as const,
        syncStatus: "manual" as const,
        plaidAccountId: null,
        plaidItemId: null,
        lastSyncedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const obligations = [
      {
        id: "o1",
        tenantId: "t",
        payee: "Small bill",
        amountUsd: 50,
        cadence: "once" as const,
        dueDate: "2099-06-01",
        autopay: false,
        paidAt: null,
        provenance: "native" as const,
        notes: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const f = computeSolvencyForecast(accounts, obligations, 30);
    expect(f.runwayDays).toBe(30);
    expect(f.liquidBalanceUsd).toBe(10_000);
    expect(f.plannedIncomeUsd).toBe(0);
    expect(f.hasIncomeStreams).toBe(false);
  });

  it("detects insolvency within horizon", () => {
    const accounts = [
      {
        id: "1",
        tenantId: "t",
        name: "Checking",
        institution: null,
        mask: null,
        kind: "checking" as const,
        balanceUsd: 100,
        provenance: "native" as const,
        syncStatus: "manual" as const,
        plaidAccountId: null,
        plaidItemId: null,
        lastSyncedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const today = new Date();
    const due = today.toISOString().slice(0, 10);
    const obligations = [
      {
        id: "o1",
        tenantId: "t",
        payee: "Rent",
        amountUsd: 200,
        cadence: "once" as const,
        dueDate: due,
        autopay: false,
        paidAt: null,
        provenance: "native" as const,
        notes: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const f = computeSolvencyForecast(accounts, obligations, 30);
    expect(f.runwayDays).toBe(0);
    expect(f.series[0]!.balanceUsd).toBeLessThan(0);
  });

  it("does not treat credit balances as liquid runway (negative)", () => {
    const accounts = [
      {
        id: "1",
        tenantId: "t",
        name: "Checking",
        institution: null,
        mask: null,
        kind: "checking" as const,
        balanceUsd: 100,
        provenance: "native" as const,
        syncStatus: "manual" as const,
        plaidAccountId: null,
        plaidItemId: null,
        lastSyncedAt: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        tenantId: "t",
        name: "Visa",
        institution: null,
        mask: null,
        kind: "credit" as const,
        balanceUsd: 900,
        provenance: "native" as const,
        syncStatus: "manual" as const,
        plaidAccountId: null,
        plaidItemId: null,
        lastSyncedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ];
    const f = computeSolvencyForecast(accounts, [], 30);
    expect(f.liquidBalanceUsd).toBe(100);
  });

  it("expands monthly cadence", () => {
    const ob = {
      id: "o1",
      tenantId: "t",
      payee: "Netflix",
      amountUsd: 16,
      cadence: "monthly" as const,
      dueDate: "2026-01-15",
      autopay: true,
      paidAt: null,
      provenance: "native" as const,
      notes: null,
      createdAt: "",
      updatedAt: "",
    };
    const from = new Date(Date.UTC(2026, 5, 1));
    const to = new Date(Date.UTC(2026, 7, 31));
    const today = new Date(Date.UTC(2026, 5, 1));
    const occ = expandObligation(ob, from, to, today);
    expect(occ.some((o) => o.date === "2026-06-15")).toBe(true);
    expect(occ.some((o) => o.date === "2026-07-15")).toBe(true);
  });
});
