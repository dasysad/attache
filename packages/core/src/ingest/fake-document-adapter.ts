import type {
  BillExtraction,
  DocumentExtractionInput,
  DocumentExtractionPort,
} from "./document-port.js";
import { RemoteDocumentAdapter, ResilientDocumentAdapter } from "./remote-document-adapter.js";

/**
 * VS-4 dogfood extractor — no Docling/GLM-OCR dependency yet.
 *
 * - `.txt` bills with `Payee:` / `Amount:` / `Due:` lines → high confidence
 * - Everything else → deterministic PG&E sandbox fixture (HITL confidence band)
 *
 * Why: lets agents and humans test upload → review → obligation without GPU infra.
 */
export class FakeDocumentAdapter implements DocumentExtractionPort {
  readonly mode = "sandbox" as const;

  async extract(input: DocumentExtractionInput): Promise<BillExtraction> {
    const text = input.bytes.toString("utf8");
    if (input.filename.toLowerCase().endsWith(".txt")) {
      const parsed = parseTextBill(text);
      if (parsed) return parsed;
    }
    return sandboxPgeFixture(input.filename);
  }
}

/** Parse simple key-value bill fixtures for agent/CLI dogfood. */
export function parseTextBill(text: string): BillExtraction | null {
  const lines = text.split(/\r?\n/);
  let payee: string | undefined;
  let amountUsd: number | undefined;
  let dueDate: string | undefined;
  let cadence: BillExtraction["cadence"] = "once";
  let autopay = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const kv = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!.trim().toLowerCase();
    const val = kv[2]!.trim();
    if (key === "payee" || key === "vendor") payee = val;
    if (key === "amount") amountUsd = parseAmount(val);
    if (key === "due" || key === "due date") dueDate = normalizeDate(val);
    if (key === "cadence") cadence = val as BillExtraction["cadence"];
    if (key === "autopay") autopay = val === "true" || val === "yes" || val === "1";
  }

  if (!payee || amountUsd === undefined || !dueDate) return null;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;

  return {
    payee,
    amountUsd,
    dueDate,
    cadence,
    autopay,
    classifier: "bill",
    confidence: 0.92,
    rawText: text.slice(0, 4000),
  };
}

function sandboxPgeFixture(filename: string): BillExtraction {
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 18);
  return {
    payee: "Pacific Gas & Electric",
    amountUsd: 142.5,
    dueDate: due.toISOString().slice(0, 10),
    cadence: "monthly",
    autopay: false,
    classifier: "bill",
    confidence: 0.78,
    rawText: `Sandbox extraction for ${filename} — confirm fields before promoting.`,
  };
}

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeDate(raw: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

export function createDocumentAdapter(): DocumentExtractionPort {
  const url = process.env.ATTACHE_EXTRACT_URL;
  if (url) {
    const remote = new RemoteDocumentAdapter(url);
    const useFallback = process.env.ATTACHE_EXTRACT_FALLBACK !== "0";
    if (useFallback) {
      return new ResilientDocumentAdapter(remote, new FakeDocumentAdapter());
    }
    return remote;
  }
  return new FakeDocumentAdapter();
}
