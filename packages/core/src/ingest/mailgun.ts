/**
 * BYO Mailgun inbound (BL-8 / ADR-007 Phase B P0).
 *
 * What: verify Mailgun webhook HMAC, map form fields onto the existing
 *       ingestEmailWebhook pipeline.
 * Why: hosted ingress sees plaintext — only with an explicit signing key
 *      (ATTACHE_MAILGUN_SIGNING_KEY). IMAP/Gmail stay the primary path.
 * Honesty: Mailgun (the user's account) can read the message. Attache does
 *          not operate SMTP.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import type { DocumentExtractionPort } from "./document-port.js";
import {
  ingestEmailWebhook,
  type InboundEmailWebhookPayload,
} from "./email-webhook.js";
import type { EmailIngestResult } from "./bill.js";

const MAX_AGE_SECONDS = 15 * 60;

export class MailgunWebhookError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 503,
  ) {
    super(message);
    this.name = "MailgunWebhookError";
  }
}

export function mailgunSigningKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.ATTACHE_MAILGUN_SIGNING_KEY?.trim();
  return key ? key : null;
}

export function isMailgunIngressConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(mailgunSigningKeyFromEnv(env));
}

/**
 * Mailgun docs: HMAC-SHA256(timestamp + token) with the webhook signing key.
 * Also reject timestamps older than 15 minutes (replay).
 */
export function verifyMailgunSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signingKey || !timestamp || !token || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSeconds - ts) > MAX_AGE_SECONDS) return false;

  const digest = createHmac("sha256", signingKey)
    .update(`${timestamp}${token}`)
    .digest("hex");
  const expected = Buffer.from(digest, "utf8");
  const actual = Buffer.from(signature.trim(), "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function signMailgunWebhook(
  signingKey: string,
  timestamp: string,
  token: string,
): string {
  return createHmac("sha256", signingKey)
    .update(`${timestamp}${token}`)
    .digest("hex");
}

function field(
  body: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/**
 * Map Mailgun inbound form fields to the generic webhook payload.
 * Attachments are ignored in P0 — body-plain is enough for bill extract.
 */
export function mailgunFormToPayload(
  body: Record<string, unknown>,
): InboundEmailWebhookPayload {
  const to = field(body, "recipient", "To", "to");
  const from = field(body, "sender", "from", "From");
  const subject = field(body, "subject", "Subject");
  if (!to || !from || !subject) {
    throw new MailgunWebhookError(
      "Mailgun payload missing recipient, sender, or subject",
      400,
    );
  }
  return {
    to,
    from,
    subject,
    text: field(body, "body-plain", "stripped-text", "text") || undefined,
    html: field(body, "body-html", "html") || undefined,
    messageId: field(body, "Message-Id", "message-id", "Message-ID") || undefined,
  };
}

export async function ingestMailgunWebhook(
  db: Database.Database,
  docAdapter: DocumentExtractionPort,
  body: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  nowSeconds?: number,
): Promise<EmailIngestResult> {
  const key = mailgunSigningKeyFromEnv(env);
  if (!key) {
    throw new MailgunWebhookError(
      "Mailgun ingress not configured — set ATTACHE_MAILGUN_SIGNING_KEY (plaintext disclosure; IMAP/Gmail stay primary)",
      503,
    );
  }
  const timestamp = field(body, "timestamp");
  const token = field(body, "token");
  const signature = field(body, "signature");
  if (!verifyMailgunSignature(key, timestamp, token, signature, nowSeconds)) {
    throw new MailgunWebhookError("invalid Mailgun signature", 401);
  }
  const payload = mailgunFormToPayload(body);
  return ingestEmailWebhook(db, docAdapter, payload);
}
