import type { GmailAccount } from "../domain.js";
import type { GmailFetchOptions, GmailFetchResult, GmailIngestPort } from "./port.js";
import type { GmailFetchedMessage } from "./port.js";

/**
 * Deterministic Gmail sandbox — mixed discover fixtures on first poll (ADR-015).
 * What: one utility bill, one Chase statement, one Fidelity brokerage statement,
 *       one marketing newsletter, one property-tax bill, one auto-policy bill,
 *       one medical EOB (dropped).
 * Why: poll/discover ranks bills vs Plaid/SnapTrade connect hints, home/vehicle
 *      asset hints (P4), and drops newsletters + PHI.
 * Incremental: historyId sandbox-done → empty (same as before).
 */
export class FakeGmailAdapter implements GmailIngestPort {
  readonly mode = "sandbox" as const;

  async fetchNewMessages(
    account: GmailAccount,
    _accessToken: string,
    options?: GmailFetchOptions,
  ): Promise<GmailFetchResult> {
    if (account.historyId === "sandbox-done") {
      return { messages: [], historyId: "sandbox-done" };
    }

    const limit = options?.limit ?? sandboxFixtures(account).length;
    const messages = sandboxFixtures(account).slice(0, Math.max(0, limit));
    return {
      messages,
      historyId: "sandbox-done",
    };
  }
}

/** Exported for discover tests that assert fixture shape without polling. */
export function sandboxFixtures(account: GmailAccount): GmailFetchedMessage[] {
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 11);
  const dueStr = due.toISOString().slice(0, 10);

  const billBody = [
    "Your utility bill is ready.",
    "",
    "Payee: Sandbox Gmail Utility",
    "Amount: $71.25",
    `Due: ${dueStr}`,
    "Cadence: monthly",
  ].join("\n");

  const statementBody = [
    "Your Chase checking statement is ready.",
    "",
    "Institution: Chase",
    "Classifier: statement",
    "Rail: plaid",
  ].join("\n");

  const brokerageBody = [
    "Your Fidelity brokerage statement is ready.",
    "",
    "Institution: Fidelity",
    "Classifier: statement",
    "Rail: snaptrade",
  ].join("\n");

  const newsletterBody = [
    "This week's deals — 20% off everything.",
    "Unsubscribe if you no longer want these emails.",
  ].join("\n");

  const propertyTaxBody = [
    "County property tax bill.",
    "",
    "Payee: County Tax Collector",
    "Amount: $420.00",
    `Due: ${dueStr}`,
    "Cadence: yearly",
  ].join("\n");

  const autoPolicyBody = [
    "Your auto insurance premium is due.",
    "",
    "Payee: Sandbox Auto Insurance",
    "Amount: $98.00",
    `Due: ${dueStr}`,
    "Cadence: monthly",
  ].join("\n");

  const eobBody = [
    "Explanation of Benefits",
    "Patient ID: 999-00",
    "Claim processed — this is not a bill.",
    "Amount due: $0.00",
  ].join("\n");

  return [
    {
      gmailMessageId: `sandbox_gmail_bill_${account.id}`,
      messageId: `sandbox_gmail_bill_${account.id}`,
      subject: "Your utility bill is ready",
      from: "billing@sandbox-gmail.local",
      to: account.email,
      bodyText: billBody,
      attachments: [
        {
          filename: "utility-bill.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(billBody, "utf8"),
        },
      ],
    },
    {
      gmailMessageId: `sandbox_gmail_statement_${account.id}`,
      messageId: `sandbox_gmail_statement_${account.id}`,
      subject: "Your Chase checking statement is ready",
      from: "statements@chase.example",
      to: account.email,
      bodyText: statementBody,
      attachments: [
        {
          filename: "chase-statement.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(statementBody, "utf8"),
        },
      ],
    },
    {
      gmailMessageId: `sandbox_gmail_brokerage_${account.id}`,
      messageId: `sandbox_gmail_brokerage_${account.id}`,
      subject: "Your Fidelity brokerage statement is ready",
      from: "statements@fidelity.example",
      to: account.email,
      bodyText: brokerageBody,
      attachments: [
        {
          filename: "fidelity-statement.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(brokerageBody, "utf8"),
        },
      ],
    },
    {
      gmailMessageId: `sandbox_gmail_newsletter_${account.id}`,
      messageId: `sandbox_gmail_newsletter_${account.id}`,
      subject: "This week's deals — 20% off",
      from: "deals@shop.example",
      to: account.email,
      bodyText: newsletterBody,
      attachments: [
        {
          filename: "deals.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(newsletterBody, "utf8"),
        },
      ],
    },
    {
      gmailMessageId: `sandbox_gmail_property_tax_${account.id}`,
      messageId: `sandbox_gmail_property_tax_${account.id}`,
      subject: "County property tax bill",
      from: "tax@county.example",
      to: account.email,
      bodyText: propertyTaxBody,
      attachments: [
        {
          filename: "property-tax.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(propertyTaxBody, "utf8"),
        },
      ],
    },
    {
      gmailMessageId: `sandbox_gmail_auto_${account.id}`,
      messageId: `sandbox_gmail_auto_${account.id}`,
      subject: "Your auto insurance premium is due",
      from: "billing@auto-ins.example",
      to: account.email,
      bodyText: autoPolicyBody,
      attachments: [
        {
          filename: "auto-insurance.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(autoPolicyBody, "utf8"),
        },
      ],
    },
    {
      gmailMessageId: `sandbox_gmail_eob_${account.id}`,
      messageId: `sandbox_gmail_eob_${account.id}`,
      subject: "Your explanation of benefits is ready",
      from: "eob@healthplan.example",
      to: account.email,
      bodyText: eobBody,
      attachments: [
        {
          filename: "eob.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(eobBody, "utf8"),
        },
      ],
    },
  ];
}

export function createGmailAdapter(): GmailIngestPort {
  if (process.env.ATTACHE_GMAIL_MODE === "sandbox") {
    return new FakeGmailAdapter();
  }
  // Live when OAuth app configured; otherwise sandbox for dogfood/CI/MCP.
  if (
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim()
  ) {
    return new LiveGmailAdapterLazy();
  }
  return new FakeGmailAdapter();
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

  fetchNewMessages(
    account: GmailAccount,
    accessToken: string,
    options?: GmailFetchOptions,
  ): Promise<GmailFetchResult> {
    return this.getInner().then((a) => a.fetchNewMessages(account, accessToken, options));
  }
}
