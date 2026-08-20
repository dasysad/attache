/**
 * Hosted mail ingress status (BL-8 P0).
 *
 * What: JSON for CLI/MCP `ingest ingress-status`.
 * Why: agents must see that Mailgun is opt-in and sees plaintext, and that
 *      IMAP/Gmail remain the local-first path (ADR-007).
 */
import type Database from "better-sqlite3";
import { isOnboarded } from "../tenant.js";
import {
  isMailgunIngressConfigured,
  mailgunSigningKeyFromEnv,
} from "./mailgun.js";
import { getOrCreateIngestToken, ingestEmailAddress } from "./token.js";

export const HOSTED_INGRESS_HONESTY =
  "Mailgun sees message plaintext when this webhook is enabled. IMAP/Gmail pull stays the primary local-first path. Attache does not operate SMTP.";

export interface HostedIngressStatus {
  mailgunConfigured: boolean;
  webhookPath: "/api/ingest/mailgun";
  genericWebhookPath: "/api/ingest/email";
  ingestAddress: string;
  honesty: string;
  primaryPath: "imap_or_gmail";
  message: string;
}

export function hostedIngressStatus(
  db: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
): HostedIngressStatus {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  const token = getOrCreateIngestToken(db);
  const mailgunConfigured = isMailgunIngressConfigured(env);
  const signingPresent = Boolean(mailgunSigningKeyFromEnv(env));
  return {
    mailgunConfigured,
    webhookPath: "/api/ingest/mailgun",
    genericWebhookPath: "/api/ingest/email",
    ingestAddress: ingestEmailAddress(token),
    honesty: HOSTED_INGRESS_HONESTY,
    primaryPath: "imap_or_gmail",
    message: signingPresent
      ? "BYO Mailgun inbound is on. Point the route at POST /api/ingest/mailgun. Forward still uses bills+{token}@ingest.attache.app in Mailgun, then the webhook."
      : "Mailgun ingress off. Connect Gmail/IMAP, or set ATTACHE_MAILGUN_SIGNING_KEY to accept signed inbound (plaintext at Mailgun).",
  };
}
