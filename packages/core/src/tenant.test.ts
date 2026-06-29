import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { getOrCreateSiteId } from "./peer.js";
import { createTenant, getTenant, isOnboarded } from "./tenant.js";

describe("tenant VS-0", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("persists stable site_id across opens", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-test-"));
    const db1 = openDatabase(dataDir);
    const a = getOrCreateSiteId(db1);
    db1.close();
    const db2 = openDatabase(dataDir);
    const b = getOrCreateSiteId(db2);
    db2.close();
    expect(a).toBe(b);
  });

  it("creates tenant with ledger primary site", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-test-"));
    const db = openDatabase(dataDir);
    const { tenant, siteId } = createTenant(db, {
      householdName: "Klaus Household",
      holderDisplayName: "Jeremy",
    });
    expect(tenant.name).toBe("Klaus Household");
    expect(tenant.ledgerPrimarySiteId).toBe(siteId);
    expect(isOnboarded(db)).toBe(true);
    expect(getTenant(db)?.id).toBe(tenant.id);
    db.close();
  });

  it("refuses second tenant on same install", () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-test-"));
    const db = openDatabase(dataDir);
    createTenant(db, {
      householdName: "A",
      holderDisplayName: "A",
    });
    expect(() =>
      createTenant(db, { householdName: "B", holderDisplayName: "B" }),
    ).toThrow(/already exists/);
    db.close();
  });
});
