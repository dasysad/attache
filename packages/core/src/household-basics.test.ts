/**
 * Setup coverage + members + income streams (UI P4+).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "./account.js";
import { computeCashflow } from "./cashflow.js";
import { collectAttention } from "./command-center.js";
import { openDatabase } from "./db.js";
import { computeSolvencyForecast } from "./forecast.js";
import {
  createIncomeStream,
  deleteIncomeStream,
  listIncomeStreams,
} from "./income-stream.js";
import { addMember, listMembers, removeMember } from "./member.js";
import { createObligation, listObligations } from "./obligation.js";
import { markSetupComplete } from "./setup.js";
import { getSetupCoverage } from "./setup-coverage.js";
import { createTenant } from "./tenant.js";

describe("household basics (UI P4+)", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-basics-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "Alex" });
    return { db };
  }

  it("setup coverage lists gaps after onboard (negative: empty accounts)", () => {
    const { db } = setup();
    const cov = getSetupCoverage(db);
    expect(cov.onboarded).toBe(true);
    expect(cov.items.find((i) => i.id === "people")!.satisfied).toBe(true);
    expect(cov.items.find((i) => i.id === "accounts")!.satisfied).toBe(false);
    expect(cov.gaps.some((g) => g.id === "accounts")).toBe(true);
    db.close();
  });

  it("attention includes setup gaps while wizard unfinished", () => {
    const { db } = setup();
    // Do not markSetupComplete — gaps should surface.
    const items = collectAttention(db);
    expect(items.some((i) => i.id.startsWith("setup_"))).toBe(true);
    markSetupComplete(db);
    expect(collectAttention(db).some((i) => i.id.startsWith("setup_"))).toBe(
      false,
    );
    db.close();
  });

  it("members: add partner; refuse removing only holder (negative)", () => {
    const { db } = setup();
    const partner = addMember(db, { displayName: "Jordan", kind: "partner" });
    expect(listMembers(db)).toHaveLength(2);
    expect(partner.authLevel).toBe("none");
    expect(() =>
      addMember(db, { displayName: "X", kind: "account_holder" }),
    ).toThrow(/onboard/);
    const holder = listMembers(db).find((m) => m.kind === "account_holder")!;
    expect(() => removeMember(db, holder.id)).toThrow(/only account holder/);
    removeMember(db, partner.id);
    expect(listMembers(db)).toHaveLength(1);
    db.close();
  });

  it("income stream creates and improves runway", () => {
    const { db } = setup();
    createAccount(db, { name: "Checking", balanceUsd: 500 });
    const today = new Date().toISOString().slice(0, 10);
    createObligation(db, {
      payee: "Rent",
      amountUsd: 2000,
      dueDate: today,
      cadence: "once",
    });
    const accounts = listAccounts(db);
    const obligations = listObligations(db);
    const without = computeSolvencyForecast(accounts, obligations, 30, []);
    createIncomeStream(db, {
      label: "Payroll",
      amountUsd: 5000,
      cadence: "monthly",
      nextDate: today,
    });
    const withInc = computeSolvencyForecast(
      accounts,
      obligations,
      30,
      listIncomeStreams(db),
    );
    expect(withInc.runwayDays).toBeGreaterThan(without.runwayDays);
    const cf = computeCashflow(db);
    expect(cf.plannedIncomeUsd).toBeGreaterThan(0);
    deleteIncomeStream(db, listIncomeStreams(db)[0]!.id);
    expect(listIncomeStreams(db)).toHaveLength(0);
    db.close();
  });

  it("rejects bad income (negative)", () => {
    const { db } = setup();
    expect(() =>
      createIncomeStream(db, {
        label: "x",
        amountUsd: -1,
        nextDate: "2026-09-01",
      }),
    ).toThrow(/positive/);
    expect(() =>
      createIncomeStream(db, {
        label: "x",
        amountUsd: 10,
        nextDate: "nope",
      }),
    ).toThrow(/YYYY-MM-DD/);
    db.close();
  });
});
