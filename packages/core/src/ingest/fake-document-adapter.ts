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
      const parsed = parseTextDocument(text) ?? parseTextBill(text);
      if (parsed) return parsed;
    }
    return sandboxPgeFixture(input.filename);
  }
}

/** Parse simple key-value bill fixtures for agent/CLI dogfood. */
export function parseTextBill(text: string): BillExtraction | null {
  const fields = parseKvFields(text);
  const payee = fields.payee ?? fields.vendor;
  const amountUsd = fields.amount;
  const dueDate = fields.due;
  if (!payee || amountUsd === undefined || !dueDate) return null;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;

  return {
    payee,
    amountUsd,
    dueDate,
    cadence: fields.cadence,
    autopay: fields.autopay,
    classifier: "bill",
    confidence: 0.92,
    rawText: text.slice(0, 4000),
  };
}

/**
 * Statement / hint fixtures — amount and due date are optional.
 * Why: ADR-015 — a statement without extractable amount is a connect hint, not a bill.
 */
export function parseTextDocument(text: string): BillExtraction | null {
  const fields = parseKvFields(text);
  const classifier = fields.classifier;
  const institution = fields.institution;
  const isStatement =
    classifier === "statement" ||
    (Boolean(institution) && fields.amount === undefined);

  if (!isStatement) return null;

  const payee = fields.payee ?? fields.vendor ?? institution ?? "Unknown institution";
  const rail = fields.rail ?? inferRail(`${institution ?? ""} ${text}`);

  return {
    payee,
    amountUsd: fields.amount ?? 0,
    dueDate: fields.due ?? "",
    cadence: fields.cadence,
    autopay: fields.autopay,
    classifier: "statement",
    confidence: 0.8,
    rawText: text.slice(0, 4000),
    institutionHint: institution ?? payee,
    rail,
  };
}

interface ParsedKv {
  payee?: string;
  vendor?: string;
  amount?: number;
  due?: string;
  cadence: BillExtraction["cadence"];
  autopay: boolean;
  classifier?: BillExtraction["classifier"];
  institution?: string;
  rail?: "plaid" | "snaptrade";
}

function parseKvFields(text: string): ParsedKv {
  const out: ParsedKv = { cadence: "once", autopay: false };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const kv = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1]!.trim().toLowerCase();
    const val = kv[2]!.trim();
    if (key === "payee") out.payee = val;
    if (key === "vendor") out.vendor = val;
    if (key === "amount") out.amount = parseAmount(val);
    if (key === "due" || key === "due date") out.due = normalizeDate(val);
    if (key === "cadence" && (val === "once" || val === "monthly" || val === "yearly")) {
      out.cadence = val;
    }
    if (key === "autopay") out.autopay = val === "true" || val === "yes" || val === "1";
    if (key === "classifier" && (val === "bill" || val === "statement" || val === "notice" || val === "other")) {
      out.classifier = val;
    }
    if (key === "institution") out.institution = val;
    if (key === "rail" && (val === "plaid" || val === "snaptrade")) out.rail = val;
  }
  return out;
}

function inferRail(haystack: string): "plaid" | "snaptrade" {
  const h = haystack.toLowerCase();
  if (/\b(brokerage|fidelity|vanguard|schwab|robinhood|snaptrade)\b/.test(h)) {
    return "snaptrade";
  }
  return "plaid";
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
