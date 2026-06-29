import type {
  BillExtraction,
  DocumentExtractionInput,
  DocumentExtractionPort,
} from "./document-port.js";

interface SidecarBillResponse {
  payee: string;
  amountUsd: number;
  dueDate: string;
  cadence: BillExtraction["cadence"];
  autopay: boolean;
  classifier: BillExtraction["classifier"];
  confidence: number;
  rawText?: string;
  engine?: string;
}

/**
 * HTTP client for the Litestar extract sidecar (packages/extract).
 * What: delegates PDF/text extraction to Python when ATTACHE_EXTRACT_URL is set.
 * Why: Docling/pypdf pipeline lives in Python per document-ocr-strategy.md.
 */
export class RemoteDocumentAdapter implements DocumentExtractionPort {
  readonly mode = "local" as const;

  constructor(private readonly baseUrl: string) {}

  async extract(input: DocumentExtractionInput): Promise<BillExtraction> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/extract/bill`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: input.filename,
        mime_type: input.mimeType,
        content_base64: input.bytes.toString("base64"),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`extract sidecar ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    const data = (await res.json()) as SidecarBillResponse;
    return {
      payee: data.payee,
      amountUsd: data.amountUsd,
      dueDate: data.dueDate,
      cadence: data.cadence ?? "once",
      autopay: data.autopay ?? false,
      classifier: data.classifier ?? "bill",
      confidence: data.confidence,
      rawText: data.rawText,
    };
  }
}

/** Try remote sidecar; optionally fall back to FakeDocumentAdapter on failure. */
export class ResilientDocumentAdapter implements DocumentExtractionPort {
  readonly mode: DocumentExtractionPort["mode"];

  constructor(
    private readonly primary: DocumentExtractionPort,
    private readonly fallback?: DocumentExtractionPort,
  ) {
    this.mode = primary.mode;
  }

  async extract(input: DocumentExtractionInput): Promise<BillExtraction> {
    try {
      return await this.primary.extract(input);
    } catch (err) {
      if (!this.fallback) throw err;
      const extraction = await this.fallback.extract(input);
      return {
        ...extraction,
        rawText: `${extraction.rawText ?? ""}\n[fallback after sidecar error]`.trim(),
        confidence: Math.min(extraction.confidence, 0.75),
      };
    }
  }
}
