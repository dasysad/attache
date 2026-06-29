import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { parseEml } from "./eml.js";
import { MaildropEmailAdapter, dropEmlIntoInbox } from "./maildrop-email-adapter.js";
import { getOrCreateIngestToken, parseIngestTokenFromAddress } from "./token.js";
import { ingestEmailBatch } from "./bill.js";
import { createDocumentAdapter } from "./fake-document-adapter.js";
import { ingestEmailWebhook } from "./email-webhook.js";
import { RemoteDocumentAdapter } from "./remote-document-adapter.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

describe("VS-4.1 live email + remote extract", () => {
  let dataDir: string;
  let inboxBase: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (inboxBase) rmSync(inboxBase, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-v41-"));
    inboxBase = mkdtempSync(join(tmpdir(), "attache-inbox-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    return { db };
  }

  it("parses ingest token from plus address", () => {
    expect(parseIngestTokenFromAddress("bills+abc123@ingest.attache.app")).toBe("abc123");
    expect(parseIngestTokenFromAddress("wrong@example.com")).toBeNull();
  });

  it("maildrop picks up .eml and moves to processed", async () => {
    const { db } = setup();
    const token = getOrCreateIngestToken(db);
    let eml = readFileSync(join(fixtureDir, "sample-forward.eml"), "utf8");
    eml = eml.replace("PLACEHOLDER", token);
    dropEmlIntoInbox(token, "sample-forward.eml", Buffer.from(eml, "utf8"), inboxBase);

    const adapter = new MaildropEmailAdapter({ inboxBaseDir: inboxBase });
    const batch = await ingestEmailBatch(db, createDocumentAdapter(), adapter, token);
    expect(batch.billsCreated).toBe(1);
    expect(batch.results[0]?.extraction.payee).toBe("Regional Water Authority");
    db.close();
  });

  it("webhook ingests when token matches", async () => {
    const { db } = setup();
    const token = getOrCreateIngestToken(db);
    const result = await ingestEmailWebhook(db, createDocumentAdapter(), {
      to: `bills+${token}@ingest.attache.app`,
      from: "billing@test.com",
      subject: "Bill",
      text: "Payee: Webhook Utility\nAmount: $33.00\nDue: 2026-09-01",
      messageId: "webhook-test-001",
    });
    expect(result.billsCreated).toBe(1);
    db.close();
  });

  it("remote document adapter calls sidecar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        payee: "Sidecar Co",
        amountUsd: 99,
        dueDate: "2026-10-01",
        cadence: "once",
        autopay: false,
        classifier: "bill",
        confidence: 0.9,
        rawText: "test",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new RemoteDocumentAdapter("http://127.0.0.1:8790");
    const out = await adapter.extract({
      filename: "x.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("test"),
    });
    expect(out.payee).toBe("Sidecar Co");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("parseEml extracts plain body", () => {
    const raw = Buffer.from(
      "From: a@b.com\nTo: bills+t@ingest.attache.app\nSubject: Hi\nMessage-ID: <1>\n\nPayee: X\nAmount: $1.00\nDue: 2026-01-01",
    );
    const msg = parseEml(raw);
    expect(msg.bodyText).toContain("Payee: X");
    expect(msg.messageId).toContain("1");
  });
});
