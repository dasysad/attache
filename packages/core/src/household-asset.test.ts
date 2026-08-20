import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAccounts } from "./account.js";
import { openDatabase } from "./db.js";
import { createDocumentAdapter } from "./ingest/fake-document-adapter.js";
import { confirmBillIngest } from "./ingest/bill.js";
import { discoverMailCandidates } from "./ingest/discover.js";
import { listObligations } from "./obligation.js";
import { createTenant } from "./tenant.js";
import { LocalVaultPort, setVaultForTests } from "./vault/local-vault.js";
import {
  confirmAssetHint,
  createHouseholdAsset,
  deleteHouseholdAsset,
  listHouseholdAssets,
} from "./household-asset.js";
import { computeNetWorth } from "./net-worth.js";

describe("household assets ADR-015 P4", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-asset-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-asset-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault, adapter: createDocumentAdapter() };
  }

  it("manual create is unvalued until an estimate is set; $0 is not invented (negative)", () => {
    const { db } = setup();
    const home = createHouseholdAsset(db, { kind: "home", label: "123 Main" });
    expect(home.estimatedUsd).toBeNull();
    expect(home.ingestedEventId).toBeNull();
    const snap = computeNetWorth([], listHouseholdAssets(db));
    expect(snap.otherAssetsUsd).toBe(0);
    expect(snap.unvaluedAssetCount).toBe(1);
    expect(snap.netWorthUsd).toBe(0);
    expect(() => createHouseholdAsset(db, { kind: "boat", label: "x" })).toThrow(
      /home or vehicle/,
    );
    db.close();
  });

  it("sandbox discover hints home+vehicle without inserting assets; PHI is absent", async () => {
    const { db, vault, adapter } = setup();
    const result = await discoverMailCandidates(db, vault, adapter, { sandbox: true });
    expect(listHouseholdAssets(db)).toHaveLength(0);
    expect(listAccounts(db)).toHaveLength(0);
    expect(listObligations(db)).toHaveLength(0);

    const home = result.candidates.find((c) => c.assetHint?.kind === "home");
    const vehicle = result.candidates.find((c) => c.assetHint?.kind === "vehicle");
    expect(home?.action).toBe("confirm_bill");
    expect(vehicle?.action).toBe("confirm_bill");
    expect(result.message).toMatch(/assets confirm/);
    expect(result.candidates.some((c) => /eob|patient/i.test(c.payee ?? ""))).toBe(
      false,
    );

    const statement = result.candidates.find((c) => c.action === "connect_plaid")!;
    expect(() => confirmAssetHint(db, statement.eventId)).toThrow(/connect hint/);

    const asset = confirmAssetHint(db, home!.eventId);
    expect(asset.kind).toBe("home");
    expect(asset.estimatedUsd).toBeNull();
    expect(listHouseholdAssets(db)).toHaveLength(1);
    expect(() => confirmAssetHint(db, home!.eventId)).toThrow(/already confirmed/);

    const billStill = confirmBillIngest(db, home!.eventId);
    expect(billStill.payee).toMatch(/tax/i);
    expect(listObligations(db)).toHaveLength(1);

    const valued = createHouseholdAsset(db, {
      kind: "vehicle",
      label: "Civic",
      estimatedUsd: 8000,
    });
    expect(valued.estimatedUsd).toBe(8000);
    const nw = computeNetWorth([], listHouseholdAssets(db));
    expect(nw.otherAssetsUsd).toBe(8000);
    expect(nw.unvaluedAssetCount).toBe(1);
    expect(nw.netWorthUsd).toBe(8000);

    deleteHouseholdAsset(db, valued.id);
    expect(listHouseholdAssets(db)).toHaveLength(1);
    db.close();
  });
});
