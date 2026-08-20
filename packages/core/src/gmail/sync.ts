import type Database from "better-sqlite3";
import type { DocumentExtractionPort } from "../ingest/document-port.js";
import type { BillIngestResult, EmailIngestResult } from "../ingest/bill.js";
import { ingestDocumentBytes } from "../ingest/bill.js";
import type { VaultPort } from "../vault/local-vault.js";
import type { GmailAccount } from "../domain.js";
import { createGmailAdapter, FakeGmailAdapter } from "./fake-adapter.js";
import type { GmailFetchOptions, GmailIngestPort } from "./port.js";
import { isLikelyBillEmail } from "../imap/filter.js";
import {
  ensureGmailAccessToken,
  getGmailTokens,
  listGmailAccounts,
  markGmailAccountError,
  updateGmailHistoryId,
} from "./store.js";

/** Per-account poll outcome — agents see which mailbox failed without aborting others. */
export interface MailAccountPollOutcome {
  accountId: string;
  label: string;
  ok: boolean;
  billsCreated: number;
  error?: string;
}

export interface GmailPollResult extends EmailIngestResult {
  accountsPolled: number;
  accountOutcomes: MailAccountPollOutcome[];
}

/**
 * Resolve adapter for one account — sandbox vault tokens never hit live Google API.
 * Why: createGmailAdapter() may be live when GOOGLE_CLIENT_* is set, but
 *      connect-sandbox still stores sandbox-access / sandbox-refresh tokens.
 */
function adapterForAccount(
  vault: VaultPort,
  account: GmailAccount,
  fallback: GmailIngestPort,
): GmailIngestPort {
  // Respect explicit sandbox / test adapters (incl. broken stubs).
  if (fallback.mode === "sandbox") return fallback;
  const tokens = getGmailTokens(vault, account);
  if (tokens?.refreshToken === "sandbox-refresh" || tokens?.accessToken === "sandbox-access") {
    return new FakeGmailAdapter();
  }
  return fallback;
}

/**
 * Poll connected Gmail accounts via API → ingested_events (bills + statements).
 * Retries accounts in `error` status (slice 4); success clears last_error.
 * Newsletter / marketing mail is dropped by isLikelyBillEmail before extract.
 */
export async function pollGmailIngest(
  db: Database.Database,
  vault: VaultPort,
  docAdapter: DocumentExtractionPort,
  adapter: GmailIngestPort = createGmailAdapter(),
  fetchOptions?: GmailFetchOptions,
): Promise<GmailPollResult> {
  const accounts = listGmailAccounts(db).filter(
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
    const port = adapterForAccount(vault, account, adapter);
    try {
      const accessToken = await ensureGmailAccessToken(vault, account);
      const { messages, historyId } = await port.fetchNewMessages(
        account,
        accessToken,
        fetchOptions,
      );
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
            filename: `gmail-${m.gmailMessageId}.txt`,
            mimeType: "text/plain",
            bytes: Buffer.from(m.bodyText, "utf8"),
            source: "email",
            externalId: `gmail:${account.id}:${m.gmailMessageId}:body`,
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
            externalId: `gmail:${account.id}:${m.gmailMessageId}:${att.filename}`,
          });
          allResults.push(r);
          billsForAccount += 1;
        }
      }

      // Always touch sync so error status clears even when no new history id.
      updateGmailHistoryId(db, account.id, historyId ?? null);
      accountOutcomes.push({
        accountId: account.id,
        label: account.label,
        ok: true,
        billsCreated: billsForAccount,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      markGmailAccountError(db, account.id, message);
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
