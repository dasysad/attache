import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "./account.js";
import {
  computeCashflow,
  computeCashflowTrend,
  defaultCashflowRange,
  priorCashflowRange,
} from "./cashflow.js";
import { openDatabase } from "./db.js";
import { upsertBankTransaction, setTransactionCategory } from "./plaid/store.js";
import { createTenant } from "./tenant.js";

describe("computeCashflow", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-cf-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "H", holderDisplayName: "A" });
    const acct = createAccount(db, { name: "Checking", balanceUsd: 1000 });
    return { db, acct };
  }

  it("returns empty buckets when there are no posted txs (negative)", () => {
    const { db } = setup();
    const report = computeCashflow(db, { fromDate: "2026-01-01", toDate: "2026-01-31" });
    expect(report.buckets).toEqual([]);
    expect(report.inflowUsd).toBe(0);
    expect(report.outflowUsd).toBe(0);
    expect(report.uncategorizedCount).toBe(0);
    db.close();
  });

  it("excludes pending and buckets uncategorized spend", () => {
    const { db, acct } = setup();
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "tx-groc",
      payee: "WFM",
      amountUsd: -40,
      postedDate: "2026-08-10",
      pending: false,
      category: "Groceries",
    });
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "tx-pay",
      payee: "Payroll",
      amountUsd: 200,
      postedDate: "2026-08-11",
      pending: false,
      category: "Income",
    });
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "tx-unk",
      payee: "Mystery",
      amountUsd: -15,
      postedDate: "2026-08-12",
      pending: false,
    });
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "tx-pend",
      payee: "Uber",
      amountUsd: -9,
      postedDate: "2026-08-13",
      pending: true,
      category: "Transport",
    });

    const report = computeCashflow(db, { fromDate: "2026-08-01", toDate: "2026-08-31" });
    expect(report.buckets.map((b) => b.category)).toEqual([
      "Groceries",
      "(uncategorized)",
      "Income",
    ]);
    expect(report.outflowUsd).toBe(55);
    expect(report.inflowUsd).toBe(200);
    expect(report.netUsd).toBe(145);
    expect(report.uncategorizedCount).toBe(1);
    expect(report.buckets.find((b) => b.category === "Transport")).toBeUndefined();
    db.close();
  });

  it("rejects malformed dates (negative)", () => {
    const { db } = setup();
    expect(() => computeCashflow(db, { fromDate: "yesterday" })).toThrow(/YYYY-MM-DD/);
    expect(() => computeCashflow(db, { toDate: "08/15/2026" })).toThrow(/YYYY-MM-DD/);
    db.close();
  });

  it("rejects inverted ranges (negative)", () => {
    const { db } = setup();
    expect(() =>
      computeCashflow(db, { fromDate: "2026-08-15", toDate: "2026-08-01" }),
    ).toThrow(/on or after/);
    db.close();
  });
});

describe("priorCashflowRange + computeCashflowTrend", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-cft-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "H", holderDisplayName: "A" });
    const acct = createAccount(db, { name: "Checking", balanceUsd: 1000 });
    return { db, acct };
  }

  it("prior window is equal length and does not overlap", () => {
    expect(priorCashflowRange("2026-07-17", "2026-08-15")).toEqual({
      fromDate: "2026-06-17",
      toDate: "2026-07-16",
    });
  });

  it("rejects inverted prior range (negative)", () => {
    expect(() => priorCashflowRange("2026-08-15", "2026-08-01")).toThrow(/on or after/);
  });

  it("returns empty series and categories when both windows are empty (negative)", () => {
    const { db } = setup();
    const trend = computeCashflowTrend(db, {
      fromDate: "2026-08-01",
      toDate: "2026-08-10",
    });
    expect(trend.series).toEqual([]);
    expect(trend.categories).toEqual([]);
    expect(trend.outflowDeltaUsd).toBe(0);
    expect(trend.prior.fromDate).toBe("2026-07-22");
    expect(trend.prior.toDate).toBe("2026-07-31");
    db.close();
  });

  it("compares grocery spend across windows and fills daily zeros", () => {
    const { db, acct } = setup();
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "prior-groc",
      payee: "WFM",
      amountUsd: -10,
      postedDate: "2026-07-25",
      pending: false,
      category: "Groceries",
    });
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "curr-groc",
      payee: "WFM",
      amountUsd: -40,
      postedDate: "2026-08-05",
      pending: false,
      category: "Groceries",
    });
    upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "curr-shop",
      payee: "Target",
      amountUsd: -5,
      postedDate: "2026-08-05",
      pending: false,
      category: "Shopping",
    });

    const trend = computeCashflowTrend(db, {
      fromDate: "2026-08-01",
      toDate: "2026-08-10",
    });
    expect(trend.current.outflowUsd).toBe(45);
    expect(trend.prior.outflowUsd).toBe(10);
    expect(trend.outflowDeltaUsd).toBe(35);
    const groc = trend.categories.find((c) => c.category === "Groceries")!;
    expect(groc.deltaUsd).toBe(30);
    expect(groc.deltaPct).toBe(3);
    const shop = trend.categories.find((c) => c.category === "Shopping")!;
    expect(shop.priorOutflowUsd).toBe(0);
    expect(shop.deltaPct).toBeNull();
    expect(trend.series).toHaveLength(10);
    expect(trend.series[4]).toEqual({
      date: "2026-08-05",
      inflowUsd: 0,
      outflowUsd: 45,
    });
    expect(trend.series[0]!.outflowUsd).toBe(0);
    db.close();
  });
});

describe("setTransactionCategory", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("sets, clears, and rejects unknown ids (negative)", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-cat-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "H", holderDisplayName: "A" });
    const acct = createAccount(db, { name: "Checking", balanceUsd: 10 });
    const tx = upsertBankTransaction(db, {
      fundingAccountId: acct.id,
      externalId: "tx-1",
      payee: "Store",
      amountUsd: -5,
      postedDate: "2026-08-01",
      pending: false,
      category: "Shopping",
    });
    expect(setTransactionCategory(db, tx.id, "Groceries").category).toBe("Groceries");
    expect(setTransactionCategory(db, tx.id, "  ").category).toBeNull();
    expect(() => setTransactionCategory(db, "missing", "X")).toThrow(/not found/);
    db.close();
  });
});
