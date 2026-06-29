import type { GmailAccount } from "../domain.js";
import type { GmailFetchResult, GmailIngestPort } from "./port.js";

/**
 * Deterministic Gmail sandbox — one bill per poll when history cursor is empty.
 */
export class FakeGmailAdapter implements GmailIngestPort {
  readonly mode = "sandbox" as const;

  async fetchNewMessages(account: GmailAccount, _accessToken: string): Promise<GmailFetchResult> {
    if (account.historyId === "sandbox-done") {
      return { messages: [], historyId: "sandbox-done" };
    }

    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 11);
    const dueStr = due.toISOString().slice(0, 10);
    const body = [
      "Your utility bill is ready.",
      "",
      "Payee: Sandbox Gmail Utility",
      "Amount: $71.25",
      `Due: ${dueStr}`,
      "Cadence: monthly",
    ].join("\n");

    return {
      messages: [
        {
          gmailMessageId: `sandbox_gmail_${account.id}`,
          messageId: `sandbox_gmail_${account.id}`,
          subject: "Your utility bill is ready",
          from: "billing@sandbox-gmail.local",
          to: account.email,
          bodyText: body,
          attachments: [
            {
              filename: "utility-bill.txt",
              mimeType: "text/plain",
              bytes: Buffer.from(body, "utf8"),
            },
          ],
        },
      ],
      historyId: "sandbox-done",
    };
  }
}

export function createGmailAdapter(): GmailIngestPort {
  if (process.env.ATTACHE_GMAIL_MODE === "sandbox") {
    return new FakeGmailAdapter();
  }
  return new LiveGmailAdapterLazy();
}

class LiveGmailAdapterLazy implements GmailIngestPort {
  readonly mode = "live" as const;
  private inner: GmailIngestPort | null = null;

  private async getInner(): Promise<GmailIngestPort> {
    if (!this.inner) {
      const { LiveGmailAdapter } = await import("./live-adapter.js");
      this.inner = new LiveGmailAdapter();
    }
    return this.inner;
  }

  fetchNewMessages(account: GmailAccount, accessToken: string): Promise<GmailFetchResult> {
    return this.getInner().then((a) => a.fetchNewMessages(account, accessToken));
  }
}
