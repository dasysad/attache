import type { GmailAccount } from "../domain.js";
import { isLikelyBillEmail } from "../imap/filter.js";
import { parseEml } from "../ingest/eml.js";
import type { GmailFetchOptions, GmailFetchResult, GmailIngestPort } from "./port.js";

/** ADR-015: first-sync cap raised from 15; discover still clamps to 40. */
const FIRST_SYNC_MAX = 40;
const DEFAULT_LOOKBACK_DAYS = 90;

/**
 * Gmail API pull — messages.get format=raw → parseEml (ADR-008).
 * Incremental sync via historyId when available.
 * First sync: `(bill OR invoice OR statement) newer_than:{days}d` + maxResults.
 */
export class LiveGmailAdapter implements GmailIngestPort {
  readonly mode = "live" as const;

  async fetchNewMessages(
    account: GmailAccount,
    accessToken: string,
    options?: GmailFetchOptions,
  ): Promise<GmailFetchResult> {
    const profile = await gmailJson<{ historyId: string }>(
      accessToken,
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    );

    const lookbackDays = clampPositive(options?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS);
    const limit = clampPositive(options?.limit ?? FIRST_SYNC_MAX, FIRST_SYNC_MAX);

    let messageIds: string[] = [];

    if (account.historyId) {
      const history = await gmailJson<{
        history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>;
      }>(
        accessToken,
        `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${encodeURIComponent(account.historyId)}&historyTypes=messageAdded`,
      );
      for (const h of history.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          if (added.message?.id) messageIds.push(added.message.id);
        }
      }
      messageIds = messageIds.slice(0, limit);
    } else {
      const q = `(bill OR invoice OR statement) newer_than:${lookbackDays}d`;
      const list = await gmailJson<{ messages?: Array<{ id: string }> }>(
        accessToken,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`,
      );
      messageIds = (list.messages ?? []).map((m) => m.id);
    }

    const messages: GmailFetchResult["messages"] = [];

    for (const id of messageIds) {
      const rawMsg = await gmailJson<{ raw?: string }>(
        accessToken,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`,
      );
      if (!rawMsg.raw) continue;

      const eml = Buffer.from(rawMsg.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const parsed = parseEml(eml);
      if (
        !isLikelyBillEmail({
          subject: parsed.subject,
          from: parsed.from,
          bodyText: parsed.bodyText,
          attachmentMimeTypes: parsed.attachments.map((a) => a.mimeType),
        })
      ) {
        continue;
      }

      messages.push({
        ...parsed,
        gmailMessageId: id,
        messageId: parsed.messageId || id,
      });
    }

    return {
      messages,
      historyId: profile.historyId,
    };
  }
}

function clampPositive(n: number, max: number): number {
  if (!Number.isFinite(n) || n < 1) return max;
  return Math.min(Math.floor(n), max);
}

async function gmailJson<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail API ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}
