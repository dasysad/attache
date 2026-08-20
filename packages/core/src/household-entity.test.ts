import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount } from "./account.js";
import { openDatabase } from "./db.js";
import { createObligation } from "./obligation.js";
import { listHouseholdEntities } from "./household-entity.js";
import { createTenant } from "./tenant.js";

describe("household entities ADR-015 P4", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("is empty without payees or institutions (negative)", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-entity-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    expect(listHouseholdEntities(db)).toEqual([]);
    db.close();
  });

  it("projects obligation payees and account institutions — not a CRM", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-entity-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    createObligation(db, {
      payee: "County Tax Collector",
      amountUsd: 10,
      dueDate: "2099-01-01",
    });
    createObligation(db, {
      payee: "County Tax Collector",
      amountUsd: 11,
      dueDate: "2099-02-01",
    });
    createAccount(db, {
      name: "Checking",
      institution: "Chase",
      balanceUsd: 1,
    });
    const rows = listHouseholdEntities(db);
    expect(rows.find((e) => e.kind === "payee")?.obligationCount).toBe(2);
    expect(rows.some((e) => e.kind === "institution" && e.name === "Chase")).toBe(
      true,
    );
    expect(rows.every((e) => e.kind === "payee" || e.kind === "institution")).toBe(
      true,
    );
    db.close();
  });
});
