#!/usr/bin/env node
/**
 * attache CLI — agent-first operations (VS-3 Plaid, VS-4 ingest, VS-4.2 IMAP).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  confirmBillIngest,
  connectImapAccount,
  connectSandboxGmail,
  connectGmailViaLoopback,
  connectSandboxPlaid,
  createDocumentAdapter,
  createEmailAdapter,
  createPlaidAdapter,
  dropEmlIntoInbox,
  getOrCreateIngestToken,
  getRunwaySnapshot,
  getVault,
  inboxDirForToken,
  ingestDocumentBytes,
  ingestEmailAddress,
  ingestEmailBatch,
  isGoogleOAuthConfigured,
  isOnboarded,
  listAccounts,
  listGmailAccounts,
  listImapAccounts,
  listObligationsForAgent,
  listObligations,
  obligationDisplayStatus,
  listPendingBillReviews,
  listPlaidItems,
  listRecentTransactions,
  listNotifications,
  markNotificationRead,
  openDatabase,
  pollGmailIngest,
  pollImapIngest,
  proposeTransfer,
  createTransferProposal,
  listTransferProposals,
  approveTransferProposal,
  rejectTransferProposal,
  refreshNotifications,
  syncAllPlaidItems,
  type ObligationFilter,
} from "@attache/core";

const [, , cmd, sub, ...rest] = process.argv;

async function main(): Promise<void> {
  if (cmd === "plaid") {
    await plaidCommand(sub);
    return;
  }
  if (cmd === "ingest") {
    await ingestCommand(sub, rest);
    return;
  }
  if (cmd === "agent") {
    await agentCommand(sub, rest);
    return;
  }
  if (cmd === "notifications") {
    await notificationsCommand(sub, rest);
    return;
  }
  if (cmd === "accounts") {
    await accountsCommand(sub);
    return;
  }
  if (cmd === "obligations") {
    await obligationsCommand(sub);
    return;
  }
  if (cmd === "transfer") {
    await transferCommand(sub, rest);
    return;
  }
  printHelp();
  process.exit(cmd ? 1 : 0);
}

async function plaidCommand(sub: string | undefined): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }
    const adapter = createPlaidAdapter();
    const vault = getVault();

    switch (sub) {
      case "status": {
        const items = listPlaidItems(db);
        const txCount = listRecentTransactions(db, 100).length;
        console.log(JSON.stringify({ items, transactionCount: txCount, mode: adapter.mode }, null, 2));
        break;
      }
      case "connect-sandbox": {
        const result = await connectSandboxPlaid(db, adapter, vault);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "sync": {
        const results = await syncAllPlaidItems(db, adapter, vault);
        if (!results.length) {
          console.log("No Plaid items — run: attache plaid connect-sandbox");
          process.exit(1);
        }
        console.log(JSON.stringify(results, null, 2));
        break;
      }
      default:
        console.error("Usage: attache plaid status|connect-sandbox|sync");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

async function imapCommand(imapSub: string | undefined, args: string[]): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }
    const vault = getVault();

    switch (imapSub) {
      case "status": {
        console.log(JSON.stringify({ accounts: listImapAccounts(db) }, null, 2));
        break;
      }
      case "connect": {
        const flags = parseFlags(args);
        const host = flags.host;
        const user = flags.user ?? flags.username;
        const password = flags.password ?? process.env.ATTACHE_IMAP_PASSWORD;
        if (!host || !user || !password) {
          console.error(
            "Usage: attache ingest imap connect --host imap.gmail.com --user you@gmail.com --password APP_PW",
          );
          console.error("Or set ATTACHE_IMAP_PASSWORD env var.");
          process.exit(1);
        }
        const account = connectImapAccount(db, vault, {
          label: flags.label,
          host,
          username: user,
          password,
          mailbox: flags.mailbox ?? "INBOX",
          port: flags.port ? Number(flags.port) : undefined,
        });
        console.log(JSON.stringify(account, null, 2));
        break;
      }
      default:
        console.error("Usage: attache ingest imap status|connect");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function gmailCommand(gmailSub: string | undefined, args: string[]): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }
    const vault = getVault();

    switch (gmailSub) {
      case "status": {
        console.log(JSON.stringify({ accounts: listGmailAccounts(db) }, null, 2));
        break;
      }
      case "connect": {
        if (process.env.ATTACHE_GMAIL_MODE === "sandbox" || !isGoogleOAuthConfigured()) {
          const account = connectSandboxGmail(db, vault);
          console.log(JSON.stringify(account, null, 2));
          break;
        }
        const portIdx = args.indexOf("--port");
        const port = portIdx >= 0 ? Number(args[portIdx + 1]) : undefined;
        const noBrowser = args.includes("--no-browser");
        console.error("Opening browser for Google consent (loopback OAuth)…");
        const result = await connectGmailViaLoopback(db, vault, {
          port: Number.isFinite(port) ? port : undefined,
          openBrowser: !noBrowser,
        });
        console.log(
          JSON.stringify(
            {
              account: result.account,
              redirectUri: result.redirectUri,
              message: "Gmail connected — tokens stored in vault",
            },
            null,
            2,
          ),
        );
        break;
      }
      case "connect-sandbox": {
        const account = connectSandboxGmail(db, vault);
        console.log(JSON.stringify(account, null, 2));
        break;
      }
      default:
        console.error(
          "Usage: attache ingest gmail status|connect [--port N] [--no-browser]|connect-sandbox",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function ingestCommand(sub: string | undefined, args: string[]): Promise<void> {
  if (sub === "imap") {
    await imapCommand(args[0], args.slice(1));
    return;
  }
  if (sub === "gmail") {
    await gmailCommand(args[0], args.slice(1));
    return;
  }

  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }
    const docAdapter = createDocumentAdapter();
    const vault = getVault();

    switch (sub) {
      case "status": {
        const token = getOrCreateIngestToken(db);
        const pending = listPendingBillReviews(db);
        console.log(
          JSON.stringify(
            {
              ingestAddress: ingestEmailAddress(token),
              maildropDir: `${inboxDirForToken(token)}/`,
              imapAccounts: listImapAccounts(db),
              gmailAccounts: listGmailAccounts(db),
              gmailOAuth: isGoogleOAuthConfigured(),
              extractUrl: process.env.ATTACHE_EXTRACT_URL ?? null,
              pendingCount: pending.length,
              pending: pending.map((e) => ({
                id: e.id,
                source: e.source,
                confidence: e.confidence,
                ingestedAt: e.ingestedAt,
              })),
              mode: docAdapter.mode,
            },
            null,
            2,
          ),
        );
        break;
      }
      case "poll-gmail": {
        const batch = await pollGmailIngest(db, vault, docAdapter);
        console.log(JSON.stringify(batch, null, 2));
        break;
      }
      case "poll-imap": {
        const batch = await pollImapIngest(db, vault, docAdapter);
        console.log(JSON.stringify(batch, null, 2));
        break;
      }
      case "upload": {
        const filePath = args[0];
        if (!filePath) {
          console.error("Usage: attache ingest upload <path>");
          process.exit(1);
        }
        const abs = resolve(filePath);
        const bytes = readFileSync(abs);
        const filename = abs.split("/").pop() ?? "upload.txt";
        const result = await ingestDocumentBytes(db, docAdapter, {
          filename,
          mimeType: filename.endsWith(".txt") ? "text/plain" : "application/octet-stream",
          bytes,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "simulate-email": {
        const token = getOrCreateIngestToken(db);
        const batch = await ingestEmailBatch(
          db,
          docAdapter,
          createEmailAdapter("sandbox"),
          token,
        );
        console.log(JSON.stringify(batch, null, 2));
        break;
      }
      case "poll-email": {
        const token = getOrCreateIngestToken(db);
        const batch = await ingestEmailBatch(
          db,
          docAdapter,
          createEmailAdapter("live"),
          token,
        );
        console.log(JSON.stringify(batch, null, 2));
        break;
      }
      case "drop-email": {
        const filePath = args[0];
        if (!filePath) {
          console.error("Usage: attache ingest drop-email <file.eml>");
          process.exit(1);
        }
        const token = getOrCreateIngestToken(db);
        const abs = resolve(filePath);
        let bytes = readFileSync(abs);
        let text = bytes.toString("utf8");
        if (text.includes("PLACEHOLDER")) {
          text = text.replace(/PLACEHOLDER/g, token);
          bytes = Buffer.from(text, "utf8");
        }
        const dest = dropEmlIntoInbox(token, abs, bytes);
        console.log(JSON.stringify({ dropped: dest, token }, null, 2));
        break;
      }
      case "confirm": {
        const eventId = args[0];
        if (!eventId) {
          console.error("Usage: attache ingest confirm <eventId>");
          process.exit(1);
        }
        const obligation = confirmBillIngest(db, eventId);
        console.log(JSON.stringify(obligation, null, 2));
        break;
      }
      default:
        console.error(
          "Usage: attache ingest status|upload|poll-gmail|poll-imap|poll-email|drop-email|simulate-email|confirm|imap …|gmail …",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function agentCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }

    switch (sub) {
      case "runway": {
        const daysIdx = args.indexOf("--days");
        const horizonDays = daysIdx >= 0 ? Number(args[daysIdx + 1]) : 30;
        const snapshot = getRunwaySnapshot(db, horizonDays);
        const accounts = listAccounts(db).map((a) => ({
          id: a.id,
          name: a.name,
          balanceUsd: a.balanceUsd,
          kind: a.kind,
        }));
        console.log(JSON.stringify({ ...snapshot, accounts }, null, 2));
        break;
      }
      case "obligations": {
        const filterIdx = args.indexOf("--filter");
        const filter = (filterIdx >= 0 ? args[filterIdx + 1] : "unpaid") as ObligationFilter;
        const rows = listObligationsForAgent(db, filter);
        console.log(JSON.stringify({ count: rows.length, obligations: rows }, null, 2));
        break;
      }
      case "propose-transfer": {
        const fromIdx = args.indexOf("--from");
        const toIdx = args.indexOf("--to");
        const amountIdx = args.indexOf("--amount");
        const memoIdx = args.indexOf("--memo");
        const daysIdx = args.indexOf("--days");
        const fromAccountId = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
        const amountUsd = amountIdx >= 0 ? Number(args[amountIdx + 1]) : NaN;
        if (!fromAccountId || !Number.isFinite(amountUsd)) {
          console.error(
            "Usage: attache agent propose-transfer --from <id> --amount <usd> [--to <id>] [--memo ...] [--days N]",
          );
          process.exit(1);
        }
        const proposal = proposeTransfer(db, {
          fromAccountId,
          toAccountId: toIdx >= 0 ? args[toIdx + 1] : undefined,
          amountUsd,
          memo: memoIdx >= 0 ? args[memoIdx + 1] : undefined,
          horizonDays: daysIdx >= 0 ? Number(args[daysIdx + 1]) : undefined,
        });
        console.log(JSON.stringify(proposal, null, 2));
        break;
      }
      default:
        console.error(
          "Usage: attache agent runway|obligations|propose-transfer",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function transferCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }

    switch (sub) {
      case "list": {
        const status = args.includes("--pending") ? "pending" : undefined;
        const rows = listTransferProposals(db, status ? { status: "pending" } : {});
        console.log(JSON.stringify({ count: rows.length, proposals: rows }, null, 2));
        break;
      }
      case "submit": {
        const fromIdx = args.indexOf("--from");
        const toIdx = args.indexOf("--to");
        const amountIdx = args.indexOf("--amount");
        const memoIdx = args.indexOf("--memo");
        const fromAccountId = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
        const amountUsd = amountIdx >= 0 ? Number(args[amountIdx + 1]) : NaN;
        if (!fromAccountId || !Number.isFinite(amountUsd)) {
          console.error(
            "Usage: attache transfer submit --from <id> --amount <usd> [--to <id>] [--memo ...]",
          );
          process.exit(1);
        }
        const record = createTransferProposal(db, {
          fromAccountId,
          toAccountId: toIdx >= 0 ? args[toIdx + 1] : undefined,
          amountUsd,
          memo: memoIdx >= 0 ? args[memoIdx + 1] : undefined,
          proposedBy: "cli",
        });
        console.log(JSON.stringify(record, null, 2));
        break;
      }
      case "approve": {
        const id = args[0];
        const noteIdx = args.indexOf("--note");
        if (!id) {
          console.error("Usage: attache transfer approve <id> [--note ...]");
          process.exit(1);
        }
        const record = approveTransferProposal(
          db,
          id,
          noteIdx >= 0 ? args[noteIdx + 1] : undefined,
        );
        console.log(JSON.stringify(record, null, 2));
        break;
      }
      case "reject": {
        const id = args[0];
        const noteIdx = args.indexOf("--note");
        if (!id) {
          console.error("Usage: attache transfer reject <id> [--note ...]");
          process.exit(1);
        }
        const record = rejectTransferProposal(
          db,
          id,
          noteIdx >= 0 ? args[noteIdx + 1] : undefined,
        );
        console.log(JSON.stringify(record, null, 2));
        break;
      }
      default:
        console.error("Usage: attache transfer list|submit|approve|reject");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function accountsCommand(sub: string | undefined): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }
    if (sub !== "list") {
      console.error("Usage: attache accounts list");
      process.exit(1);
    }
    const accounts = listAccounts(db);
    console.log(JSON.stringify({ count: accounts.length, accounts }, null, 2));
  } finally {
    db.close();
  }
}

async function obligationsCommand(sub: string | undefined): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }
    if (sub !== "list") {
      console.error("Usage: attache obligations list");
      process.exit(1);
    }
    const rows = listObligations(db).map((o) => ({
      ...o,
      status: obligationDisplayStatus(o),
    }));
    console.log(JSON.stringify({ count: rows.length, obligations: rows }, null, 2));
  } finally {
    db.close();
  }
}

async function notificationsCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }

    switch (sub) {
      case "list": {
        refreshNotifications(db);
        const unreadOnly = args.includes("--unread");
        const rows = listNotifications(db, { unreadOnly });
        console.log(JSON.stringify({ count: rows.length, notifications: rows }, null, 2));
        break;
      }
      case "refresh": {
        const result = refreshNotifications(db);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "ack": {
        const id = args[0];
        if (!id) {
          console.error("Usage: attache notifications ack <id>");
          process.exit(1);
        }
        const n = markNotificationRead(db, id);
        console.log(JSON.stringify(n ?? { error: "not found" }, null, 2));
        break;
      }
      default:
        console.error("Usage: attache notifications list|refresh|ack");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

function printHelp(): void {
  console.log(`attache — household finance CLI

Commands:
  attache accounts list                 Funding accounts with balances
  attache obligations list              All bills with display status

  attache transfer list [--pending]        Transfer approval queue
  attache transfer submit --from <id> --amount <usd> [--to <id>]
  attache transfer approve <id> [--note ...]
  attache transfer reject <id> [--note ...]

  attache agent runway [--days N]     Solvency snapshot + accounts
  attache agent obligations [--filter all|upcoming|overdue|unpaid]
  attache agent propose-transfer --from <id> --amount <usd> [--to <id>] [--memo ...]

  attache notifications list [--unread]   List alerts (refreshes first)
  attache notifications refresh           Recompute alerts from household state
  attache notifications ack <id>          Mark alert read

  attache plaid status              JSON status of linked items
  attache plaid connect-sandbox     Link demo Chase (no API keys)
  attache plaid sync                Pull latest transactions

  attache ingest status             Review queue + IMAP accounts
  attache ingest gmail connect [--port 8765] [--no-browser]
                                      Loopback OAuth — no web server required
  attache ingest gmail connect-sandbox  Sandbox Gmail account
  attache ingest gmail status           List Gmail accounts
  attache ingest poll-gmail             Pull bills via Gmail API
  attache ingest imap connect           Connect mailbox (--host --user --password)
  attache ingest imap status        List IMAP accounts
  attache ingest poll-imap          Pull new bill email via IMAP
  attache ingest upload <file>      Extract bill from document
  attache ingest poll-email         Poll local maildrop
  attache ingest drop-email <eml>   Stage .eml in maildrop
  attache ingest simulate-email     Sandbox fixture email
  attache ingest confirm <eventId>  Promote reviewed bill → obligation
`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
