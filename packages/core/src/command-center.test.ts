import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { createAccount } from "./account.js";
import { createObligation } from "./obligation.js";
import { createTenant } from "./tenant.js";
import { createTransferProposal } from "./agent/transfer-queue.js";
import {
  buildAttention,
  collectAttention,
  commandCenterTotals,
  groupAccountsByKind,
  sumBrokerageUsd,
} from "./command-center.js";
import type { FundingAccountKind } from "./domain.js";
import { markSetupComplete } from "./setup.js";

describe("groupAccountsByKind", () => {
  it("orders liquid → brokerage → liabilities and skips empty kinds", () => {
    const groups = groupAccountsByKind([
      { kind: "brokerage", balanceUsd: 100, name: "Broker" },
      { kind: "checking", balanceUsd: 50, name: "Chk" },
      { kind: "checking", balanceUsd: 25, name: "Chk 2" },
      { kind: "credit", balanceUsd: 200, name: "Visa" },
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["checking", "brokerage", "credit"]);
    expect(groups[0]!.subtotalUsd).toBe(75);
    expect(groups[2]!.label).toBe("Credit cards");
  });

  it("puts unknown kinds in Other so they never vanish (negative)", () => {
    const groups = groupAccountsByKind([
      { kind: "foo" as FundingAccountKind, balanceUsd: 9, name: "Mystery" },
    ]);
    expect(groups).toEqual([
      {
        kind: "other",
        label: "Other",
        accounts: [{ kind: "foo", balanceUsd: 9, name: "Mystery" }],
        subtotalUsd: 9,
      },
    ]);
  });

  it("returns [] for no accounts (negative)", () => {
    expect(groupAccountsByKind([])).toEqual([]);
  });
});

describe("sumBrokerageUsd", () => {
  it("sums only brokerage", () => {
    expect(
      sumBrokerageUsd([
        { balanceUsd: 10, kind: "checking" },
        { balanceUsd: 40, kind: "brokerage" },
        { balanceUsd: 5, kind: "brokerage" },
      ]),
    ).toBe(45);
  });

  it("is 0 when none are brokerage (negative)", () => {
    expect(sumBrokerageUsd([{ balanceUsd: 100, kind: "checking" }])).toBe(0);
    expect(sumBrokerageUsd([])).toBe(0);
  });
});

describe("buildAttention", () => {
  const empty: Parameters<typeof buildAttention>[0] = {
    overdueUsd: 0,
    pendingTransfers: 0,
    pendingBillReviews: 0,
    pendingAssetHints: 0,
    syncErrorAccounts: [],
    achPending: 0,
  };

  it("returns nothing when the household is healthy (negative)", () => {
    expect(buildAttention(empty)).toEqual([]);
  });

  it("does not fire on zero overdue even if other counts are absent (negative)", () => {
    expect(buildAttention({ ...empty, overdueUsd: 0 }).map((i) => i.id)).toEqual([]);
  });

  it("orders overdue → HITL → ACH → ingest → sync", () => {
    const items = buildAttention({
      overdueUsd: 12.5,
      pendingTransfers: 2,
      pendingBillReviews: 1,
      pendingAssetHints: 0,
      syncErrorAccounts: [{ name: "Chase" }],
      achPending: 1,
    });
    expect(items.map((i) => i.id)).toEqual([
      "overdue",
      "hitl",
      "ach_pending",
      "ingest_review",
      "sync_error",
    ]);
    expect(items[0]!.cliHint).toMatch(/obligations/);
    expect(items[1]!.href).toBe("/app/transfers");
    expect(items[4]!.body).toMatch(/Chase/);
  });

  it("singular copy for a single pending transfer", () => {
    const [item] = buildAttention({ ...empty, pendingTransfers: 1 });
    expect(item!.body).toMatch(/1 proposal waiting/);
    expect(item!.body).not.toMatch(/proposals/);
  });

  it("surfaces unconfirmed home/vehicle hints without inventing a value (negative)", () => {
    const [item] = buildAttention({ ...empty, pendingAssetHints: 2 });
    expect(item!.id).toBe("asset_hint");
    expect(item!.cliHint).toMatch(/ingest discover/);
    expect(item!.body).not.toMatch(/\$/);
  });
});

describe("collectAttention", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-cc-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "H", holderDisplayName: "A" });
    markSetupComplete(db);
    return { db };
  }

  it("is empty on a solvent household with no queues", () => {
    const { db } = setup();
    createAccount(db, { name: "Checking", balanceUsd: 5000 });
    expect(collectAttention(db)).toEqual([]);
    db.close();
  });

  it("surfaces overdue bills from the live forecast", () => {
    const { db } = setup();
    createAccount(db, { name: "Checking", balanceUsd: 5000 });
    createObligation(db, {
      payee: "Power Co",
      amountUsd: 80,
      dueDate: "2000-01-01",
      cadence: "once",
    });
    const items = collectAttention(db);
    expect(items.map((i) => i.id)).toContain("overdue");
    expect(items.find((i) => i.id === "overdue")!.body).toMatch(/80/);
    db.close();
  });

  it("surfaces pending HITL proposals", () => {
    const { db } = setup();
    const from = createAccount(db, { name: "Checking", balanceUsd: 5000 });
    createTransferProposal(db, {
      fromAccountId: from.id,
      amountUsd: 10,
      proposedBy: "cli",
    });
    expect(collectAttention(db).map((i) => i.id)).toContain("hitl");
    db.close();
  });

  it("surfaces sync errors without inventing HITL (negative)", () => {
    const { db } = setup();
    const acct = createAccount(db, { name: "Chase Checking", balanceUsd: 100 });
    db.prepare(`UPDATE funding_account SET sync_status = 'error' WHERE id = ?`).run(acct.id);
    const ids = collectAttention(db).map((i) => i.id);
    expect(ids).toEqual(["sync_error"]);
    expect(ids).not.toContain("hitl");
    db.close();
  });
});

describe("commandCenterTotals", () => {
  it("keeps brokerage out of liquid", () => {
    const totals = commandCenterTotals(
      [
        { balanceUsd: 100, kind: "checking" },
        { balanceUsd: 400, kind: "brokerage" },
      ],
      { liquidBalanceUsd: 100 },
    );
    expect(totals.liquidUsd).toBe(100);
    expect(totals.brokerageUsd).toBe(400);
    expect(totals.accountCount).toBe(2);
  });
});
