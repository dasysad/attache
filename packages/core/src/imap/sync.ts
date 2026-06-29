import type Database from "better-sqlite3";
import type { DocumentExtractionPort } from "../ingest/document-port.js";
import type { BillIngestResult, EmailIngestResult } from "../ingest/bill.js";
import { ingestDocumentBytes } from "../ingest/bill.js";
import type { VaultPort } from "../vault/local-vault.js";
import { createImapAdapter } from "./fake-adapter.js";
import type { ImapIngestPort } from "./port.js";
import {
  listImapAccounts,
  markImapAccountError,
  updateImapSyncCursor,
} from "./store.js";

export interface ImapPollResult extends EmailIngestResult {
  accountsPolled: number;
}

/**
 * Poll all connected IMAP accounts → bill ingested_events.
 * How: fetch new UIDs, filter heuristics, ingest with stable imap:{accountId}:{uid} keys.
 */
export async function pollImapIngest(
  db: Database.Database,
  vault: VaultPort,
  docAdapter: DocumentExtractionPort,
  adapter: ImapIngestPort = createImapAdapter(),
): Promise<ImapPollResult> {
  const accounts = listImapAccounts(db).filter((a) => a.status === "active");
  if (!accounts.length) {
    return {
      accountsPolled: 0,
      messagesProcessed: 0,
      billsCreated: 0,
      results: [],
    };
  }

  const allResults: BillIngestResult[] = [];
  let messagesProcessed = 0;

  for (const account of accounts) {
    const password = vault.get(account.vaultCredentialRef);
    if (!password) {
      markImapAccountError(db, account.id);
      continue;
    }

    try {
      const { messages, highUid } = await adapter.fetchNewMessages(account, password);
      messagesProcessed += messages.length;

      for (const m of messages) {
        if (m.attachments.length === 0 && m.bodyText.trim()) {
          allResults.push(
            await ingestDocumentBytes(db, docAdapter, {
              filename: `imap-${m.uid}.txt`,
              mimeType: "text/plain",
              bytes: Buffer.from(m.bodyText, "utf8"),
              source: "email",
              externalId: `imap:${account.id}:${m.uid}:body`,
            }),
          );
          continue;
        }

        for (const att of m.attachments) {
          allResults.push(
            await ingestDocumentBytes(db, docAdapter, {
              filename: att.filename,
              mimeType: att.mimeType,
              bytes: att.bytes,
              source: "email",
              externalId: `imap:${account.id}:${m.uid}:${att.filename}`,
            }),
          );
        }
      }

      if (highUid != null) {
        updateImapSyncCursor(db, account.id, highUid);
      } else if (messages.length === 0 && account.lastUid == null) {
        updateImapSyncCursor(db, account.id, 0);
      }
    } catch {
      markImapAccountError(db, account.id);
    }
  }

  return {
    accountsPolled: accounts.length,
    messagesProcessed,
    billsCreated: allResults.length,
    results: allResults,
  };
}
