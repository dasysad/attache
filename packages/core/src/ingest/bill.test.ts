import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { listObligations } from "../obligation.js";
import {
  confirmBillIngest,
  ingestDocumentBytes,
  ingestEmailBatch,
  listPendingBillReviews,
} from "./bill.js";
import { createDocumentAdapter, parseTextBill } from "./fake-document-adapter.js";
import { createEmailAdapter } from "./fake-email-adapter.js";
import { getOrCreateIngestToken } from "./token.js";
import { createTenant } from "../tenant.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

describe("VS-4 document + email ingest", () => {
  let dataDir: string;
  let docsDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (docsDir) rmSync(docsDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-v4-"));
    docsDir = mkdtempSync(join(tmpdir(), "attache-v4-docs-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "T", holderDisplayName: "A" });
    return { db, adapter: createDocumentAdapter() };
  }

  it("parses text bill fixtures", () => {
    const text = readFileSync(join(fixtureDir, "sample-bill.txt"), "utf8");
    const parsed = parseTextBill(text);
    expect(parsed?.payee).toBe("City Water Department");
    expect(parsed?.amountUsd).toBe(64.2);
    expect(parsed?.confidence).toBeGreaterThan(0.85);
  });

  it("ingests document and queues for review", async () => {
    const { db, adapter } = setup();
    const bytes = readFileSync(join(fixtureDir, "sample-bill.txt"));
    const result = await ingestDocumentBytes(db, adapter, {
      filename: "sample-bill.txt",
      mimeType: "text/plain",
      bytes,
      documentsDir: docsDir,
    });
    expect(result.event.source).toBe("document");
    expect(result.event.reviewed).toBe(false);
    expect(result.event.promotedAt).toBeNull();
    expect(listPendingBillReviews(db)).toHaveLength(1);
    db.close();
  });

  it("confirms bill → obligation with document provenance", async () => {
    const { db, adapter } = setup();
    const bytes = readFileSync(join(fixtureDir, "sample-bill.txt"));
    const { event } = await ingestDocumentBytes(db, adapter, {
      filename: "sample-bill.txt",
      mimeType: "text/plain",
      bytes,
      documentsDir: docsDir,
    });
    const ob = confirmBillIngest(db, event.id);
    expect(ob.provenance).toBe("document");
    expect(ob.payee).toBe("City Water Department");
    expect(listPendingBillReviews(db)).toHaveLength(0);
    expect(listObligations(db)).toHaveLength(1);
    db.close();
  });

  it("deduplicates document ingest by external_id", async () => {
    const { db, adapter } = setup();
    const bytes = readFileSync(join(fixtureDir, "sample-bill.txt"));
    const first = await ingestDocumentBytes(db, adapter, {
      filename: "sample-bill.txt",
      mimeType: "text/plain",
      bytes,
      documentsDir: docsDir,
    });
    const second = await ingestDocumentBytes(db, adapter, {
      filename: "sample-bill.txt",
      mimeType: "text/plain",
      bytes,
      documentsDir: docsDir,
    });
    expect(second.event.id).toBe(first.event.id);
    expect(listPendingBillReviews(db)).toHaveLength(1);
    db.close();
  });

  it("simulates email ingest with email provenance", async () => {
    const { db, adapter } = setup();
    const token = getOrCreateIngestToken(db);
    const batch = await ingestEmailBatch(
      db,
      adapter,
      createEmailAdapter("sandbox"),
      token,
    );
    expect(batch.messagesProcessed).toBe(1);
    expect(batch.billsCreated).toBe(1);
    const pending = listPendingBillReviews(db);
    expect(pending[0]?.source).toBe("email");
    const ob = confirmBillIngest(db, pending[0]!.id);
    expect(ob.provenance).toBe("email");
    db.close();
  });
});
