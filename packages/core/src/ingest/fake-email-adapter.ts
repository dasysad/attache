import type { EmailIngestPort, InboundEmailMessage } from "./email-port.js";
import { MaildropEmailAdapter } from "./maildrop-email-adapter.js";

/**
 * Returns one canned utility bill email per fetch — deduped by messageId in bill ingest.
 * Why: exercises email → attachment → document pipeline without real mailbox infra.
 */
export class FakeEmailAdapter implements EmailIngestPort {
  readonly mode = "sandbox" as const;

  async fetchPending(_ingestToken: string): Promise<InboundEmailMessage[]> {
    const due = new Date();
    due.setUTCDate(due.getUTCDate() + 12);
    const dueStr = due.toISOString().slice(0, 10);
    const body = [
      "Your water bill is ready.",
      "",
      "Payee: East Bay Municipal Utility District",
      "Amount: $78.40",
      `Due: ${dueStr}`,
      "Cadence: monthly",
    ].join("\n");

    return [
      {
        messageId: `sandbox_email_ebmud_${dueStr}`,
        subject: "Your EBMUD bill is ready",
        from: "billing@ebmud.com",
        to: "bills+sandbox@ingest.attache.app",
        bodyText: body,
        attachments: [
          {
            filename: "ebmud-bill.txt",
            mimeType: "text/plain",
            bytes: Buffer.from(body, "utf8"),
          },
        ],
      },
    ];
  }
}

export type EmailAdapterMode = "sandbox" | "live";

/**
 * sandbox → deterministic fixture; live → maildrop inbox (VS-4.1).
 * Set ATTACHE_EMAIL_MODE=sandbox to force fixture during dev.
 */
export function createEmailAdapter(mode?: EmailAdapterMode): EmailIngestPort {
  const resolved =
    mode ??
    (process.env.ATTACHE_EMAIL_MODE === "sandbox" ? "sandbox" : "live");
  if (resolved === "sandbox") return new FakeEmailAdapter();
  return new MaildropEmailAdapter();
}
