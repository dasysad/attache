import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getRunwaySnapshot,
  collectAttention,
  isOnboarded,
  listAccounts,
  listActivity,
  listNotifications,
  listObligationsForAgent,
  listTransferProposals,
  createAccount,
  createObligation,
  markObligationPaid,
  obligationDisplayStatus,
  createTenant,
  createTransferProposal,
  approveTransferProposal,
  rejectTransferProposal,
  createTransferRule,
  listTransferRules,
  disableTransferRule,
  evaluateTransferRules,
  markNotificationRead,
  markSetupComplete,
  setupOnboardNextHint,
  openDatabase,
  computeNetWorth,
  computeCashflow,
  computeCashflowTrend,
  listHouseholdAssets,
  createHouseholdAsset,
  confirmAssetHint,
  deleteHouseholdAsset,
  listHouseholdEntities,
  setTransactionCategory,
  DatabaseLockedError,
  databaseLockedHelp,
  WrongPassphraseError,
  proposeTransfer,
  refreshNotifications,
  createPlaidAdapter,
  connectSandboxPlaid,
  syncAllPlaidItems,
  listPlaidItems,
  countPlaidLinkedAccounts,
  isPlaidConfigured,
  getVault,
  unlinkPlaidItem,
  deleteManualAccount,
  listGmailAccounts,
  listImapAccounts,
  listPendingBillReviews,
  connectSandboxGmail,
  pollGmailIngest,
  pollImapIngest,
  discoverMailCandidates,
  DiscoverError,
  confirmBillIngest,
  unlinkGmailAccount,
  unlinkImapAccount,
  createDocumentAdapter,
  getOrCreateIngestToken,
  ingestEmailAddress,
  transferHonesty,
  transferApprovalMessage,
  createSnapTradeAdapter,
  isSnapTradeConfigured,
  connectSandboxSnapTrade,
  syncAllSnapTradeConnections,
  listSnapTradeConnections,
  listSnapTradePositions,
  countSnapTradeLinkedAccounts,
  unlinkSnapTradeConnection,
  ledgerStatus,
  achStatus,
  simulateAchPosted,
  syncAchTransfers,
  achWebhookStatus,
  transferRulesScheduleStatus,
  installTransferRulesSchedule,
  uninstallTransferRulesSchedule,
  registerPushDevice,
  listPushDevices,
  unlinkPushDevice,
  fcmStatus,
  checkCredentialHygiene,
  createHibpAdapter,
  FakeHibpAdapter,
  credentialAssist,
  hostedIngressStatus,
  type ObligationFilter,
} from "@attache/core";

/**
 * Register VS-5 agent tools on the MCP server.
 * What: stdio MCP surface for Spacecraft / Cursor / Claude Desktop.
 * Why: agent-first — same logic as CLI (onboard, accounts, HITL, Plaid sandbox).
 */
