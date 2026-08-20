import type Database from "better-sqlite3";
import type { DocumentExtractionPort } from "../ingest/document-port.js";
import type { BillIngestResult, EmailIngestResult } from "../ingest/bill.js";
import { ingestDocumentBytes } from "../ingest/bill.js";
import type { VaultPort } from "../vault/local-vault.js";
import { createImapAdapter } from "./fake-adapter.js";
import type { ImapIngestPort } from "./port.js";
import { isLikelyBillEmail } from "./filter.js";
import {
  listImapAccounts,
  markImapAccountError,
  updateImapSyncCursor,
} from "./store.js";
import type { MailAccountPollOutcome } from "../gmail/sync.js";

export type { MailAccountPollOutcome };

export interface ImapPollResult extends EmailIngestResult {
  accountsPolled: number;
  accountOutcomes: MailAccountPollOutcome[];
}

/**
 * Poll connected IMAP accounts → bill ingested_events.
 * Retries accounts in `error` status (slice 4); success clears last_error.
 */
export async function pollImapIngest(
  db: Database.Database,
  vault: VaultPort,
  docAdapter: DocumentExtractionPort,
  adapter: ImapIngestPort = createImapAdapter(),
): Promise<ImapPollResult> {
  const accounts = listImapAccounts(db).filter(
    (a) => a.status === "active" || a.status === "error",
  );
  if (!accounts.length) {
    return {
      accountsPolled: 0,
      messagesProcessed: 0,
      billsCreated: 0,
      results: [],
      accountOutcomes: [],
    };
  }

  const allResults: BillIngestResult[] = [];
  const accountOutcomes: MailAccountPollOutcome[] = [];
  let messagesProcessed = 0;

  for (const account of accounts) {
    let billsForAccount = 0;
    const password = vault.get(account.vaultCredentialRef);
    if (!password) {
      const message = "vault credential missing";
      markImapAccountError(db, account.id, message);
      accountOutcomes.push({
        accountId: account.id,
        label: account.label,
        ok: false,
        billsCreated: 0,
        error: message,
      });
      continue;
    }

    try {
      const { messages, highUid } = await adapter.fetchNewMessages(account, password);
      messagesProcessed += messages.length;

      for (const m of messages) {
        if (
          !isLikelyBillEmail({
            subject: m.subject,
            from: m.from,
            bodyText: m.bodyText,
            attachmentMimeTypes: m.attachments.map((a) => a.mimeType),
          })
        ) {
          continue;
        }
        if (m.attachments.length === 0 && m.bodyText.trim()) {
          const r = await ingestDocumentBytes(db, docAdapter, {
            filename: `imap-${m.uid}.txt`,
            mimeType: "text/plain",
            bytes: Buffer.from(m.bodyText, "utf8"),
            source: "email",
            externalId: `imap:${account.id}:${m.uid}:body`,
          });
          allResults.push(r);
          billsForAccount += 1;
          continue;
        }

        for (const att of m.attachments) {
          const r = await ingestDocumentBytes(db, docAdapter, {
            filename: att.filename,
            mimeType: att.mimeType,
            bytes: att.bytes,
            source: "email",
            externalId: `imap:${account.id}:${m.uid}:${att.filename}`,
          });
          allResults.push(r);
          billsForAccount += 1;
        }
      }

      if (highUid != null) {
        updateImapSyncCursor(db, account.id, highUid);
      } else if (messages.length === 0 && account.lastUid == null) {
        updateImapSyncCursor(db, account.id, 0);
      } else {
        // Clear error status even when cursor unchanged.
        updateImapSyncCursor(db, account.id, account.lastUid);
      }

      accountOutcomes.push({
        accountId: account.id,
        label: account.label,
        ok: true,
        billsCreated: billsForAccount,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      markImapAccountError(db, account.id, message);
      accountOutcomes.push({
        accountId: account.id,
        label: account.label,
        ok: false,
        billsCreated: billsForAccount,
        error: message,
      });
    }
  }

  return {
    accountsPolled: accounts.length,
    messagesProcessed,
    billsCreated: allResults.length,
    results: allResults,
    accountOutcomes,
  };
}
