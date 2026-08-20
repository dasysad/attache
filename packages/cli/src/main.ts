#!/usr/bin/env node
/**
 * attache CLI — agent-first operations (VS-3 Plaid, VS-4 ingest, VS-4.2 IMAP,
 * VS-8 vault/encryption).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  createKeyfile,
  DatabaseLockedError,
  defaultDataDir,
  encryptPlaintextDatabase,
  encryptPlaintextSecrets,
  hasKeyfile,
  readKeyfile,
  rewrapDek,
  unwrapDek,
  vaultStatus,
  writeKeyfile,
  confirmBillIngest,
  createAccount,
  createObligation,
  markObligationPaid,
  createTenant,
  connectImapAccount,
  connectSandboxGmail,
  connectGmailViaLoopback,
  connectSandboxPlaid,
  connectLivePlaid,
  createPlaidLinkToken,
  connectPlaidViaLoopback,
  createDocumentAdapter,
  createEmailAdapter,
  createPlaidAdapter,
  FakeDocumentAdapter,
  isPlaidConfigured,
  LivePlaidAdapter,
  runBillExtractionEval,
  dropEmlIntoInbox,
  getOrCreateIngestToken,
  getRunwaySnapshot,
  collectAttention,
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
  listActivity,
  listSnapTradePositions,
  listNotifications,
  markNotificationRead,
  markSetupComplete,
  setupOnboardNextHint,
  openDatabase,
  parseFundingKind,
  computeNetWorth,
  computeCashflow,
  computeCashflowTrend,
  listHouseholdAssets,
  createHouseholdAsset,
  confirmAssetHint,
  deleteHouseholdAsset,
  listHouseholdEntities,
  setTransactionCategory,
  pollGmailIngest,
  pollImapIngest,
  discoverMailCandidates,
  proposeTransfer,
  createTransferProposal,
  listTransferProposals,
  approveTransferProposal,
  rejectTransferProposal,
  createTransferRule,
  listTransferRules,
  disableTransferRule,
  evaluateTransferRules,
  installTransferRulesSchedule,
  uninstallTransferRulesSchedule,
  transferRulesScheduleStatus,
  refreshNotifications,
  syncAllPlaidItems,
  unlinkPlaidItem,
  deleteManualAccount,
  unlinkGmailAccount,
  unlinkImapAccount,
  transferHonesty,
  transferApprovalMessage,
  createSnapTradeAdapter,
  isSnapTradeConfigured,
  connectSandboxSnapTrade,
  connectLiveSnapTrade,
  syncAllSnapTradeConnections,
  listSnapTradeConnections,
  countSnapTradeLinkedAccounts,
  unlinkSnapTradeConnection,
  ledgerStatus,
  achStatus,
  simulateAchPosted,
  syncAchTransfers,
  achWebhookStatus,
  registerPushDevice,
  listPushDevices,
  unlinkPushDevice,
  fcmStatus,
  checkCredentialHygiene,
  createHibpAdapter,
  FakeHibpAdapter,
  credentialAssist,
  hostedIngressStatus,
  type FundingAccountKind,
  type ObligationCadence,
  type ObligationFilter,
} from "@attache/core";

const [, , cmd, sub, ...rest] = process.argv;

async function main(): Promise<void> {
  if (cmd === "plaid") {
    await plaidCommand(sub, rest);
    return;
  }
  if (cmd === "snaptrade") {
    await snaptradeCommand(sub, rest);
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
  if (cmd === "devices") {
    await devicesCommand(sub, rest);
    return;
  }
  if (cmd === "credentials") {
    await credentialsCommand(sub, rest);
    return;
  }
  if (cmd === "onboard") {
    await onboardCommand([sub, ...rest].filter((a): a is string => Boolean(a)));
    return;
  }
  if (cmd === "accounts") {
    await accountsCommand(sub, rest);
    return;
  }
  if (cmd === "activity") {
    await activityCommand(sub, rest);
    return;
  }
  if (cmd === "net-worth") {
    await netWorthCommand();
    return;
  }
  if (cmd === "assets") {
    await assetsCommand(sub, rest);
    return;
  }
  if (cmd === "entities") {
    await entitiesCommand(sub);
    return;
  }
  if (cmd === "cashflow") {
    await cashflowCommand([sub, ...rest].filter((a): a is string => Boolean(a)));
    return;
  }
  if (cmd === "obligations") {
    await obligationsCommand(sub, rest);
    return;
  }
  if (cmd === "ach") {
    await achCommand(sub, rest);
    return;
  }
  if (cmd === "ledger") {
    await ledgerCommand(sub);
    return;
  }
  if (cmd === "transfer") {
    await transferCommand(sub, rest);
    return;
  }
  if (cmd === "vault") {
    await vaultCommand(sub, rest);
    return;
  }
  printHelp();
  process.exit(cmd ? 1 : 0);
}

/**
 * Read a passphrase without echoing it (VS-8). Resolution:
 *   1. `envVar` (e.g. ATTACHE_PASSPHRASE) — for agents / non-interactive use.
 *   2. hidden TTY prompt — for humans.
 * Throws if neither is available (no env + not a TTY), so agents fail loudly
 * rather than hanging on stdin.
 */