export function registerAttacheTools(server: McpServer): void {
  server.tool(
    "onboard",
    "Create the local household tenant (no browser). Fails if already onboarded.",
    {
      householdName: z.string().min(1).describe("Household / tenant display name"),
      holderDisplayName: z.string().min(1).describe("Primary account holder name"),
      completeSetup: z
        .boolean()
        .optional()
        .describe("Skip remaining UI wizard steps (default false)"),
    },
    async ({ householdName, holderDisplayName, completeSetup }) => withDb((db) => {
      if (isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "already onboarded",
          hint: "Use list_accounts or create_account",
        });
      }
      const result = createTenant(db, { householdName, holderDisplayName });
      if (completeSetup) markSetupComplete(db);
      return jsonResult({
        ok: true,
        tenant: result.tenant,
        member: result.member,
        siteId: result.siteId,
        setupComplete: Boolean(completeSetup),
        next: setupOnboardNextHint("mcp", Boolean(completeSetup)),
      });
    }),
  );

  server.tool(
    "list_accounts",
    "List My Accounts (funding accounts with balances) — manual and Plaid-linked.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const accounts = listAccounts(db);
      return jsonResult({ ok: true, count: accounts.length, accounts });
    }),
  );

  server.tool(
    "create_account",
    "Add a manual funding account to My Accounts.",
    {
      name: z.string().min(1),
      balanceUsd: z.number().describe("Opening balance in USD"),
      institution: z.string().optional(),
      mask: z.string().optional(),
      kind: z
        .enum(["checking", "savings", "cash", "brokerage", "credit", "loan"])
        .optional(),
      completeSetup: z
        .boolean()
        .optional()
        .describe("Mark first-run wizard complete after create"),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const account = createAccount(db, {
        name: input.name,
        balanceUsd: input.balanceUsd,
        institution: input.institution,
        mask: input.mask,
        kind: input.kind,
      });
      if (input.completeSetup) markSetupComplete(db);
      return jsonResult({
        ok: true,
        account,
        setupComplete: Boolean(input.completeSetup),
      });
    }),
  );

  server.tool(
    "delete_account",
    "Delete a manual funding account (not Plaid-linked; no bank transactions).",
    {
      id: z.string().describe("Funding account id"),
    },
    async ({ id }) => withDb((db) => {
      try {
        deleteManualAccount(db, id);
        return jsonResult({ ok: true, deleted: id });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          hint: "Plaid-linked accounts: use unlink_plaid_item",
        });
      }
    }),
  );

  server.tool(
    "get_runway",
    "Get household solvency snapshot: liquid balance, runway days, due in 7d, overdue.",
    {
      horizonDays: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe("Forecast horizon in days (default 30)"),
    },
    async ({ horizonDays }) => withDb((db) => {
      const snapshot = getRunwaySnapshot(db, horizonDays ?? 30);
      const accounts = listAccounts(db).map((a) => ({
        id: a.id,
        name: a.name,
        balanceUsd: a.balanceUsd,
        kind: a.kind,
        provenance: a.provenance,
      }));
      return jsonResult({ ...snapshot, accounts });
    }),
  );

  server.tool(
    "get_attention",
    "Items that need a human now: overdue bills, pending transfers, ACH in flight, ingest review, sync errors. Same list as the Home attention strip.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const items = collectAttention(db);
      return jsonResult({ ok: true, count: items.length, attention: items });
    }),
  );

  server.tool(
    "list_transactions",
    "Bank activity register with optional filters (account, pending, date range). Same as attache activity list.",
    {
      accountId: z.string().optional().describe("Funding account id"),
      pending: z
        .boolean()
        .optional()
        .describe("true = pending only, false = posted only, omit = both"),
      fromDate: z.string().optional().describe("Inclusive YYYY-MM-DD"),
      toDate: z.string().optional().describe("Inclusive YYYY-MM-DD"),
      limit: z.number().int().min(1).max(500).optional(),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const rows = listActivity(db, input);
        return jsonResult({ ok: true, count: rows.length, transactions: rows });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "get_net_worth",
    "Assets (liquid + brokerage + valued household assets) minus credit/loan. Unvalued home/vehicle rows are omitted, not counted as $0.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const accounts = listAccounts(db);
      const assets = listHouseholdAssets(db);
      const snapshot = computeNetWorth(accounts, assets);
      return jsonResult({
        ok: true,
        ...snapshot,
        accountCount: accounts.length,
        assets,
        message: snapshot.hasLiabilities
          ? "Net worth = liquid + invested + valued household assets − credit/loan"
          : "No credit/loan accounts — net worth equals liquid + invested + valued household assets.",
      });
    }),
  );

  server.tool(
    "list_assets",
    "List thin home/vehicle rows (ADR-015 P4). Not a document store.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const assets = listHouseholdAssets(db);
      return jsonResult({ ok: true, count: assets.length, assets });
    }),
  );

  server.tool(
    "create_asset",
    "Manually add a home or vehicle. Estimate is optional — omit rather than invent.",
    {
      kind: z.enum(["home", "vehicle"]),
      label: z.string().min(1),
      estimatedUsd: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const asset = createHouseholdAsset(db, input);
        return jsonResult({ ok: true, asset });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "confirm_asset",
    "HITL: promote a discover home/vehicle hint. Does not create a bank account or store the document. Bills with amounts stay confirmable.",
    {
      eventId: z.string().describe("ingested_event id from ingest_discover"),
      label: z.string().optional(),
      estimatedUsd: z.number().nonnegative().optional(),
    },
    async ({ eventId, label, estimatedUsd }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const asset = confirmAssetHint(db, eventId, { label, estimatedUsd });
        return jsonResult({ ok: true, asset });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "delete_asset",
    "Remove a household asset row by id.",
    { id: z.string() },
    async ({ id }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        deleteHouseholdAsset(db, id);
        return jsonResult({ ok: true, id });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "list_entities",
    "Payee and institution names from obligations and accounts — not a CRM.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const entities = listHouseholdEntities(db);
      return jsonResult({ ok: true, count: entities.length, entities });
    }),
  );

  server.tool(
    "get_cashflow",
    "Posted bank activity by category (pending excluded). Default last 30 UTC days. Same as attache cashflow.",
    {
      fromDate: z.string().optional().describe("Inclusive YYYY-MM-DD"),
      toDate: z.string().optional().describe("Inclusive YYYY-MM-DD"),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const report = computeCashflow(db, input);
        return jsonResult({ ok: true, ...report });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "get_cashflow_trend",
    "Current cash-flow window vs the prior equal-length window (posted only). Daily series is empty when the current window has no txs. Same as attache cashflow trend.",
    {
      fromDate: z.string().optional().describe("Inclusive YYYY-MM-DD"),
      toDate: z.string().optional().describe("Inclusive YYYY-MM-DD"),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const trend = computeCashflowTrend(db, input);
        return jsonResult({ ok: true, ...trend });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "set_transaction_category",
    "Recategorize a bank transaction (empty category clears it). Same as attache activity recategorize.",
    {
      id: z.string().describe("bank_transaction id"),
      category: z
        .string()
        .nullable()
        .optional()
        .describe("Category label; omit or empty to clear"),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const transaction = setTransactionCategory(
          db,
          input.id,
          input.category ?? null,
        );
        return jsonResult({ ok: true, transaction });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "list_obligations",
    "List bills and recurring obligations with optional status filter.",
    {
      filter: z
        .enum(["all", "upcoming", "overdue", "unpaid"])
        .optional()
        .describe("Filter by status (default unpaid)"),
    },
    async ({ filter }) => withDb((db) => {
      const rows = listObligationsForAgent(db, (filter ?? "unpaid") as ObligationFilter);
      return jsonResult({ count: rows.length, obligations: rows });
    }),
  );

  server.tool(
    "create_obligation",
    "Add a bill or recurring obligation (same as attache obligations create). Does not move money.",
    {
      payee: z.string().min(1).describe("Who gets paid"),
      amountUsd: z.number().positive().describe("Amount in USD"),
      dueDate: z.string().describe("Due date YYYY-MM-DD"),
      cadence: z
        .enum(["once", "monthly", "yearly"])
        .optional()
        .describe("Recurrence (default once)"),
      autopay: z.boolean().optional().describe("Household marks this as autopay"),
      notes: z.string().optional(),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const obligation = createObligation(db, {
          payee: input.payee,
          amountUsd: input.amountUsd,
          dueDate: input.dueDate,
          cadence: input.cadence,
          autopay: input.autopay,
          notes: input.notes,
        });
        return jsonResult({
          ok: true,
          obligation,
          status: obligationDisplayStatus(obligation),
          message: "Obligation created — visible on Bills and in the runway",
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "mark_obligation_paid",
    "Mark an unpaid obligation as paid (same as attache obligations paid). Does not ACH.",
    {
      id: z.string().min(1).describe("Obligation id from list_obligations"),
    },
    async ({ id }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const obligation = markObligationPaid(db, id);
        return jsonResult({ ok: true, obligation });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "propose_transfer",
    "Dry-run a transfer — simulation only, does NOT enqueue. Use submit_transfer_proposal to queue for HITL. Plaid legs warn: approve ≠ ACH.",
    {
      fromAccountId: z.string().describe("Source funding account id"),
      toAccountId: z
        .string()
        .optional()
        .describe("Destination account id — omit for external/outbound"),
      amountUsd: z.number().positive().describe("Amount in USD"),
      memo: z.string().optional().describe("Optional note for audit trail"),
      horizonDays: z.number().int().min(1).max(90).optional(),
    },
    async (input) => withDb((db) => {
      const proposal = proposeTransfer(db, input);
      const honesty = transferHonesty(db, input.fromAccountId, input.toAccountId);
      return jsonResult({ ...proposal, execution: honesty });
    }),
  );

  server.tool(
    "submit_transfer_proposal",
    "Submit a transfer for household HITL approval. Runs dry-run first; stores pending proposal. Check execution.mode — approval_only means no bank move on approve.",
    {
      fromAccountId: z.string().describe("Source funding account id"),
      toAccountId: z
        .string()
        .optional()
        .describe("Destination account id — omit for external/outbound"),
      amountUsd: z.number().positive().describe("Amount in USD"),
      memo: z.string().optional().describe("Optional note for audit trail"),
      horizonDays: z.number().int().min(1).max(90).optional(),
    },
    async (input) => withDb((db) => {
      const record = createTransferProposal(db, { ...input, proposedBy: "mcp" });
      const honesty = transferHonesty(db, record.fromAccountId, record.toAccountId);
      return jsonResult({
        ...record,
        execution: honesty,
        message: honesty.note,
      });
    }),
  );

  server.tool(
    "list_transfer_proposals",
    "List transfer proposals in the HITL approval queue.",
    {
      pendingOnly: z.boolean().optional().describe("Only pending proposals"),
    },
    async ({ pendingOnly }) => withDb((db) => {
      const rows = listTransferProposals(
        db,
        pendingOnly ? { status: "pending" } : {},
      );
      return jsonResult({ count: rows.length, proposals: rows });
    }),
  );

  server.tool(
    "approve_transfer_proposal",
    "Approve a pending transfer proposal (HITL). Manual legs → ledger; Plaid A2A with ATTACHE_ACH → ACH submit; otherwise consent only.",
    {
      id: z.string().describe("Transfer proposal id"),
      note: z.string().optional().describe("Optional review note"),
    },
    async ({ id, note }) => withDbAsync(async (db) => {
      try {
        const record = await approveTransferProposal(db, id, note);
        return jsonResult({
          ok: true,
          proposal: record,
          message: transferApprovalMessage(record.status),
          execution: transferHonesty(db, record.fromAccountId, record.toAccountId),
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "reject_transfer_proposal",
    "Reject a pending transfer proposal (HITL).",
    {
      id: z.string().describe("Transfer proposal id"),
      note: z.string().optional().describe("Optional review note"),
    },
    async ({ id, note }) => withDb((db) => {
      try {
        const record = rejectTransferProposal(db, id, note);
        return jsonResult({ ok: true, proposal: record });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "list_transfer_rules",
    "List typed transfer policies (ADR-017). Not Starflow YAML.",
    {
      enabledOnly: z.boolean().optional().describe("Only enabled rules"),
    },
    async ({ enabledOnly }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      const rules = listTransferRules(db, { enabledOnly });
      return jsonResult({ ok: true, count: rules.length, rules });
    }),
  );

  server.tool(
    "create_transfer_rule",
    "Create a sweep rule (typed policy). autonomy=proposal (HITL) or auto (approve within caps). Optional thresholdUsd → balance_above trigger.",
    {
      name: z.string(),
      fromAccountId: z.string(),
      toAccountId: z.string(),
      amountUsd: z.number().positive(),
      maxPerRunUsd: z.number().positive().optional(),
      maxPerMonthUsd: z.number().positive().optional(),
      autonomy: z.enum(["proposal", "auto"]).optional(),
      thresholdUsd: z.number().nonnegative().optional(),
      whenCel: z
        .string()
        .optional()
        .describe(
          "CEL guard, e.g. liquidBalanceUsd >= 1000.0 && runwayDays > 14. False skips without burning the month.",
        ),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      try {
        const rule = createTransferRule(db, input);
        return jsonResult({ ok: true, rule });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "disable_transfer_rule",
    "Disable a transfer rule by id (does not delete run history).",
    {
      id: z.string().describe("transfer_rule id"),
    },
    async ({ id }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      const rule = disableTransferRule(db, id);
      if (!rule) return jsonResult({ ok: false, error: "not found" });
      return jsonResult({ ok: true, rule });
    }),
  );

  server.tool(
    "evaluate_transfer_rules",
    "Evaluate enabled transfer rules for the current UTC month. Creates proposals or auto-approves. Idempotent per rule per month.",
    {
      ruleId: z.string().optional().describe("Evaluate a single rule"),
    },
    async (input) => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      try {
        const result = await evaluateTransferRules(db, { ruleId: input.ruleId });
        return jsonResult({ ok: true, ...result });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "transfer_rules_schedule_status",
    "Local launchd/cron status for daily transfer rules evaluate (06:00).",
    {},
    async () => jsonResult({ ok: true, ...transferRulesScheduleStatus() }),
  );

  server.tool(
    "install_transfer_rules_schedule",
    "Install daily 06:00 evaluate via launchd (macOS) or write a crontab line file (Linux).",
    {
      loadLaunchd: z
        .boolean()
        .optional()
        .describe("macOS: call launchctl load (default true)"),
    },
    async ({ loadLaunchd }) => {
      try {
        const status = installTransferRulesSchedule({
          loadLaunchd: loadLaunchd !== false,
        });
        return jsonResult({ ok: true, ...status });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  server.tool(
    "uninstall_transfer_rules_schedule",
    "Remove the transfer rules launchd plist or crontab helper file.",
    {},
    async () => {
      try {
        const status = uninstallTransferRulesSchedule();
        return jsonResult({ ok: true, ...status });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  server.tool(
    "plaid_status",
    "Plaid link status: mode, configured flag, items, linked funding account count.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const adapter = createPlaidAdapter();
      const items = listPlaidItems(db);
      return jsonResult({
        ok: true,
        mode: adapter.mode,
        configured: isPlaidConfigured(),
        env: process.env.PLAID_ENV ?? (isPlaidConfigured() ? "sandbox" : null),
        items,
        linkedAccountCount: countPlaidLinkedAccounts(db),
        next:
          items.length === 0
            ? "plaid_connect_sandbox or CLI: attache plaid connect"
            : "plaid_sync",
      });
    }),
  );

  server.tool(
    "plaid_connect_sandbox",
    "Connect demo Chase via FakePlaidAdapter (no PLAID_* keys). Upserts My Accounts.",
    {},
    async () => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const result = await connectSandboxPlaid(db, createPlaidAdapter(), getVault());
        return jsonResult({
          ok: true,
          ...result,
          message: "Sandbox bank linked — accounts on list_accounts / My Accounts",
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "plaid_sync",
    "Sync all active Plaid items (balances + transactions → My Accounts).",
    {},
    async () => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const results = await syncAllPlaidItems(db, createPlaidAdapter(), getVault());
        if (!results.length) {
          return jsonResult({
            ok: false,
            error: "no active Plaid items",
            hint: "plaid_connect_sandbox or attache plaid connect",
          });
        }
        const failed = results.filter((r) => r.error);
        return jsonResult({
          ok: failed.length === 0,
          results,
          linkedAccountCount: countPlaidLinkedAccounts(db),
          hint:
            failed.length > 0
              ? "Some items failed — check plaid_status; unlink or re-connect"
              : undefined,
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "unlink_plaid_item",
    "Disconnect a Plaid bank link: clears vault secret and removes linked My Accounts.",
    {
      itemId: z.string().describe("Plaid item id from plaid_status"),
    },
    async ({ itemId }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const result = unlinkPlaidItem(db, itemId, getVault());
        return jsonResult({
          ok: true,
          ...result,
          message: `Unlinked ${result.institutionName}`,
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "ach_status",
    "ACH rail status: off (default), sandbox fake, or live Plaid Transfer. Lists local ACH intents.",
    {},
    async () => withDb((db) => {
      return jsonResult({ ok: true, ...achStatus(db) });
    }),
  );

  server.tool(
    "simulate_ach",
    "Sandbox only: mark an ach_pending proposal posted and post LedgerPort. Not a real bank move.",
    {
      proposalId: z.string().describe("Transfer proposal id"),
    },
    async ({ proposalId }) => withDbAsync(async (db) => {
      try {
        const row = await simulateAchPosted(db, proposalId);
        return jsonResult({
          ok: true,
          transfer: row,
          message: "Sandbox ACH posted and recorded on the local ledger.",
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "sync_ach",
    "Poll submitted ACH intents; settle posted ones onto the local ledger.",
    {},
    async () => withDbAsync(async (db) => {
      try {
        const transfers = await syncAchTransfers(db);
        return jsonResult({ ok: true, count: transfers.length, transfers });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "ach_webhook_status",
    "Whether POST /api/ach/webhook is armed (ATTACHE_ACH_WEBHOOK_SECRET). Poll with sync_ach when off.",
    {},
    async () => jsonResult({ ok: true, ...achWebhookStatus() }),
  );

  server.tool(
    "ledger_status",
    "Ledger backend: sqlite (default) or tigerbeetle replica ping. No browser.",
    {},
    async () => {
      const status = await ledgerStatus();
      return jsonResult({
        ok: status.backend === "sqlite" || status.reachable === true,
        ...status,
        next:
          status.backend === "tigerbeetle" && status.reachable === false
            ? "Start a local replica, then retry ledger_status"
            : "transfer approve posts through this backend",
      });
    },
  );

  server.tool(
    "snaptrade_status",
    "SnapTrade brokerage status: mode, connections, linked account count.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const adapter = createSnapTradeAdapter();
      return jsonResult({
        ok: true,
        mode: adapter.mode,
        configured: isSnapTradeConfigured(),
        connections: listSnapTradeConnections(db),
        linkedAccountCount: countSnapTradeLinkedAccounts(db),
        next:
          listSnapTradeConnections(db).length === 0
            ? "snaptrade_connect_sandbox"
            : "snaptrade_sync",
      });
    }),
  );

  server.tool(
    "snaptrade_connect_sandbox",
    "Connect demo Fidelity via FakeSnapTradeAdapter (no SNAPTRADE_* keys). Upserts brokerage My Accounts.",
    {},
    async () => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const result = await connectSandboxSnapTrade(
          db,
          createSnapTradeAdapter(),
          getVault(),
        );
        return jsonResult({
          ok: true,
          ...result,
          message: "Sandbox brokerage linked — list_accounts / My Accounts",
        });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "snaptrade_sync",
    "Sync all SnapTrade connections (balances → My Accounts as brokerage).",
    {},
    async () => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const results = await syncAllSnapTradeConnections(
        db,
        createSnapTradeAdapter(),
        getVault(),
      );
      if (!results.length) {
        return jsonResult({
          ok: false,
          error: "no SnapTrade connections",
          hint: "snaptrade_connect_sandbox",
        });
      }
      const failed = results.filter((r) => r.error);
      return jsonResult({
        ok: failed.length === 0,
        results,
        linkedAccountCount: countSnapTradeLinkedAccounts(db),
      });
    }),
  );

  server.tool(
    "list_snaptrade_positions",
    "Read-only SnapTrade holdings (cached on last sync). Not a blotter — no lots or trades.",
    {
      connectionId: z.string().optional().describe("Limit to one SnapTrade connection"),
    },
    async ({ connectionId }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const positions = listSnapTradePositions(db, { connectionId });
      return jsonResult({ ok: true, count: positions.length, positions });
    }),
  );

  server.tool(
    "unlink_snaptrade_connection",
    "Disconnect SnapTrade: clears vault secret and removes brokerage My Accounts.",
    {
      connectionId: z.string().describe("Connection id from snaptrade_status"),
    },
    async ({ connectionId }) => withDb((db) => {
      try {
        const result = unlinkSnapTradeConnection(db, connectionId, getVault());
        return jsonResult({ ok: true, ...result });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "attache_status",
    "Check whether Attache is onboarded and list account ids for transfers.",
    {},
    async () => withDb((db) => {
      const onboarded = isOnboarded(db);
      const accounts = onboarded
        ? listAccounts(db).map((a) => ({
            id: a.id,
            name: a.name,
            balanceUsd: a.balanceUsd,
          }))
        : [];
      return jsonResult({
        onboarded,
        dataDir: process.env.ATTACHE_DATA_DIR ?? "(default ~/.attache/data)",
        accounts,
        hint: onboarded
          ? undefined
          : "Call MCP onboard or: attache onboard --household … --holder …",
      });
    }),
  );

  server.tool(
    "ingest_status",
    "Bill review queue + Gmail/IMAP mail account status (incl. lastError).",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const pending = listPendingBillReviews(db);
      const token = getOrCreateIngestToken(db);
      const ingress = hostedIngressStatus(db);
      return jsonResult({
        ok: true,
        ingestAddress: ingestEmailAddress(token),
        ingress,
        gmailAccounts: listGmailAccounts(db),
        imapAccounts: listImapAccounts(db),
        pendingCount: pending.length,
        pending: pending.map((e) => ({
          id: e.id,
          source: e.source,
          confidence: e.confidence,
          ingestedAt: e.ingestedAt,
        })),
        next:
          pending.length > 0
            ? "confirm_bill_ingest"
            : "gmail_connect_sandbox or poll_gmail / poll_imap",
      });
    }),
  );

  server.tool(
    "gmail_connect_sandbox",
    "Connect sandbox Gmail (no Google OAuth keys). Use poll_gmail next.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const account = connectSandboxGmail(db, getVault());
      return jsonResult({ ok: true, account, next: "ingest_discover or poll_gmail" });
    }),
  );

  server.tool(
    "ingest_discover",
    "Poll connected mail and return ranked candidates (bills to confirm, statement → connect hints, home/vehicle asset hints). Never auto-promotes or Link. PHI/EOBs are dropped. sandbox=true uses mixed fixtures including property tax + auto policy + EOB (dropped).",
    {
      lookbackDays: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe("Gmail first-sync lookback (default 90, hard-capped)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(40)
        .optional()
        .describe("Max messages fetched (default 40, hard-capped)"),
      sandbox: z
        .boolean()
        .optional()
        .describe("Connect sandbox Gmail and use mixed bill + Chase + Fidelity fixtures"),
    },
    async (input) => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      try {
        const result = await discoverMailCandidates(
          db,
          getVault(),
          createDocumentAdapter(),
          {
            lookbackDays: input.lookbackDays,
            limit: input.limit,
            sandbox: input.sandbox,
          },
        );
        return jsonResult({
          ok: true,
          ...result,
          next: result.message,
        });
      } catch (e) {
        const code = e instanceof DiscoverError ? e.code : undefined;
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          code,
          hint:
            code === "no_mail"
              ? "gmail_connect_sandbox or ingest_discover with sandbox: true"
              : undefined,
        });
      }
    }),
  );

  server.tool(
    "poll_gmail",
    "Poll Gmail accounts for bill emails → HITL review queue.",
    {},
    async () => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const batch = await pollGmailIngest(db, getVault(), createDocumentAdapter());
      const failed = batch.accountOutcomes.filter((o) => !o.ok);
      return jsonResult({
        ok: failed.length === 0,
        ...batch,
        hint:
          failed.length > 0
            ? "Some accounts failed — check ingest_status lastError; unlink or reconnect"
            : batch.billsCreated > 0
              ? "confirm_bill_ingest with pending event ids"
              : undefined,
      });
    }),
  );

  server.tool(
    "poll_imap",
    "Poll IMAP accounts for bill emails → HITL review queue.",
    {},
    async () => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({
          ok: false,
          error: "not onboarded",
          hint: "Call onboard first",
        });
      }
      const batch = await pollImapIngest(db, getVault(), createDocumentAdapter());
      const failed = batch.accountOutcomes.filter((o) => !o.ok);
      return jsonResult({
        ok: failed.length === 0,
        ...batch,
        hint:
          failed.length > 0
            ? "Some accounts failed — check ingest_status lastError"
            : undefined,
      });
    }),
  );

  server.tool(
    "confirm_bill_ingest",
    "Promote a pending bill review to an obligation (HITL confirm).",
    {
      eventId: z.string().describe("ingested_event id from ingest_status pending"),
      payee: z.string().optional(),
      amountUsd: z.number().positive().optional(),
      dueDate: z.string().optional().describe("YYYY-MM-DD"),
    },
    async ({ eventId, payee, amountUsd, dueDate }) => withDb((db) => {
      try {
        const obligation = confirmBillIngest(db, eventId, {
          payee,
          amountUsd,
          dueDate,
        });
        return jsonResult({ ok: true, obligation });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "unlink_gmail_account",
    "Disconnect Gmail: delete vault tokens and account row.",
    {
      accountId: z.string().describe("Gmail account id from ingest_status"),
    },
    async ({ accountId }) => withDb((db) => {
      try {
        const result = unlinkGmailAccount(db, accountId, getVault());
        return jsonResult({ ok: true, ...result });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "unlink_imap_account",
    "Disconnect IMAP: delete vault password and account row.",
    {
      accountId: z.string().describe("IMAP account id from ingest_status"),
    },
    async ({ accountId }) => withDb((db) => {
      try {
        const result = unlinkImapAccount(db, accountId, getVault());
        return jsonResult({ ok: true, ...result });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "list_notifications",
    "List household alerts (solvency, bills, ingest review). Refreshes derived alerts first.",
    {
      unreadOnly: z.boolean().optional().describe("Only unread alerts"),
      since: z.string().optional().describe("ISO timestamp — alerts created after"),
    },
    async ({ unreadOnly, since }) => withDb((db) => {
      refreshNotifications(db);
      const rows = listNotifications(db, { unreadOnly, since });
      return jsonResult({ count: rows.length, notifications: rows });
    }),
  );

  server.tool(
    "ack_notification",
    "Mark a notification as read by id.",
    {
      id: z.string().describe("Notification id"),
    },
    async ({ id }) => withDb((db) => {
      const n = markNotificationRead(db, id);
      if (!n) return jsonResult({ ok: false, error: "not found" });
      return jsonResult({ ok: true, notification: n });
    }),
  );

  server.tool(
    "register_device",
    "Register an Android FCM token (companion app). Does not enable Google delivery unless ATTACHE_FCM=sandbox|live.",
    {
      fcmToken: z.string().describe("FCM registration token"),
      platform: z.string().optional().describe("Must be android (P0)"),
      label: z.string().optional().describe("Device label, e.g. Pixel"),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded", hint: "Call onboard first" });
      }
      try {
        const device = registerPushDevice(db, {
          fcmToken: input.fcmToken,
          platform: input.platform,
          label: input.label,
        });
        return jsonResult({ ok: true, device, fcm: fcmStatus(db) });
      } catch (e) {
        return jsonResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );

  server.tool(
    "list_devices",
    "List registered Android FCM devices + FCM backend status.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      return jsonResult({
        ok: true,
        fcm: fcmStatus(db),
        devices: listPushDevices(db),
      });
    }),
  );

  server.tool(
    "unlink_device",
    "Remove a registered FCM device by id from list_devices.",
    {
      id: z.string().describe("push_device id"),
    },
    async ({ id }) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      const device = unlinkPushDevice(db, id);
      if (!device) return jsonResult({ ok: false, error: "not found" });
      return jsonResult({ ok: true, device });
    }),
  );

  server.tool(
    "credentials_check",
    "HIBP mailbox emails on the high-value shortlist (Gmail/IMAP). Does not store or rotate website passwords. sandbox=true uses the fake Adobe/sandbox@gmail.com fixture.",
    {
      sandbox: z.boolean().optional().describe("Force FakeHibpAdapter (no HIBP network)"),
    },
    async (input) => withDbAsync(async (db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded", hint: "Call onboard first" });
      }
      const adapter = input.sandbox ? new FakeHibpAdapter() : createHibpAdapter();
      const result = await checkCredentialHygiene(db, adapter);
      return jsonResult({ ok: true, ...result });
    }),
  );

  server.tool(
    "credentials_assist",
    "HITL assisted password change for a high-value shortlist target. Returns change-password URL + one-time suggested password. Attache does not store website passwords.",
    {
      email: z.string().optional().describe("Mailbox on the shortlist"),
      payee: z.string().optional().describe("Obligation payee on the shortlist"),
      institution: z
        .string()
        .optional()
        .describe("Funding institution on the shortlist"),
    },
    async (input) => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      try {
        const result = credentialAssist(db, input);
        return jsonResult({ ok: true, ...result });
      } catch (e) {
        return jsonResult({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }),
  );

  server.tool(
    "ingest_ingress_status",
    "BYO Mailgun inbound status. Mailgun sees plaintext when enabled; IMAP/Gmail stay primary. Attache does not operate SMTP.",
    {},
    async () => withDb((db) => {
      if (!isOnboarded(db)) {
        return jsonResult({ ok: false, error: "not onboarded" });
      }
      return jsonResult({ ok: true, ...hostedIngressStatus(db) });
    }),
  );
}

function withDb<T>(fn: (db: ReturnType<typeof openDatabase>) => T): T {
  try {
    const db = openDatabase();
    try {
      return fn(db);
    } finally {
      db.close();
    }
  } catch (e) {
    if (e instanceof DatabaseLockedError || e instanceof WrongPassphraseError) {
      throw new Error(databaseLockedHelp());
    }
    throw e;
  }
}

async function withDbAsync<T>(
  fn: (db: ReturnType<typeof openDatabase>) => Promise<T>,
): Promise<T> {
  try {
    const db = openDatabase();
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  } catch (e) {
    if (e instanceof DatabaseLockedError || e instanceof WrongPassphraseError) {
      throw new Error(databaseLockedHelp());
    }
    throw e;
  }
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
