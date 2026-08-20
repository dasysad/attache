/**
 * ADR-017 P0: typed transfer rules — create, caps, evaluate → HITL/auto.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "../account.js";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { listTransferProposals } from "./transfer-queue.js";
import {
  createTransferRule,
  disableTransferRule,
  listTransferRules,
  listTransferRuleRuns,
} from "./transfer-rule-store.js";
import { evaluateTransferRules } from "./transfer-rules.js";

describe("ADR-017 transfer rules", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-rules-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Rules", holderDisplayName: "A" });
    const checking = createAccount(db, {
      name: "Checking",
      balanceUsd: 5000,
    });
    const savings = createAccount(db, {
      name: "Savings",
      balanceUsd: 100,
    });
    return { db, checking, savings };
  }

  it("requires onboard (negative)", () => {
    const db = openDatabase(mkdtempSync(join(tmpdir(), "attache-rules-empty-")));
    expect(() =>
      createTransferRule(db, {
        name: "x",
        fromAccountId: "a",
        toAccountId: "b",
        amountUsd: 1,
      }),
    ).toThrow(/not onboarded/);
    db.close();
  });

  it("rejects same from/to and amount over maxPerRun (negative)", () => {
    const { db, checking } = setup();
    expect(() =>
      createTransferRule(db, {
        name: "bad",
        fromAccountId: checking.id,
        toAccountId: checking.id,
        amountUsd: 10,
      }),
    ).toThrow(/differ/);
    expect(() =>
      createTransferRule(db, {
        name: "over",
        fromAccountId: checking.id,
        toAccountId: createAccount(db, { name: "S2", balanceUsd: 0 }).id,
        amountUsd: 100,
        maxPerRunUsd: 50,
      }),
    ).toThrow(/maxPerRunUsd/);
    db.close();
  });

  it("evaluate proposes once per month; second evaluate skips (negative)", async () => {
    const { db, checking, savings } = setup();
    const rule = createTransferRule(db, {
      name: "Sweep",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 200,
      maxPerRunUsd: 500,
      maxPerMonthUsd: 1000,
      autonomy: "proposal",
    });

    const first = await evaluateTransferRules(db, {
      now: new Date("2026-08-15T12:00:00Z"),
    });
    expect(first.runs).toHaveLength(1);
    expect(first.runs[0]!.outcome).toBe("proposed");
    expect(first.runs[0]!.proposalId).toBeTruthy();
    expect(listTransferProposals(db, { status: "pending" })).toHaveLength(1);

    const second = await evaluateTransferRules(db, {
      now: new Date("2026-08-20T12:00:00Z"),
    });
    expect(second.runs[0]!.outcome).toBe(
      first.runs[0]!.outcome,
    ); // same persisted run
    expect(listTransferProposals(db, { status: "pending" })).toHaveLength(1);
    expect(listTransferRuleRuns(db, rule.id)).toHaveLength(1);
    db.close();
  });

  it("balance_above does not burn the month when trigger misses (negative)", async () => {
    const { db, checking, savings } = setup();
    createTransferRule(db, {
      name: "High water",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 50,
      thresholdUsd: 10_000,
      autonomy: "proposal",
    });

    const miss = await evaluateTransferRules(db, {
      now: new Date("2026-08-15T12:00:00Z"),
    });
    expect(miss.runs[0]!.outcome).toBe("skipped");
    expect(miss.runs[0]!.message).toMatch(/Trigger not matched/);
    expect(listTransferRuleRuns(db)).toHaveLength(0);

    // Raise balance via a new account threshold on checking — bump balance
    // by creating rule against current balance: update isn't exported; use
    // always-trigger after disable of miss rule.
    disableTransferRule(db, listTransferRules(db)[0]!.id);
    createTransferRule(db, {
      name: "Always",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 50,
      autonomy: "proposal",
    });
    const hit = await evaluateTransferRules(db, {
      now: new Date("2026-08-15T12:00:00Z"),
    });
    expect(hit.runs.some((r) => r.outcome === "proposed")).toBe(true);
    db.close();
  });

  it("autonomy=auto executes manual sweep via ledger", async () => {
    const { db, checking, savings } = setup();
    createTransferRule(db, {
      name: "Auto sweep",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 100,
      autonomy: "auto",
    });
    const result = await evaluateTransferRules(db, {
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(result.runs[0]!.outcome).toBe("executed");
    expect(getAccountBalance(db, checking.id)).toBe(4900);
    expect(getAccountBalance(db, savings.id)).toBe(200);
    db.close();
  });

  it("disabled rules are ignored (negative)", async () => {
    const { db, checking, savings } = setup();
    const rule = createTransferRule(db, {
      name: "Off",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 10,
    });
    disableTransferRule(db, rule.id);
    const result = await evaluateTransferRules(db);
    expect(result.evaluated).toBe(0);
    expect(result.runs).toEqual([]);
    db.close();
  });

  it("CEL when false skips without burning the month", async () => {
    const { db, checking, savings } = setup();
    createTransferRule(db, {
      name: "Guarded",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 50,
      whenCel: "liquidBalanceUsd < 100.0",
    });
    const miss = await evaluateTransferRules(db, {
      now: new Date("2026-10-01T00:00:00Z"),
    });
    expect(miss.runs[0]!.outcome).toBe("skipped");
    expect(miss.runs[0]!.message).toMatch(/CEL when/);
    expect(listTransferRuleRuns(db)).toHaveLength(0);

    createTransferRule(db, {
      name: "Guarded ok",
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 25,
      whenCel: "liquidBalanceUsd >= 1000.0 && runwayDays > 7",
    });
    const hit = await evaluateTransferRules(db, {
      now: new Date("2026-10-01T00:00:00Z"),
    });
    expect(hit.runs.some((r) => r.outcome === "proposed")).toBe(true);
    db.close();
  });

  it("rejects bad whenCel at create (negative)", () => {
    const { db, checking, savings } = setup();
    expect(() =>
      createTransferRule(db, {
        name: "bad cel",
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amountUsd: 10,
        whenCel: "x === 1",
      }),
    ).toThrow(/==/);
    db.close();
  });
});

function getAccountBalance(db: import("better-sqlite3").Database, id: string): number {
  const row = db
    .prepare(`SELECT balance_usd FROM funding_account WHERE id = ?`)
    .get(id) as { balance_usd: number };
  return row.balance_usd;
}
