import type { GmailAccount } from "../domain.js";
import type { InboundEmailMessage } from "../ingest/email-port.js";

export interface GmailFetchedMessage extends InboundEmailMessage {
  /** Gmail message id — used for dedupe external_id. */
  gmailMessageId: string;
}

export interface GmailFetchResult {
  messages: GmailFetchedMessage[];
  historyId: string | null;
}

/**
 * Gmail API ingest port — live uses REST; sandbox for tests.
 */
export interface GmailIngestPort {
  readonly mode: "live" | "sandbox";
  fetchNewMessages(
    account: GmailAccount,
    accessToken: string,
  ): Promise<GmailFetchResult>;
}
