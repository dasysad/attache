import type { ImapAccount } from "../domain.js";
import type { InboundEmailMessage } from "../ingest/email-port.js";

/** Message from IMAP with UID for incremental sync cursor. */
export interface ImapFetchedMessage extends InboundEmailMessage {
  uid: number;
}

export interface ImapFetchResult {
  messages: ImapFetchedMessage[];
  /** Highest UID seen this fetch — persist as last_uid. */
  highUid: number | null;
}

/**
 * IMAP ingest port — live uses imapflow; sandbox for tests.
 * Pull-only; credentials passed per call from vault.
 */
export interface ImapIngestPort {
  readonly mode: "live" | "sandbox";
  fetchNewMessages(account: ImapAccount, password: string): Promise<ImapFetchResult>;
}
