import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAccounts } from "../account.js";
import { openDatabase } from "../db.js";
import { confirmBillIngest, listPendingBillReviews } from "./bill.js";
import { createDocumentAdapter, parseTextDocument } from "./fake-document-adapter.js";
import {
  clampDiscoverBounds,
  DISCOVER_MAX_LIMIT,
  DISCOVER_MAX_LOOKBACK_DAYS,
  DiscoverError,
  discoverMailCandidates,
  formatDiscoverMessage,
  listDiscoverCandidates,
  listUnsatisfiedConnectHints,
  unsatisfiedConnectHints,
} from "./discover.js";
import { FakeGmailAdapter } from "../gmail/fake-adapter.js";
import { connectSandboxGmail } from "../gmail/store.js";
import { isLikelyBillEmail } from "../imap/filter.js";
import { listObligations } from "../obligation.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";

describe("ADR-015 P1 mail discovery", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-discover-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-discover-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    return { db, vault, adapter: createDocumentAdapter() };
  }

  it("parses a statement without amount as a hint, not a bill", () => {
    const parsed = parseTextDocument(
      ["Institution: Chase", "Classifier: statement", "Rail: plaid"].join("\n"),
    );
    expect(parsed?.classifier).toBe("statement");
    expect(parsed?.amountUsd).toBe(0);
    expect(parsed?.institutionHint).toBe("Chase");
    expect(parsed?.rail).toBe("plaid");
  });

  it("drops newsletters even when they attach text/plain (negative)", () => {
    expect(
      isLikelyBillEmail({
        subject: "This week's deals — 20% off",
        from: "deals@shop.example",
        bodyText: "Unsubscribe from this list.",
        attachmentMimeTypes: ["text/plain"],
      }),
    ).toBe(false);
    expect(
      isLikelyBillEmail({
        subject: "Your Chase checking statement is ready",
        from: "statements@chase.example",
        bodyText: "Institution: Chase",
        attachmentMimeTypes: ["text/plain"],
      }),
    ).toBe(true);
  });

  it("clamps unbounded lookback and limit (negative)", () => {
    const bounds = clampDiscoverBounds({ lookbackDays: 9999, limit: 9999 });
    expect(bounds.lookbackDays).toBe(DISCOVER_MAX_LOOKBACK_DAYS);
    expect(bounds.limit).toBe(DISCOVER_MAX_LIMIT);
    expect(clampDiscoverBounds({ lookbackDays: 0, limit: -3 }).lookbackDays).toBe(1);
  });

  it("errors when not onboarded or when no mail account (negative)", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-discover-empty-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-discover-empty-vault-"));
    const db = openDatabase(dataDir);
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);

    await expect(
      discoverMailCandidates(db, vault, createDocumentAdapter()),
    ).rejects.toMatchObject({ code: "not_onboarded" });
    db.close();

    const { db: db2, vault: vault2, adapter } = setup();
    await expect(discoverMailCandidates(db2, vault2, adapter)).rejects.toBeInstanceOf(
      DiscoverError,
    );
    await expect(discoverMailCandidates(db2, vault2, adapter)).rejects.toMatchObject({
      code: "no_mail",
    });
    db2.close();
  });

  it("sandbox discover ranks bill then statement; skips newsletter; reuses event ids", async () => {
    const { db, vault, adapter } = setup();
    connectSandboxGmail(db, vault);

    const first = await discoverMailCandidates(db, vault, adapter, {
      gmailAdapter: new FakeGmailAdapter(),
    });
    expect(first.lookbackDays).toBe(90);
    expect(first.limit).toBe(40);
    expect(first.candidates.map((c) => c.kind)).toEqual([
      "bill",
      "bill",
      "bill",
      "statement",
      "statement",
    ]);
    expect(first.candidates.some((c) => /deal|newsletter/i.test(c.payee ?? ""))).toBe(
      false,
    );

    const bill = first.candidates.find((c) => c.amountUsd === 71.25)!;
    expect(bill.action).toBe("confirm_bill");
    expect(bill.kind).toBe("bill");
    expect(bill.eventId).toBeTruthy();

    const chase = first.candidates.find((c) => c.action === "connect_plaid")!;
    expect(chase.amountUsd).toBeNull();
    expect(chase.dueDate).toBeNull();
    expect(chase.institutionHint).toMatch(/chase/i);
    const fidelity = first.candidates.find((c) => c.action === "connect_snaptrade")!;
    expect(fidelity.institutionHint).toMatch(/fidelity/i);
    expect(first.message).toMatch(/attache plaid connect/);
    expect(first.message).toMatch(/attache snaptrade connect/);
    expect(first.message).toMatch(/Not a bank until you Link/);
    expect(first.nextCommands.some((c) => c.cli === "attache plaid connect")).toBe(
      true,
    );
    expect(listPendingBillReviews(db)).toHaveLength(3);
    expect(listObligations(db)).toHaveLength(0);
    expect(listAccounts(db)).toHaveLength(0);

    const second = await discoverMailCandidates(db, vault, adapter, {
      gmailAdapter: new FakeGmailAdapter(),
    });
    expect(second.candidates.map((c) => c.eventId).sort()).toEqual(
      first.candidates.map((c) => c.eventId).sort(),
    );

    expect(() => confirmBillIngest(db, chase.eventId)).toThrow(/connect hint/i);

    const ob = confirmBillIngest(db, bill.eventId);
    expect(ob.payee).toBe("Sandbox Gmail Utility");
    expect(listObligations(db)).toHaveLength(1);

    const afterConfirm = await discoverMailCandidates(db, vault, adapter, {
      gmailAdapter: new FakeGmailAdapter(),
    });
    expect(afterConfirm.candidates.some((c) => c.eventId === bill.eventId)).toBe(false);
    expect(afterConfirm.candidates.some((c) => c.kind === "statement")).toBe(true);

    db.close();
  });

  it("discover-sandbox does not insert obligations or Plaid accounts", async () => {
    const { db, vault, adapter } = setup();
    const result = await discoverMailCandidates(db, vault, adapter, { sandbox: true });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(listObligations(db)).toHaveLength(0);
    expect(listAccounts(db)).toHaveLength(0);
    db.close();
  });

  it("P2 copy names plaid/snaptrade CLI; linked institution hides the hint (negative)", async () => {
    const { db, vault, adapter } = setup();
    await discoverMailCandidates(db, vault, adapter, { sandbox: true });
    const listed = listDiscoverCandidates(db);
    expect(listed.length).toBeGreaterThan(0);
    expect(formatDiscoverMessage(listed)).toMatch(/attache plaid connect/);
    expect(formatDiscoverMessage([])).toMatch(/obligations create/);

    const leftover = unsatisfiedConnectHints(listed, {
      plaidInstitutionNames: ["Chase (sandbox)"],
      snaptradeBrokerageNames: [],
    });
    expect(leftover.some((c) => c.action === "connect_plaid")).toBe(false);
    expect(leftover.some((c) => c.action === "connect_snaptrade")).toBe(true);

    const none = unsatisfiedConnectHints(listed, {
      plaidInstitutionNames: ["Chase (sandbox)"],
      snaptradeBrokerageNames: ["Fidelity (sandbox)"],
    });
    expect(none).toEqual([]);
    expect(listUnsatisfiedConnectHints(db).length).toBeGreaterThan(0);
    expect(listAccounts(db)).toHaveLength(0);
    db.close();
  });
});
