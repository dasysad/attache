import type { ObligationCadence } from "../domain.js";

/** Input to document extraction adapters (upload, email attachment, etc.). */
export interface DocumentExtractionInput {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

/** Structured bill fields extracted from a document (ADR-004 stage 2). */
export interface BillExtraction {
  payee: string;
  amountUsd: number;
  dueDate: string;
  cadence: ObligationCadence;
  autopay: boolean;
  classifier: "bill" | "statement" | "notice" | "other";
  confidence: number;
  rawText?: string;
}

/**
 * Document pipeline port — swap FakeDocumentAdapter for Docling+GLM-OCR sidecar later.
 * How: server/CLI call extract(); core persists artifact + ingested_event.
 */
export interface DocumentExtractionPort {
  readonly mode: "sandbox" | "local" | "cloud";
  extract(input: DocumentExtractionInput): Promise<BillExtraction>;
}
