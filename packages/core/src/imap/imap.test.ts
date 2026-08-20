import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { isLikelyBillEmail } from "./filter.js";
import { FakeImapAdapter } from "./fake-adapter.js";
import { connectImapAccount, listImapAccounts, unlinkImapAccount } from "./store.js";
import { pollImapIngest } from "./sync.js";
import type { ImapIngestPort } from "./port.js";
import { createDocumentAdapter } from "../ingest/fake-document-adapter.js";
import { listPendingBillReviews } from "../ingest/bill.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";

describe("VS-4.2 IMAP ingest", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-imap-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-imap-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault };
  }

  it("filters bill-like subjects", () => {
    expect(
      isLikelyBillEmail({
        subject: "Your PG&E bill is ready",
        from: "billing@pge.com",
        bodyText: "",
        attachmentMimeTypes: [],
      }),
    ).toBe(true);
    expect(
      isLikelyBillEmail({
        subject: "Team lunch photos",
        from: "friend@example.com",
        bodyText: "fun day",
        attachmentMimeTypes: ["image/jpeg"],
      }),
    ).toBe(false);
    expect(
      isLikelyBillEmail({
        subject: "This week's deals — 20% off",
        from: "deals@shop.example",
        bodyText: "Unsubscribe",
        attachmentMimeTypes: ["text/plain"],
      }),
    ).toBe(false);
    expect(
      isLikelyBillEmail({
        subject: "Your explanation of benefits is ready",
        from: "eob@healthplan.example",
        bodyText: "Patient ID 1 — claim processed",
        attachmentMimeTypes: ["application/pdf"],
      }),
    ).toBe(false);
  });

  it("connects imap account with vault password", () => {
    const { db, vault } = setup();
    const acct = connectImapAccount(db, vault, {
      host: "imap.gmail.com",
      username: "me@gmail.com",
      password: "app-password",
      label: "Gmail",
    });
    expect(acct.host).toBe("imap.gmail.com");
    expect(vault.get(acct.vaultCredentialRef)).toBe("app-password");
    expect(listImapAccounts(db)).toHaveLength(1);
    db.close();
  });

  it("polls sandbox imap and queues bill for review", async () => {
    const { db, vault } = setup();
    connectImapAccount(db, vault, {
      host: "imap.sandbox.local",
      username: "user@sandbox.local",
      password: "secret",
    });
    process.env.ATTACHE_IMAP_MODE = "sandbox";
    const result = await pollImapIngest(
      db,
      vault,
      createDocumentAdapter(),
      new FakeImapAdapter(),
    );
    expect(result.accountsPolled).toBe(1);
    expect(result.billsCreated).toBe(1);
    expect(listPendingBillReviews(db)).toHaveLength(1);
    delete process.env.ATTACHE_IMAP_MODE;
    db.close();
  });

  it("advances uid cursor on successive polls", async () => {
    const { db, vault } = setup();
    connectImapAccount(db, vault, {
      host: "imap.sandbox.local",
      username: "user2@sandbox.local",
      password: "secret",
    });
    const adapter = new FakeImapAdapter();
    const doc = createDocumentAdapter();
    await pollImapIngest(db, vault, doc, adapter);
    expect(listImapAccounts(db)[0]!.lastUid).toBe(1);
    await pollImapIngest(db, vault, doc, adapter);
    expect(listImapAccounts(db)[0]!.lastUid).toBe(2);
    expect(listPendingBillReviews(db).length).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it("records lastError on poll failure then recovers on retry", async () => {
    const { db, vault } = setup();
    const acct = connectImapAccount(db, vault, {
      host: "imap.sandbox.local",
      username: "err@sandbox.local",
      password: "secret",
    });
    const broken: ImapIngestPort = {
      mode: "sandbox",
      fetchNewMessages: async () => {
        throw new Error("auth failed");
      },
    };
    const failed = await pollImapIngest(db, vault, createDocumentAdapter(), broken);
    expect(failed.accountOutcomes[0]!.ok).toBe(false);
    expect(listImapAccounts(db)[0]!.status).toBe("error");
    expect(listImapAccounts(db)[0]!.lastError).toMatch(/auth failed/i);

    const ok = await pollImapIngest(
      db,
      vault,
      createDocumentAdapter(),
      new FakeImapAdapter(),
    );
    expect(ok.accountOutcomes[0]!.ok).toBe(true);
    expect(listImapAccounts(db)[0]!.status).toBe("active");
    expect(listImapAccounts(db)[0]!.lastError).toBeNull();
    expect(acct.id).toBeTruthy();
    db.close();
  });

  it("unlinks imap account and vault password", () => {
    const { db, vault } = setup();
    const acct = connectImapAccount(db, vault, {
      host: "imap.sandbox.local",
      username: "gone@sandbox.local",
      password: "secret",
    });
    const result = unlinkImapAccount(db, acct.id, vault);
    expect(result.vaultCleared).toBe(true);
    expect(listImapAccounts(db)).toHaveLength(0);
    expect(vault.get(acct.vaultCredentialRef)).toBeNull();
    expect(() => unlinkImapAccount(db, "missing", vault)).toThrow(/not found/i);
    db.close();
  });
});
