import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  BillExtractPayload,
  IngestedEvent,
  IngestSource,
  Obligation,
  Provenance,
} from "../domain.js";
import { storeDocumentArtifact } from "../documents/store.js";
import type { DocumentExtractionPort } from "./document-port.js";
import type { EmailIngestPort, InboundEmailMessage } from "./email-port.js";
import {
  getIngestedEventById,
  listPendingBillEvents,
  markEventPromoted,
  parseBillPayload,
  upsertIngestedEvent,
} from "./event.js";
import { createObligationFromIngest } from "../obligation.js";

export interface BillIngestResult {
  event: IngestedEvent;
  artifactId: string;
  extraction: BillExtractPayload;
}

export interface EmailIngestResult {
  messagesProcessed: number;
  billsCreated: number;
  results: BillIngestResult[];
}

/** Confidence below this requires explicit HITL confirm (document-ocr-strategy.md). */
export const HITL_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Upload bytes → store artifact → extract → ingested_event (never auto-promotes).
 * Why: ADR-004 — low-confidence and all VS-4 dogfood paths go through review queue.
 */
export async function ingestDocumentBytes(
  db: Database.Database,
  adapter: DocumentExtractionPort,
  input: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
    source?: Extract<IngestSource, "document" | "email">;
    externalId?: string;
    documentsDir?: string;
  },
): Promise<BillIngestResult> {
  const artifact = storeDocumentArtifact(db, {
    filename: input.filename,
    mimeType: input.mimeType,
    bytes: input.bytes,
    documentsDir: input.documentsDir,
  });

  const extraction = await adapter.extract({
    filename: input.filename,
    mimeType: input.mimeType,
    bytes: input.bytes,
  });

  const payload: BillExtractPayload = {
    payee: extraction.payee,
    amountUsd: extraction.amountUsd,
    dueDate: extraction.dueDate,
    cadence: extraction.cadence,
    autopay: extraction.autopay,
    classifier: extraction.classifier,
    documentArtifactId: artifact.id,
    filename: input.filename,
    rawText: extraction.rawText,
    institutionHint: extraction.institutionHint ?? null,
    rail: extraction.rail ?? null,
  };

  const externalId =
    input.externalId ??
    createHash("sha256")
      .update(`${artifact.sha256}:${extraction.payee}:${extraction.dueDate}`)
      .digest("hex")
      .slice(0, 32);

  const event = upsertIngestedEvent(db, {
    source: input.source ?? "document",
    kind: ingestKindFromClassifier(extraction.classifier),
    externalId,
    payload,
    confidence: extraction.confidence,
    reviewed: false,
  });

  return { event, artifactId: artifact.id, extraction: payload };
}

/** Process parsed email messages → bill ingested_events. */
export async function ingestEmailMessages(
  db: Database.Database,
  docAdapter: DocumentExtractionPort,
  messages: InboundEmailMessage[],
): Promise<EmailIngestResult> {
  const results: BillIngestResult[] = [];

  for (const msg of messages) {
    if (msg.attachments.length === 0 && msg.bodyText.trim()) {
      const result = await ingestDocumentBytes(db, docAdapter, {
        filename: `${msg.messageId.replace(/[^a-zA-Z0-9._-]/g, "_")}.txt`,
        mimeType: "text/plain",
        bytes: Buffer.from(msg.bodyText, "utf8"),
        source: "email",
        externalId: `email:${msg.messageId}:body`,
      });
      results.push(result);
      continue;
    }

    for (const att of msg.attachments) {
      const result = await ingestDocumentBytes(db, docAdapter, {
        filename: att.filename,
        mimeType: att.mimeType,
        bytes: att.bytes,
        source: "email",
        externalId: `email:${msg.messageId}:${att.filename}`,
      });
      results.push(result);
    }
  }

  return {
    messagesProcessed: messages.length,
    billsCreated: results.length,
    results,
  };
}

/** Poll fake/live mailbox and ingest each attachment as a bill event. */
export async function ingestEmailBatch(
  db: Database.Database,
  docAdapter: DocumentExtractionPort,
  emailAdapter: EmailIngestPort,
  ingestToken: string,
): Promise<EmailIngestResult> {
  const messages = await emailAdapter.fetchPending(ingestToken);
  return ingestEmailMessages(db, docAdapter, messages);
}

export function listPendingBillReviews(db: Database.Database): IngestedEvent[] {
  return listPendingBillEvents(db);
}

export function getBillReview(db: Database.Database, eventId: string): {
  event: IngestedEvent;
  payload: BillExtractPayload;
} | null {
  const event = getIngestedEventById(db, eventId);
  if (!event || event.promotedAt) return null;
  if (event.kind !== "bill") return null;
  if (event.source !== "document" && event.source !== "email") return null;
  return { event, payload: parseBillPayload(event) };
}

/** User confirms extracted fields → obligation with provenance document|email. */
export function confirmBillIngest(
  db: Database.Database,
  eventId: string,
  overrides?: {
    payee?: string;
    amountUsd?: number;
    dueDate?: string;
    cadence?: BillExtractPayload["cadence"];
    autopay?: boolean;
    notes?: string;
  },
): Obligation {
  const existing = getIngestedEventById(db, eventId);
  if (existing?.kind === "statement") {
    throw new Error("statement is a connect hint — cannot confirm as a bill");
  }

  const review = getBillReview(db, eventId);
  if (!review) throw new Error("bill review not found or already promoted");

  const payload = {
    ...review.payload,
    ...(overrides?.payee !== undefined ? { payee: overrides.payee } : {}),
    ...(overrides?.amountUsd !== undefined ? { amountUsd: overrides.amountUsd } : {}),
    ...(overrides?.dueDate !== undefined ? { dueDate: overrides.dueDate } : {}),
    ...(overrides?.cadence !== undefined ? { cadence: overrides.cadence } : {}),
    ...(overrides?.autopay !== undefined ? { autopay: overrides.autopay } : {}),
  };

  if (!payload.payee.trim()) throw new Error("payee required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
    throw new Error("dueDate must be YYYY-MM-DD");
  }
  if (!Number.isFinite(payload.amountUsd) || payload.amountUsd <= 0) {
    throw new Error("amount must be positive");
  }

  const provenance: Provenance =
    review.event.source === "email" ? "email" : "document";

  const obligation = createObligationFromIngest(db, {
    payee: payload.payee.trim(),
    amountUsd: payload.amountUsd,
    dueDate: payload.dueDate,
    cadence: payload.cadence,
    autopay: payload.autopay,
    provenance,
    ingestedEventId: review.event.id,
    notes:
      overrides?.notes ??
      `From ${payload.filename}${review.event.confidence < HITL_CONFIDENCE_THRESHOLD ? " (HITL confirmed)" : ""}`,
  });

  markEventReviewed(db, eventId);
  markEventPromoted(db, eventId);
  return obligation;
}

function markEventReviewed(db: Database.Database, eventId: string): void {
  db.prepare("UPDATE ingested_event SET reviewed = 1 WHERE id = ?").run(eventId);
}

/** Map document classifier onto ingested_event.kind (no invoice kind in the table). */
function ingestKindFromClassifier(
  classifier: BillExtractPayload["classifier"],
): "bill" | "statement" | "notice" {
  if (classifier === "statement") return "statement";
  if (classifier === "notice" || classifier === "other") return "notice";
  return "bill";
}
