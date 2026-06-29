/** Simulated or live inbound email for bill ingestion (ADR-004). */
export interface EmailAttachment {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export interface InboundEmailMessage {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  bodyText: string;
  attachments: EmailAttachment[];
}

/**
 * Email ingest port — fake adapter for dogfood; live IMAP/webhook in VS-4.1.
 * Ingress address: bills+{ingestToken}@ingest.attache.app (display only in VS-4).
 */
export interface EmailIngestPort {
  readonly mode: "sandbox" | "live";
  fetchPending(_ingestToken: string): Promise<InboundEmailMessage[]>;
}
