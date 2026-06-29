import { ImapFlow } from "imapflow";
import type { ImapAccount } from "../domain.js";
import { parseEml } from "../ingest/eml.js";
import { isLikelyBillEmail } from "./filter.js";
import type { ImapFetchResult, ImapFetchedMessage, ImapIngestPort } from "./port.js";

const FIRST_SYNC_LIMIT = 25;

/**
 * Live IMAP pull via imapflow — read-only, incremental by UID.
 * What: connect, search new UIDs, parse .eml source, filter bill-like messages.
 */
export class LiveImapAdapter implements ImapIngestPort {
  readonly mode = "live" as const;

  async fetchNewMessages(account: ImapAccount, password: string): Promise<ImapFetchResult> {
    const client = new ImapFlow({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: {
        user: account.username,
        pass: password,
      },
      logger: false,
    });

    await client.connect();
    const messages: ImapFetchedMessage[] = [];
    let highUid: number | null = account.lastUid;

    try {
      const lock = await client.getMailboxLock(account.mailbox);
      try {
        let uids: number[];
        if (account.lastUid != null) {
          const found = await client.search({ uid: `${account.lastUid + 1}:*` }, { uid: true });
          uids = found === false ? [] : found;
        } else {
          const all = await client.search({ all: true }, { uid: true });
          uids = all === false ? [] : all.slice(-FIRST_SYNC_LIMIT);
        }

        if (!uids.length) {
          return { messages: [], highUid: account.lastUid };
        }

        for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
          if (!msg.source || !msg.uid) continue;
          highUid = Math.max(highUid ?? 0, msg.uid);
          const parsed = parseEml(Buffer.from(msg.source));
          const attachmentMimeTypes = parsed.attachments.map((a) => a.mimeType);
          if (
            !isLikelyBillEmail({
              subject: parsed.subject,
              from: parsed.from,
              bodyText: parsed.bodyText,
              attachmentMimeTypes,
            })
          ) {
            continue;
          }
          messages.push({
            ...parsed,
            uid: msg.uid,
            messageId: parsed.messageId || `imap-uid-${msg.uid}`,
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return { messages, highUid };
  }
}
