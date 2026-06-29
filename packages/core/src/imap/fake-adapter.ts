import type { ImapAccount } from "../domain.js";
import type { ImapFetchResult, ImapIngestPort } from "./port.js";

/**
 * Deterministic IMAP sandbox — one utility bill per poll when lastUid < 500.
 * Why: test poll → ingest → HITL without real mailbox credentials.
 */
export class FakeImapAdapter implements ImapIngestPort {
  readonly mode = "sandbox" as const;
  private readonly highWater = 500;

  async fetchNewMessages(account: ImapAccount, _password: string): Promise<ImapFetchResult> {
    const startUid = (account.lastUid ?? 0) + 1;
    if (startUid > this.highWater) {
      return { messages: [], highUid: account.lastUid };
    }

    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 9);
    const dueStr = due.toISOString().slice(0, 10);
    const body = [
      "Your electric bill is ready.",
      "",
      "Payee: Sandbox Electric Co",
      "Amount: $89.15",
      `Due: ${dueStr}`,
      "Cadence: monthly",
    ].join("\n");

    const uid = startUid;
    return {
      messages: [
        {
          uid,
          messageId: `sandbox_imap_${account.id}_${uid}`,
          subject: "Your electric bill is ready",
          from: "billing@sandbox-electric.local",
          to: account.username,
          bodyText: body,
          attachments: [
            {
              filename: "electric-bill.txt",
              mimeType: "text/plain",
              bytes: Buffer.from(body, "utf8"),
            },
          ],
        },
      ],
      highUid: uid,
    };
  }
}

export function createImapAdapter(): ImapIngestPort {
  if (process.env.ATTACHE_IMAP_MODE === "sandbox") {
    return new FakeImapAdapter();
  }
  // Lazy import avoids loading imapflow in sandbox/test when not needed.
  return new LiveImapAdapterLazy();
}

/** Deferred load of imapflow for live mode. */
class LiveImapAdapterLazy implements ImapIngestPort {
  readonly mode = "live" as const;
  private inner: ImapIngestPort | null = null;

  private async getInner(): Promise<ImapIngestPort> {
    if (!this.inner) {
      const { LiveImapAdapter } = await import("./live-adapter.js");
      this.inner = new LiveImapAdapter();
    }
    return this.inner;
  }

  fetchNewMessages(account: ImapAccount, password: string): Promise<ImapFetchResult> {
    return this.getInner().then((a) => a.fetchNewMessages(account, password));
  }
}
