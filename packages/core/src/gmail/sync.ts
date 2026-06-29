import type Database from "better-sqlite3";
import type { DocumentExtractionPort } from "../ingest/document-port.js";
import type { BillIngestResult, EmailIngestResult } from "../ingest/bill.js";
import { ingestDocumentBytes } from "../ingest/bill.js";
import type { VaultPort } from "../vault/local-vault.js";
import { createGmailAdapter } from "./fake-adapter.js";
import type { GmailIngestPort } from "./port.js";
import {
  ensureGmailAccessToken,
  listGmailAccounts,
  markGmailAccountError,
  updateGmailHistoryId,
} from "./store.js";

export interface GmailPollResult extends EmailIngestResult {
  accountsPolled: number;
}

/**
 * Poll connected Gmail accounts via API → bill ingested_events.
 */
export async function pollGmailIngest(
  db: Database.Database,
  vault: VaultPort,
  docAdapter: DocumentExtractionPort,
  adapter: GmailIngestPort = createGmailAdapter(),
): Promise<GmailPollResult> {
  const accounts = listGmailAccounts(db).filter((a) => a.status === "active");
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
    try {
      const accessToken = await ensureGmailAccessToken(vault, account);
      const { messages, historyId } = await adapter.fetchNewMessages(account, accessToken);
      messagesProcessed += messages.length;

      for (const m of messages) {
        if (m.attachments.length === 0 && m.bodyText.trim()) {
          allResults.push(
            await ingestDocumentBytes(db, docAdapter, {
              filename: `gmail-${m.gmailMessageId}.txt`,
              mimeType: "text/plain",
              bytes: Buffer.from(m.bodyText, "utf8"),
              source: "email",
              externalId: `gmail:${account.id}:${m.gmailMessageId}:body`,
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
              externalId: `gmail:${account.id}:${m.gmailMessageId}:${att.filename}`,
            }),
          );
        }
      }

      if (historyId != null) {
        updateGmailHistoryId(db, account.id, historyId);
      }
    } catch {
      markGmailAccountError(db, account.id);
    }
  }

  return {
    accountsPolled: accounts.length,
    messagesProcessed,
    billsCreated: allResults.length,
    results: allResults,
  };
}
