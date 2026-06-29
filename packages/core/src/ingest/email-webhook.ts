import type Database from "better-sqlite3";
import type { InboundEmailMessage } from "./email-port.js";
import {
  getOrCreateIngestToken,
  parseIngestTokenFromAddress,
} from "./token.js";
import type { EmailIngestResult } from "./bill.js";
import { ingestEmailMessages } from "./bill.js";
import type { DocumentExtractionPort } from "./document-port.js";

/** JSON payload from Mailgun/SendGrid-style forwarders or agent POST. */
export interface InboundEmailWebhookPayload {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    contentBase64: string;
  }>;
}

export function webhookToInboundMessage(
  payload: InboundEmailWebhookPayload,
): InboundEmailMessage {
  return {
    messageId:
      payload.messageId ??
      `webhook-${Buffer.from(`${payload.from}:${payload.subject}`).toString("base64url").slice(0, 24)}`,
    subject: payload.subject,
    from: payload.from,
    to: payload.to,
    bodyText: payload.text ?? stripHtml(payload.html ?? ""),
    attachments: (payload.attachments ?? []).map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      bytes: Buffer.from(a.contentBase64, "base64"),
    })),
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Validate webhook token matches onboarded tenant ingest address. */
export function assertWebhookIngestToken(
  db: Database.Database,
  toAddress: string,
): void {
  const expected = getOrCreateIngestToken(db);
  const parsed = parseIngestTokenFromAddress(toAddress);
  if (!parsed || parsed !== expected) {
    throw new Error("invalid ingest token in To address");
  }
}

/** Process one webhook-delivered email through the bill ingest pipeline. */
export async function ingestEmailWebhook(
  db: Database.Database,
  docAdapter: DocumentExtractionPort,
  payload: InboundEmailWebhookPayload,
): Promise<EmailIngestResult> {
  assertWebhookIngestToken(db, payload.to);
  const message = webhookToInboundMessage(payload);
  return ingestEmailMessages(db, docAdapter, [message]);
}
