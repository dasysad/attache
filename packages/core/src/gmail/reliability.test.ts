import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { confirmBillIngest, listPendingBillReviews } from "../ingest/bill.js";
import { createDocumentAdapter } from "../ingest/fake-document-adapter.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import { FakeGmailAdapter } from "./fake-adapter.js";
import type { GmailIngestPort } from "./port.js";
import {
  connectSandboxGmail,
  getGmailAccount,
  listGmailAccounts,
  markGmailAccountError,
  unlinkGmailAccount,
} from "./store.js";
import { pollGmailIngest } from "./sync.js";

describe("slice 4 Gmail reliability", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-gmail-rel-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-gmail-rel-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault };
  }

  it("marks lastError on failed poll and retries error accounts", async () => {
    const { db, vault } = setup();
    const acct = connectSandboxGmail(db, vault);

    const broken: GmailIngestPort = {
      mode: "sandbox",
      fetchNewMessages: async () => {
        throw new Error("token revoked");
      },
    };
    const failed = await pollGmailIngest(db, vault, createDocumentAdapter(), broken);
    expect(failed.accountOutcomes[0]!.ok).toBe(false);
    expect(getGmailAccount(db, acct.id)!.status).toBe("error");
    expect(getGmailAccount(db, acct.id)!.lastError).toMatch(/token revoked/i);

    const recovered = await pollGmailIngest(
      db,
      vault,
      createDocumentAdapter(),
      new FakeGmailAdapter(),
    );
    expect(recovered.accountOutcomes[0]!.ok).toBe(true);
    expect(getGmailAccount(db, acct.id)!.status).toBe("active");
    expect(getGmailAccount(db, acct.id)!.lastError).toBeNull();
    expect(recovered.billsCreated).toBeGreaterThan(0);
    db.close();
  });

  it("unlinks account and clears vault (negative: unknown id)", async () => {
    const { db, vault } = setup();
    const acct = connectSandboxGmail(db, vault);
    expect(vault.get(acct.vaultCredentialRef)).toBeTruthy();

    const result = unlinkGmailAccount(db, acct.id, vault);
    expect(result.vaultCleared).toBe(true);
    expect(listGmailAccounts(db)).toHaveLength(0);
    expect(vault.get(acct.vaultCredentialRef)).toBeNull();

    expect(() => unlinkGmailAccount(db, "missing", vault)).toThrow(/not found/i);
    db.close();
  });

  it("poll → confirm creates obligation", async () => {
    const { db, vault } = setup();
    connectSandboxGmail(db, vault);
    await pollGmailIngest(db, vault, createDocumentAdapter(), new FakeGmailAdapter());
    const pending = listPendingBillReviews(db);
    expect(pending.length).toBeGreaterThan(0);
    const obligation = confirmBillIngest(db, pending[0]!.id);
    expect(obligation.provenance).toBe("email");
    expect(listPendingBillReviews(db)).toHaveLength(pending.length - 1);
    db.close();
  });

  it("markGmailAccountError stores message", () => {
    const { db, vault } = setup();
    const acct = connectSandboxGmail(db, vault);
    markGmailAccountError(db, acct.id, "ITEM_LOGIN_REQUIRED");
    expect(getGmailAccount(db, acct.id)!.lastError).toBe("ITEM_LOGIN_REQUIRED");
    db.close();
  });
});