async function readPassphrase(label: string, envVar: string): Promise<string> {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    throw new Error(
      `No TTY for prompt and ${envVar} is unset. Set ${envVar} for non-interactive use.`,
    );
  }

  return new Promise<string>((resolvePw) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // Mute echo: suppress readline's output writes while capturing the answer.
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    rlAny._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    process.stdout.write(label);
    muted = true;
    rl.question("", (answer) => {
      muted = false;
      rl.close();
      process.stdout.write("\n");
      resolvePw(answer);
    });
  });
}

/** Open the DB for CLI commands — env first, then interactive passphrase on a TTY. */
async function openCliDatabase() {
  try {
    return openDatabase(defaultDataDir(), { env: process.env });
  } catch (e) {
    if (e instanceof DatabaseLockedError && process.stdin.isTTY) {
      const passphrase = await readPassphrase("Vault passphrase: ", "ATTACHE_PASSPHRASE");
      return openDatabase(defaultDataDir(), { passphrase });
    }
    throw e;
  }
}

async function vaultCommand(sub: string | undefined, _args: string[]): Promise<void> {
  const dataDir = defaultDataDir();

  switch (sub) {
    case "status": {
      const status = vaultStatus(dataDir);
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    case "init": {
      if (hasKeyfile(dataDir)) {
        console.error("Vault already initialized. Use `attache vault status`.");
        process.exit(1);
      }
      const existing = vaultStatus(dataDir);
      if (existing.databaseExists) {
        console.error(
          "A plaintext database already exists. Use `attache vault encrypt` to migrate it.",
        );
        process.exit(1);
      }
      const passphrase = await readPassphrase("New passphrase: ", "ATTACHE_PASSPHRASE");
      if (process.stdin.isTTY && !process.env.ATTACHE_PASSPHRASE) {
        const confirm = await readPassphrase("Confirm passphrase: ", "__never__");
        if (confirm !== passphrase) {
          console.error("Passphrases did not match.");
          process.exit(1);
        }
      }
      const { keyfile } = createKeyfile(passphrase);
      writeKeyfile(keyfile, dataDir);
      // Create the encrypted DB (runs migrations) so the vault is usable.
      openDatabase(dataDir, { passphrase }).close();
      console.log(
        JSON.stringify({ initialized: true, dataDir, encrypted: true }, null, 2),
      );
      break;
    }

    case "encrypt": {
      if (hasKeyfile(dataDir)) {
        console.error("Vault is already encrypted.");
        process.exit(1);
      }
      const status = vaultStatus(dataDir);
      if (!status.databaseExists) {
        console.error("No database to encrypt. Run `attache vault init` for a fresh vault.");
        process.exit(1);
      }
      const passphrase = await readPassphrase("New passphrase: ", "ATTACHE_PASSPHRASE");
      if (process.stdin.isTTY && !process.env.ATTACHE_PASSPHRASE) {
        const confirm = await readPassphrase("Confirm passphrase: ", "__never__");
        if (confirm !== passphrase) {
          console.error("Passphrases did not match.");
          process.exit(1);
        }
      }
      const { keyfile, dek } = createKeyfile(passphrase);
      // Migrate DB + credential files; persist keyfile only after both succeed.
      encryptPlaintextDatabase(dataDir, dek);
      const secrets = encryptPlaintextSecrets(dek);
      writeKeyfile(keyfile, dataDir);
      console.log(
        JSON.stringify(
          {
            encrypted: true,
            dataDir,
            backup: "attache.db.plaintext.bak (delete after verifying)",
            secretsMigrated: secrets.migrated,
            secretsAlreadyEncrypted: secrets.skipped,
          },
          null,
          2,
        ),
      );
      break;
    }

    case "change-passphrase": {
      const keyfile = readKeyfile(dataDir);
      if (!keyfile) {
        console.error("Vault is not encrypted. Run `attache vault init` or `encrypt` first.");
        process.exit(1);
      }
      const current = await readPassphrase("Current passphrase: ", "ATTACHE_PASSPHRASE");
      const dek = unwrapDek(keyfile, current); // throws WrongPassphraseError if wrong
      const next = await readPassphrase("New passphrase: ", "ATTACHE_NEW_PASSPHRASE");
      // Re-wrap the SAME DEK — no database rekey needed (ADR-011 envelope design).
      writeKeyfile(rewrapDek(dek, next), dataDir);
      console.log(JSON.stringify({ changed: true, dataDir }, null, 2));
      break;
    }

    default:
      console.error("Usage: attache vault status|init|encrypt|change-passphrase");
      process.exit(1);
  }
}

async function plaidCommand(sub: string | undefined, args: string[] = []): Promise<void> {
  const db = await openCliDatabase();
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
        console.log(
          JSON.stringify(
            {
              items,
              transactionCount: txCount,
              mode: adapter.mode,
              configured: isPlaidConfigured(),
              env: process.env.PLAID_ENV ?? (isPlaidConfigured() ? "sandbox" : null),
            },
            null,
            2,
          ),
        );
        break;
      }
      case "link-token": {
        if (adapter.mode !== "live") {
          console.error("Set PLAID_CLIENT_ID and PLAID_SECRET for live Link.");
          process.exit(1);
        }
        const token = await createPlaidLinkToken(db, adapter as LivePlaidAdapter);
        console.log(JSON.stringify(token, null, 2));
        break;
      }
      case "connect": {
        if (adapter.mode !== "live") {
          console.error("Set PLAID_CLIENT_ID and PLAID_SECRET for live connect.");
          process.exit(1);
        }
        const flags = parseFlags(args);
        const publicToken =
          flags["public-token"] ?? process.env.PLAID_PUBLIC_TOKEN?.trim();
        if (publicToken) {
          const result = await connectLivePlaid(
            db,
            adapter as LivePlaidAdapter,
            vault,
            publicToken,
          );
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        const noBrowser = args.includes("--no-browser");
        const port = flags.port ? Number(flags.port) : undefined;
        console.error("Opening browser for Plaid Link (loopback redirect)…");
        const result = await connectPlaidViaLoopback(db, adapter as LivePlaidAdapter, vault, {
          port: Number.isFinite(port) ? port : undefined,
          openBrowser: !noBrowser,
        });
        console.log(
          JSON.stringify(
            {
              itemId: result.itemId,
              sync: result.sync,
              redirectUri: result.redirectUri,
              linkUrl: result.linkUrl,
              message: "Bank connected — access token stored in vault",
            },
            null,
            2,
          ),
        );
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
          console.error("No active Plaid items — connect first.");
          process.exit(1);
        }
        console.log(JSON.stringify(results, null, 2));
        if (results.some((r) => r.error)) process.exit(1);
        break;
      }
      case "unlink": {
        const itemId = args[0]?.trim();
        if (!itemId) {
          console.error("Usage: attache plaid unlink <itemId>");
          process.exit(1);
        }
        try {
          const result = unlinkPlaidItem(db, itemId, vault);
          console.log(
            JSON.stringify(
              {
                ...result,
                message: `Unlinked ${result.institutionName} — removed from My Accounts`,
              },
              null,
              2,
            ),
          );
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      default:
        console.error(
          "Usage: attache plaid status|link-token|connect|connect-sandbox|sync|unlink",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function snaptradeCommand(sub: string | undefined, args: string[] = []): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — run: attache onboard --household <name> --holder <name>");
      process.exit(1);
    }
    const adapter = createSnapTradeAdapter();
    const vault = getVault();

    switch (sub) {
      case "status": {
        console.log(
          JSON.stringify(
            {
              mode: adapter.mode,
              configured: isSnapTradeConfigured(),
              connections: listSnapTradeConnections(db),
              linkedAccountCount: countSnapTradeLinkedAccounts(db),
            },
            null,
            2,
          ),
        );
        break;
      }
      case "connect-sandbox": {
        const result = await connectSandboxSnapTrade(db, adapter, vault);
        console.log(
          JSON.stringify(
            {
              ...result,
              message: "Sandbox brokerage linked — accounts on My Accounts",
            },
            null,
            2,
          ),
        );
        break;
      }
      case "connect": {
        if (adapter.mode !== "live") {
          console.error(
            "Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY for live connect (or use connect-sandbox).",
          );
          process.exit(1);
        }
        const result = await connectLiveSnapTrade(db, adapter, vault);
        console.log(
          JSON.stringify(
            {
              ...result,
              message:
                "Open portalUrl in a browser to link a brokerage, then: attache snaptrade sync",
            },
            null,
            2,
          ),
        );
        break;
      }
      case "sync": {
        const results = await syncAllSnapTradeConnections(db, adapter, vault);
        if (!results.length) {
          console.error("No SnapTrade connections — connect-sandbox or connect first.");
          process.exit(1);
        }
        console.log(JSON.stringify(results, null, 2));
        if (results.some((r) => r.error)) process.exit(1);
        break;
      }
      case "positions": {
        const flags = parseFlags(args);
        const positions = listSnapTradePositions(db, {
          connectionId: flags.connection || flags["connection-id"],
        });
        console.log(JSON.stringify({ count: positions.length, positions }, null, 2));
        break;
      }
      case "unlink": {
        const id = args[0]?.trim();
        if (!id) {
          console.error("Usage: attache snaptrade unlink <connectionId>");
          process.exit(1);
        }
        try {
          const result = unlinkSnapTradeConnection(db, id, vault);
          console.log(
            JSON.stringify(
              {
                ...result,
                message: `Unlinked ${result.label} — removed from My Accounts`,
              },
              null,
              2,
            ),
          );
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      default:
        console.error(
          "Usage: attache snaptrade status|connect-sandbox|connect|sync|positions|unlink",
        );
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
  const db = await openCliDatabase();
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
      case "unlink": {
        const id = args[0]?.trim();
        if (!id) {
          console.error("Usage: attache ingest imap unlink <accountId>");
          process.exit(1);
        }
        try {
          const result = unlinkImapAccount(db, id, vault);
          console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      default:
        console.error("Usage: attache ingest imap status|connect|unlink");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function gmailCommand(gmailSub: string | undefined, args: string[]): Promise<void> {
  const db = await openCliDatabase();
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
      case "unlink": {
        const id = args[0]?.trim();
        if (!id) {
          console.error("Usage: attache ingest gmail unlink <accountId>");
          process.exit(1);
        }
        try {
          const result = unlinkGmailAccount(db, id, vault);
          console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      default:
        console.error(
          "Usage: attache ingest gmail status|connect [--port N] [--no-browser]|connect-sandbox|unlink",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

/**
 * Ingest CLI — poll, discover, confirm. Discover (ADR-015 P1) reuses poll/extract
 * and never creates obligations or Plaid items. Confirm is still HITL.
 */
async function ingestCommand(sub: string | undefined, args: string[]): Promise<void> {
  if (sub === "imap") {
    await imapCommand(args[0], args.slice(1));
    return;
  }
  if (sub === "gmail") {
    await gmailCommand(args[0], args.slice(1));
    return;
  }
  if (sub === "eval") {
    const flags = parseFlags(args);
    const adapter =
      flags.adapter === "sandbox"
        ? new FakeDocumentAdapter()
        : createDocumentAdapter();
    const report = await runBillExtractionEval(adapter);
    console.log(JSON.stringify(report, null, 2));
    if (!report.meetsPrdTargets.dueDateRecall || !report.meetsPrdTargets.amountPrecision) {
      process.exit(1);
    }
    return;
  }

  const db = await openCliDatabase();
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
              ingress: hostedIngressStatus(db),
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
        if (batch.accountOutcomes.some((o) => !o.ok)) process.exit(1);
        break;
      }
      case "poll-imap": {
        const batch = await pollImapIngest(db, vault, docAdapter);
        console.log(JSON.stringify(batch, null, 2));
        if (batch.accountOutcomes.some((o) => !o.ok)) process.exit(1);
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
      case "discover-sandbox": {
        try {
          const result = await discoverMailCandidates(db, vault, docAdapter, {
            sandbox: true,
          });
          console.log(JSON.stringify(result, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      case "discover": {
        const flags = parseFlags(args);
        const lookbackDays = flags.days ? Number(flags.days) : undefined;
        const limit = flags.limit ? Number(flags.limit) : undefined;
        try {
          const result = await discoverMailCandidates(db, vault, docAdapter, {
            lookbackDays,
            limit,
          });
          console.log(JSON.stringify(result, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      case "ingress-status": {
        console.log(JSON.stringify(hostedIngressStatus(db), null, 2));
        break;
      }
      default:
        console.error(
          "Usage: attache ingest status|ingress-status|discover|discover-sandbox|upload|poll-gmail|poll-imap|poll-email|drop-email|simulate-email|confirm|eval|imap …|gmail …",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function agentCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = await openCliDatabase();
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
      case "attention": {
        const items = collectAttention(db);
        console.log(JSON.stringify({ count: items.length, attention: items }, null, 2));
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
          "Usage: attache agent runway|attention|obligations|propose-transfer",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function transferCommand(sub: string | undefined, args: string[]): Promise<void> {
  if (sub === "rules") {
    await transferRulesCommand(args[0], args.slice(1));
    return;
  }

  const db = await openCliDatabase();
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
        const honesty = transferHonesty(db, record.fromAccountId, record.toAccountId);
        console.log(
          JSON.stringify(
            {
              ...record,
              execution: honesty,
              message: honesty.note,
            },
            null,
            2,
          ),
        );
        break;
      }
      case "approve": {
        const id = args[0];
        const noteIdx = args.indexOf("--note");
        if (!id) {
          console.error("Usage: attache transfer approve <id> [--note ...]");
          process.exit(1);
        }
        const record = await approveTransferProposal(
          db,
          id,
          noteIdx >= 0 ? args[noteIdx + 1] : undefined,
        );
        console.log(
          JSON.stringify(
            {
              ...record,
              message: transferApprovalMessage(record.status),
            },
            null,
            2,
          ),
        );
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
        console.error(
          "Usage: attache transfer list|submit|approve|reject|rules …",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function transferRulesCommand(
  sub: string | undefined,
  args: string[],
): Promise<void> {
  if (sub === "schedule") {
    await transferRulesScheduleCommand(args[0], args.slice(1));
    return;
  }

  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }

    switch (sub) {
      case "list": {
        const enabledOnly = args.includes("--enabled");
        const rules = listTransferRules(db, { enabledOnly });
        console.log(JSON.stringify({ count: rules.length, rules }, null, 2));
        break;
      }
      case "create": {
        const flags = parseFlags(args);
        const fromAccountId = flags.from;
        const toAccountId = flags.to;
        const amountUsd = flags.amount ? Number(flags.amount) : NaN;
        const name = flags.name;
        if (!name || !fromAccountId || !toAccountId || !Number.isFinite(amountUsd)) {
          console.error(
            "Usage: attache transfer rules create --name <n> --from <id> --to <id> --amount <usd> [--max-run <usd>] [--max-month <usd>] [--autonomy proposal|auto] [--threshold <usd>] [--when <cel>]",
          );
          process.exit(1);
        }
        try {
          const rule = createTransferRule(db, {
            name,
            fromAccountId,
            toAccountId,
            amountUsd,
            maxPerRunUsd: flags["max-run"] ? Number(flags["max-run"]) : undefined,
            maxPerMonthUsd: flags["max-month"]
              ? Number(flags["max-month"])
              : undefined,
            autonomy:
              flags.autonomy === "auto" || flags.autonomy === "proposal"
                ? flags.autonomy
                : undefined,
            thresholdUsd: flags.threshold ? Number(flags.threshold) : undefined,
            whenCel: flags.when,
          });
          console.log(JSON.stringify({ ok: true, rule }, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      case "disable": {
        const id = args[0];
        if (!id) {
          console.error("Usage: attache transfer rules disable <id>");
          process.exit(1);
        }
        const rule = disableTransferRule(db, id);
        console.log(
          JSON.stringify(
            rule ? { ok: true, rule } : { ok: false, error: "not found" },
            null,
            2,
          ),
        );
        if (!rule) process.exit(1);
        break;
      }
      case "evaluate": {
        const flags = parseFlags(args);
        const result = await evaluateTransferRules(db, {
          ruleId: flags.rule,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      default:
        console.error(
          "Usage: attache transfer rules list|create|disable|evaluate|schedule …",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

function transferRulesScheduleCommand(
  sub: string | undefined,
  args: string[],
): void {
  const flags = parseFlags(args);
  const dataDir = flags["data-dir"];
  switch (sub) {
    case "status":
    case undefined: {
      console.log(
        JSON.stringify(
          transferRulesScheduleStatus(
            process.env,
            undefined,
            dataDir,
          ),
          null,
          2,
        ),
      );
      break;
    }
    case "install": {
      const status = installTransferRulesSchedule({
        dataDir,
        loadLaunchd: flags["no-load"] !== "true",
      });
      console.log(JSON.stringify({ ok: true, ...status }, null, 2));
      break;
    }
    case "uninstall": {
      const status = uninstallTransferRulesSchedule({ dataDir });
      console.log(JSON.stringify({ ok: true, ...status }, null, 2));
      break;
    }
    default:
      console.error(
        "Usage: attache transfer rules schedule status|install|uninstall [--no-load] [--data-dir <path>]",
      );
      process.exit(1);
  }
}

async function onboardCommand(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const household = flags.household?.trim();
  const holder = flags.holder?.trim();
  if (!household || !holder) {
    console.error(
      "Usage: attache onboard --household <name> --holder <displayName> [--complete-setup]",
    );
    process.exit(1);
  }
  const db = await openCliDatabase();
  try {
    if (isOnboarded(db)) {
      console.error("Already onboarded — tenant exists for this data dir");
      process.exit(1);
    }
    const result = createTenant(db, {
      householdName: household,
      holderDisplayName: holder,
    });
    if (args.includes("--complete-setup")) {
      markSetupComplete(db);
    }
    console.log(
      JSON.stringify(
        {
          tenant: result.tenant,
          member: result.member,
          siteId: result.siteId,
          setupComplete: args.includes("--complete-setup"),
          next: setupOnboardNextHint("cli", args.includes("--complete-setup")),
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
}

async function activityCommand(
  sub: string | undefined,
  args: string[] = [],
): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — run: attache onboard --household <name> --holder <name>");
      process.exit(1);
    }
    const verb = !sub || sub.startsWith("--") ? "list" : sub;
    const flagArgs = !sub || sub.startsWith("--") ? [sub, ...args].filter(Boolean) as string[] : args;
    if (verb === "recategorize") {
      const id = flagArgs[0]?.trim();
      const flags = parseFlags(flagArgs.slice(1));
      if (!id || (flags.category === undefined && flags.clear !== "true")) {
        console.error(
          "Usage: attache activity recategorize <id> --category <name> | --clear",
        );
        process.exit(1);
      }
      try {
        const category = flags.clear === "true" ? null : flags.category ?? null;
        const transaction = setTransactionCategory(db, id, category);
        console.log(JSON.stringify({ transaction }, null, 2));
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }
      return;
    }
    if (verb !== "list") {
      console.error(
        "Usage: attache activity list [--account <id>] [--pending|--posted] [--from YYYY-MM-DD] [--to YYYY-MM-DD]\n       attache activity recategorize <id> --category <name> | --clear",
      );
      process.exit(1);
    }
    const flags = parseFlags(flagArgs);
    const pending = flags.pending === "true" ? true : flags.posted === "true" ? false : undefined;
    try {
      const rows = listActivity(db, {
        accountId: flags.account,
        pending,
        fromDate: flags.from,
        toDate: flags.to,
        limit: flags.limit ? Number(flags.limit) : 100,
      });
      console.log(JSON.stringify({ count: rows.length, transactions: rows }, null, 2));
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function netWorthCommand(): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — run: attache onboard --household <name> --holder <name>");
      process.exit(1);
    }
    const accounts = listAccounts(db);
    const assets = listHouseholdAssets(db);
    const snapshot = computeNetWorth(accounts, assets);
    const unvalued =
      snapshot.unvaluedAssetCount > 0
        ? ` ${snapshot.unvaluedAssetCount} household asset(s) have no estimate and are omitted from the total.`
        : "";
    console.log(
      JSON.stringify(
        {
          ...snapshot,
          accountCount: accounts.length,
          assets,
          message: `${
            snapshot.hasLiabilities
              ? "Net worth = liquid + invested + valued household assets − credit/loan"
              : "No credit/loan accounts — net worth equals liquid + invested + valued household assets."
          }${unvalued}`,
        },
        null,
        2,
      ),
    );
  } finally {
    db.close();
  }
}

/**
 * Thin home/vehicle register (ADR-015 P4). Estimate is optional; skip is fine.
 * Confirming a hint does not pay a bill and does not store the source document.
 */
async function assetsCommand(
  sub: string | undefined,
  args: string[],
): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — run: attache onboard --household <name> --holder <name>");
      process.exit(1);
    }
    const verb = !sub || sub.startsWith("--") ? "list" : sub;
    const flagArgs =
      !sub || sub.startsWith("--")
        ? ([sub, ...args].filter(Boolean) as string[])
        : args;
    if (verb === "list") {
      const assets = listHouseholdAssets(db);
      console.log(JSON.stringify({ count: assets.length, assets }, null, 2));
      return;
    }
    if (verb === "create") {
      const flags = parseFlags(flagArgs);
      if (!flags.kind || !flags.label) {
        console.error(
          "Usage: attache assets create --kind home|vehicle --label <name> [--estimate <usd>] [--notes …]",
        );
        process.exit(1);
      }
      try {
        const asset = createHouseholdAsset(db, {
          kind: flags.kind,
          label: flags.label,
          notes: flags.notes,
          estimatedUsd:
            flags.estimate !== undefined ? Number(flags.estimate) : null,
        });
        console.log(JSON.stringify({ asset }, null, 2));
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }
      return;
    }
    if (verb === "confirm") {
      const eventId = flagArgs[0]?.trim();
      const flags = parseFlags(flagArgs.slice(1));
      if (!eventId) {
        console.error(
          "Usage: attache assets confirm <eventId> [--label …] [--estimate <usd>]",
        );
        process.exit(1);
      }
      try {
        const asset = confirmAssetHint(db, eventId, {
          label: flags.label,
          estimatedUsd:
            flags.estimate !== undefined ? Number(flags.estimate) : undefined,
          notes: flags.notes,
        });
        console.log(JSON.stringify({ asset }, null, 2));
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }
      return;
    }
    if (verb === "delete") {
      const id = flagArgs[0]?.trim();
      if (!id) {
        console.error("Usage: attache assets delete <id>");
        process.exit(1);
      }
      try {
        deleteHouseholdAsset(db, id);
        console.log(JSON.stringify({ ok: true, id }, null, 2));
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }
      return;
    }
    console.error(
      "Usage: attache assets list | create | confirm <eventId> | delete <id>",
    );
    process.exit(1);
  } finally {
    db.close();
  }
}

async function entitiesCommand(sub: string | undefined): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — run: attache onboard --household <name> --holder <name>");
      process.exit(1);
    }
    if (sub && sub !== "list") {
      console.error("Usage: attache entities list");
      process.exit(1);
    }
    const entities = listHouseholdEntities(db);
    console.log(JSON.stringify({ count: entities.length, entities }, null, 2));
  } finally {
    db.close();
  }
}

async function cashflowCommand(args: string[]): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — run: attache onboard --household <name> --holder <name>");
      process.exit(1);
    }
    const trend = args[0] === "trend";
    const flags = parseFlags(trend ? args.slice(1) : args);
    try {
      if (trend) {
        const report = computeCashflowTrend(db, {
          fromDate: flags.from,
          toDate: flags.to,
        });
        console.log(JSON.stringify(report, null, 2));
      } else {
        const report = computeCashflow(db, {
          fromDate: flags.from,
          toDate: flags.to,
        });
        console.log(JSON.stringify(report, null, 2));
      }
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function accountsCommand(
  sub: string | undefined,
  args: string[] = [],
): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error(
        "Not onboarded — run: attache onboard --household <name> --holder <name>",
      );
      process.exit(1);
    }

    switch (sub) {
      case "list": {
        const accounts = listAccounts(db);
        console.log(JSON.stringify({ count: accounts.length, accounts }, null, 2));
        break;
      }
      case "create": {
        const flags = parseFlags(args);
        const name = flags.name?.trim();
        const balanceRaw = flags.balance ?? flags["balance-usd"];
        if (!name || balanceRaw === undefined) {
          console.error(
            "Usage: attache accounts create --name <name> --balance <usd> [--institution …] [--mask …] [--kind checking|savings|cash|brokerage|credit|loan] [--complete-setup]",
          );
          process.exit(1);
        }
        const balanceUsd = Number(balanceRaw);
        if (!Number.isFinite(balanceUsd)) {
          console.error("--balance must be a number");
          process.exit(1);
        }
        const kindRaw = flags.kind ?? "checking";
        let kind: FundingAccountKind;
        try {
          kind = parseFundingKind(kindRaw);
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
          return;
        }
        const account = createAccount(db, {
          name,
          balanceUsd,
          institution: flags.institution,
          mask: flags.mask,
          kind,
        });
        if (args.includes("--complete-setup")) {
          markSetupComplete(db);
        }
        console.log(
          JSON.stringify(
            {
              account,
              setupComplete: args.includes("--complete-setup"),
              message: "Account created — visible in My Accounts",
            },
            null,
            2,
          ),
        );
        break;
      }
      case "delete": {
        const id = args[0]?.trim();
        if (!id) {
          console.error("Usage: attache accounts delete <accountId>");
          process.exit(1);
        }
        try {
          deleteManualAccount(db, id);
          console.log(JSON.stringify({ ok: true, deleted: id }, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      default:
        console.error("Usage: attache accounts list|create|delete");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

/**
 * Obligations CLI — list / create / mark paid.
 * Why: Bills were web-only create; agents need the same domain as
 * `createObligation` / `markObligationPaid` (no second source of truth).
 * Marking paid does not ACH — same honesty as transfer approve.
 */
async function obligationsCommand(
  sub: string | undefined,
  args: string[] = [],
): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error(
        "Not onboarded — run: attache onboard --household <name> --holder <name>",
      );
      process.exit(1);
    }

    switch (sub) {
      case "list":
      case undefined: {
        const rows = listObligations(db).map((o) => ({
          ...o,
          status: obligationDisplayStatus(o),
        }));
        console.log(JSON.stringify({ count: rows.length, obligations: rows }, null, 2));
        break;
      }
      case "create": {
        const flags = parseFlags(args);
        const payee = flags.payee?.trim();
        const amountRaw = flags.amount ?? flags["amount-usd"];
        const dueDate = flags.due ?? flags["due-date"];
        if (!payee || amountRaw === undefined || !dueDate) {
          console.error(
            "Usage: attache obligations create --payee <name> --amount <usd> --due YYYY-MM-DD [--cadence once|monthly|yearly] [--autopay] [--notes …]",
          );
          process.exit(1);
        }
        const amountUsd = Number(amountRaw);
        const cadence = (flags.cadence ?? "once") as ObligationCadence;
        if (!["once", "monthly", "yearly"].includes(cadence)) {
          console.error("--cadence must be once|monthly|yearly");
          process.exit(1);
        }
        try {
          const obligation = createObligation(db, {
            payee,
            amountUsd,
            dueDate,
            cadence,
            autopay: flags.autopay === "true",
            notes: flags.notes,
          });
          console.log(
            JSON.stringify(
              {
                obligation,
                status: obligationDisplayStatus(obligation),
                message: "Obligation created — visible on Bills and in the runway",
              },
              null,
              2,
            ),
          );
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      case "paid": {
        const id = args[0]?.trim();
        if (!id) {
          console.error("Usage: attache obligations paid <id>");
          process.exit(1);
        }
        try {
          const obligation = markObligationPaid(db, id);
          console.log(JSON.stringify({ obligation }, null, 2));
        } catch (e) {
          console.error(e instanceof Error ? e.message : e);
          process.exit(1);
        }
        break;
      }
      default:
        console.error(
          "Usage: attache obligations list\n       attache obligations create --payee <name> --amount <usd> --due YYYY-MM-DD [--cadence once|monthly|yearly] [--autopay] [--notes …]\n       attache obligations paid <id>",
        );
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function notificationsCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = await openCliDatabase();
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

async function devicesCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }

    switch (sub) {
      case "list":
      case "status": {
        console.log(
          JSON.stringify(
            { fcm: fcmStatus(db), count: listPushDevices(db).length, devices: listPushDevices(db) },
            null,
            2,
          ),
        );
        break;
      }
      case "register": {
        const flags = parseFlags(args);
        const token = flags.token ?? flags["fcm-token"];
        if (!token) {
          console.error("Usage: attache devices register --token <fcm_token> [--label Pixel]");
          process.exit(1);
        }
        const device = registerPushDevice(db, {
          fcmToken: token,
          platform: flags.platform,
          label: flags.label,
        });
        console.log(JSON.stringify({ ok: true, device, fcm: fcmStatus(db) }, null, 2));
        break;
      }
      case "unlink": {
        const id = args[0];
        if (!id) {
          console.error("Usage: attache devices unlink <id>");
          process.exit(1);
        }
        const device = unlinkPushDevice(db, id);
        console.log(JSON.stringify(device ? { ok: true, device } : { ok: false, error: "not found" }, null, 2));
        if (!device) process.exit(1);
        break;
      }
      default:
        console.error("Usage: attache devices list|register|unlink");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function credentialsCommand(sub: string | undefined, args: string[]): Promise<void> {
  const db = await openCliDatabase();
  try {
    if (!isOnboarded(db)) {
      console.error("Not onboarded — visit http://localhost:8780/onboard");
      process.exit(1);
    }

    if (sub === "check") {
      const sandbox = args.includes("--sandbox");
      const adapter = sandbox ? new FakeHibpAdapter() : createHibpAdapter();
      const result = await checkCredentialHygiene(db, adapter);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (sub === "assist") {
      const flags = parseFlags(args);
      try {
        const result = credentialAssist(db, {
          email: flags.email,
          payee: flags.payee,
          institution: flags.institution,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }
      return;
    }

    console.error(
      "Usage: attache credentials check [--sandbox]\n       attache credentials assist --email <addr> | --payee <n> | --institution <n>",
    );
    process.exit(1);
  } finally {
    db.close();
  }
}

async function achCommand(sub: string | undefined, args: string[] = []): Promise<void> {
  const db = await openCliDatabase();
  try {
    switch (sub) {
      case "status":
      case undefined: {
        console.log(JSON.stringify(achStatus(db), null, 2));
        break;
      }
      case "simulate": {
        const id = args[0]?.trim();
        if (!id) {
          console.error("Usage: attache ach simulate <proposalId>");
          process.exit(1);
        }
        const row = await simulateAchPosted(db, id);
        console.log(
          JSON.stringify(
            {
              ...row,
              message: "Sandbox ACH posted and recorded on the local ledger.",
            },
            null,
            2,
          ),
        );
        break;
      }
      case "sync": {
        const rows = await syncAchTransfers(db);
        console.log(JSON.stringify({ count: rows.length, transfers: rows }, null, 2));
        break;
      }
      case "webhook-status": {
        console.log(JSON.stringify(achWebhookStatus(), null, 2));
        break;
      }
      default:
        console.error("Usage: attache ach status|simulate|sync|webhook-status");
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

async function ledgerCommand(sub: string | undefined): Promise<void> {
  if (sub && sub !== "status") {
    console.error("Usage: attache ledger status");
    process.exit(1);
  }
  const status = await ledgerStatus();
  console.log(JSON.stringify(status, null, 2));
  if (status.backend === "tigerbeetle" && status.reachable === false) {
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`attache — household finance CLI

Commands:
  attache onboard --household <n> --holder <n> [--complete-setup]
      # next (optional): attache ingest discover-sandbox — Gmail never required
  attache accounts list                 My Accounts (funding balances)
  attache accounts create --name <n> --balance <usd> [--institution …] [--mask …] [--kind checking|savings|cash|brokerage|credit|loan] [--complete-setup]
  attache accounts delete <id>          Delete a manual account (no Plaid / no txs)
  attache activity list [--account id] [--pending|--posted] [--from d] [--to d]
  attache activity recategorize <id> --category <name> | --clear
  attache net-worth                     Liquid + invested + valued household assets − liabilities
  attache assets list
  attache assets create --kind home|vehicle --label <n> [--estimate <usd>] [--notes …]
  attache assets confirm <eventId>      HITL home/vehicle hint from discover
  attache assets delete <id>
  attache entities list                 Payee / institution names (not a CRM)
  attache cashflow [--from d] [--to d]  Posted spend by category (default 30d)
  attache cashflow trend [--from d] [--to d]  vs prior equal-length window
  attache obligations list
  attache obligations create --payee <n> --amount <usd> --due YYYY-MM-DD [--cadence once|monthly|yearly] [--autopay] [--notes …]
  attache obligations paid <id>         Mark unpaid obligation paid (no ACH)

  attache vault status                  Encryption state (kdf, db, backup)
  attache vault init                    Create an encrypted vault (fresh)
  attache vault encrypt                 Encrypt an existing plaintext database
  attache vault change-passphrase       Re-wrap the key under a new passphrase
                                        (env: ATTACHE_PASSPHRASE / ATTACHE_NEW_PASSPHRASE)

  attache transfer list [--pending]        Transfer approval queue
  attache transfer submit --from <id> --amount <usd> [--to <id>]
  attache transfer approve <id> [--note ...]
  attache transfer reject <id> [--note ...]
  attache transfer rules list [--enabled]
  attache transfer rules create --name <n> --from <id> --to <id> --amount <usd>
      [--max-run <usd>] [--max-month <usd>] [--autonomy proposal|auto] [--threshold <usd>]
      [--when '<cel>']                 # optional CEL guard (liquidBalanceUsd, runwayDays, …)
  attache transfer rules disable <id>
  attache transfer rules evaluate [--rule <id>]
  attache transfer rules schedule status|install|uninstall [--no-load]
  attache ledger status                    sqlite (default) or tigerbeetle ping
  attache ach status                       ACH rail (off | sandbox | plaid)
  attache ach simulate <proposalId>        Sandbox: mark ACH posted → ledger
  attache ach sync                         Poll submitted ACH and settle posted
  attache ach webhook-status               POST /api/ach/webhook (needs ATTACHE_ACH_WEBHOOK_SECRET)

  attache agent runway [--days N]     Solvency snapshot + accounts
  attache agent attention             Home attention strip (HITL, overdue, sync)
  attache agent obligations [--filter all|upcoming|overdue|unpaid]
  attache agent propose-transfer --from <id> --amount <usd> [--to <id>] [--memo ...]

  attache notifications list [--unread]   List alerts (refreshes first)
  attache notifications refresh           Recompute alerts from household state
  attache notifications ack <id>          Mark alert read

  attache devices list                    Android FCM tokens (companion API)
  attache devices register --token <fcm> [--label Pixel]
  attache devices unlink <id>
  attache credentials check [--sandbox]   HIBP mailbox emails; no password store
  attache credentials assist --email <addr> | --payee <n> | --institution <n>

  attache plaid status              JSON status of linked items
  attache plaid link-token          Link token (requires PLAID_* env)
  attache plaid connect [--public-token <token>] [--port N] [--no-browser]
  attache plaid connect-sandbox     Link demo Chase (no API keys)
  attache plaid sync                Pull latest transactions
  attache plaid unlink <itemId>     Disconnect bank + remove linked accounts

  attache snaptrade status          Brokerage connections + mode
  attache snaptrade connect-sandbox Demo Fidelity (no SNAPTRADE_* keys)
  attache snaptrade connect         Live Connection Portal URL (needs keys)
  attache snaptrade sync            Pull balances + positions
  attache snaptrade positions       Read-only holdings (optional --connection id)
  attache snaptrade unlink <id>     Disconnect brokerage + remove accounts

  attache ingest status             Review queue + IMAP accounts + ingress
  attache ingest ingress-status     BYO Mailgun webhook (plaintext disclosure)
  attache ingest discover [--days 90] [--limit 40]
                                      Ranked mail candidates (HITL; no auto-promote)
  attache ingest discover-sandbox   Sandbox mixed fixtures (bill + Chase + Fidelity)
  attache ingest gmail connect [--port 8765] [--no-browser]
                                      Loopback OAuth — no web server required
  attache ingest gmail connect-sandbox  Sandbox Gmail account
  attache ingest gmail status           List Gmail accounts
  attache ingest gmail unlink <id>      Remove Gmail link + vault tokens
  attache ingest poll-gmail             Pull bills via Gmail API
  attache ingest imap connect           Connect mailbox (--host --user --password)
  attache ingest imap status            List IMAP accounts
  attache ingest imap unlink <id>       Remove IMAP link + vault password
  attache ingest poll-imap              Pull new bill email via IMAP
  attache ingest upload <file>      Extract bill from document
  attache ingest poll-email         Poll local maildrop
  attache ingest drop-email <eml>   Stage .eml in maildrop
  attache ingest simulate-email     Sandbox fixture email
  attache ingest confirm <eventId>  Promote reviewed bill → obligation
  attache ingest eval [--adapter sandbox]  Bill extraction accuracy report
`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
