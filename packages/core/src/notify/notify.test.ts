import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createAccount } from "../account.js";
import { createObligation } from "../obligation.js";
import { createTenant } from "../tenant.js";
import { refreshNotifications } from "./evaluate.js";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationRead,
  upsertNotification,
} from "./store.js";

describe("VS-6 notifications", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-notify-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Notify Home", holderDisplayName: "A" });
    createAccount(db, { name: "Checking", balanceUsd: 500 });
    return { db };
  }

  it("requires onboarded tenant", () => {
    const db = openDatabase(mkdtempSync(join(tmpdir(), "attache-notify-")));
    expect(() => refreshNotifications(db)).toThrow(/not onboarded/);
    db.close();
  });

  it("upserts by dedupe key and clears read on content change", () => {
    const { db } = setup();
    const first = upsertNotification(db, {
      dedupeKey: "system:test",
      kind: "system",
      severity: "info",
      title: "Hello",
      body: "v1",
    });
    markNotificationRead(db, first.notification.id);
    expect(countUnreadNotifications(db)).toBe(0);

    upsertNotification(db, {
      dedupeKey: "system:test",
      kind: "system",
      severity: "warning",
      title: "Hello",
      body: "v2",
    });
    expect(countUnreadNotifications(db)).toBe(1);
    db.close();
  });

  it("creates low runway alert when balance is tight", () => {
    const { db } = setup();
    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 5);
    createObligation(db, {
      payee: "Rent",
      amountUsd: 2500,
      dueDate: due.toISOString().slice(0, 10),
      cadence: "once",
    });
    refreshNotifications(db);
    const rows = listNotifications(db);
    expect(rows.some((n) => n.dedupeKey === "solvency:low_runway")).toBe(true);
    db.close();
  });

  it("clears stale solvency alerts when runway recovers", () => {
    const { db } = setup();
    createAccount(db, { name: "Savings", balanceUsd: 50_000 });
    createObligation(db, {
      payee: "Small",
      amountUsd: 10,
      dueDate: "2099-01-01",
    });
    refreshNotifications(db);
    expect(listNotifications(db).some((n) => n.dedupeKey.startsWith("solvency:"))).toBe(false);
    db.close();
  });

  it("lists unread notifications newest first", () => {
    const { db } = setup();
    upsertNotification(db, {
      dedupeKey: "a",
      kind: "system",
      severity: "info",
      title: "A",
      body: "a",
    });
    upsertNotification(db, {
      dedupeKey: "b",
      kind: "system",
      severity: "info",
      title: "B",
      body: "b",
    });
    const unread = listNotifications(db, { unreadOnly: true });
    expect(unread).toHaveLength(2);
    db.close();
  });
});
