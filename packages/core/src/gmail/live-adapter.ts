import type { GmailAccount } from "../domain.js";
import { isLikelyBillEmail } from "../imap/filter.js";
import { parseEml } from "../ingest/eml.js";
import type { GmailFetchResult, GmailIngestPort } from "./port.js";

const FIRST_SYNC_MAX = 15;

/**
 * Gmail API pull — messages.get format=raw → parseEml (ADR-008).
 * Incremental sync via historyId when available.
 */
export class LiveGmailAdapter implements GmailIngestPort {
  readonly mode = "live" as const;

  async fetchNewMessages(
    account: GmailAccount,
    accessToken: string,
  ): Promise<GmailFetchResult> {
    const profile = await gmailJson<{ historyId: string }>(
      accessToken,
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    );

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
    } else {
      const list = await gmailJson<{ messages?: Array<{ id: string }> }>(
        accessToken,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent("bill OR invoice OR statement")}&maxResults=${FIRST_SYNC_MAX}`,
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
