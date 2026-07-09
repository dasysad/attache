import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { listPendingBillReviews } from "../ingest/bill.js";
import { createDocumentAdapter } from "../ingest/fake-document-adapter.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import { FakeGmailAdapter } from "./fake-adapter.js";
import {
  connectSandboxGmail,
  createGmailOAuthState,
  consumeGmailOAuthState,
  listGmailAccounts,
} from "./store.js";
import { pollGmailIngest } from "./sync.js";

describe("VS-4.3 Gmail OAuth ingest", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-gmail-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-gmail-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault };
  }

  it("oauth state is single-use", () => {
    const { db } = setup();
    const state = createGmailOAuthState(db);
    expect(consumeGmailOAuthState(db, state)).toBe(true);
    expect(consumeGmailOAuthState(db, state)).toBe(false);
    db.close();
  });

  it("connects sandbox gmail with vault tokens", () => {
    const { db, vault } = setup();
    const acct = connectSandboxGmail(db, vault);
    expect(acct.email).toBe("sandbox@gmail.com");
    expect(listGmailAccounts(db)).toHaveLength(1);
    db.close();
  });

  it("polls sandbox gmail and queues bill", async () => {
    const { db, vault } = setup();
    connectSandboxGmail(db, vault);
    const result = await pollGmailIngest(db, vault, createDocumentAdapter(), new FakeGmailAdapter());
    expect(result.billsCreated).toBe(1);
    expect(listPendingBillReviews(db)).toHaveLength(1);
    db.close();
  });
});
