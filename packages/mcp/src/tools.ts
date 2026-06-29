import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getRunwaySnapshot,
  isOnboarded,
  listAccounts,
  listNotifications,
  listObligationsForAgent,
  listTransferProposals,
  createTransferProposal,
  approveTransferProposal,
  rejectTransferProposal,
  markNotificationRead,
  openDatabase,
  proposeTransfer,
  refreshNotifications,
  type ObligationFilter,
} from "@attache/core";

/**
 * Register VS-5 agent tools on the MCP server.
 * What: stdio MCP surface for Spacecraft / Cursor / Claude Desktop.
 * Why: agent-first — same logic as `attache agent` CLI.
 */
export function registerAttacheTools(server: McpServer): void {
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
    "propose_transfer",
    "Dry-run a transfer — simulation only, does NOT enqueue. Use submit_transfer_proposal to queue for HITL.",
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
      return jsonResult(proposal);
    }),
  );

  server.tool(
    "submit_transfer_proposal",
    "Submit a transfer for household HITL approval. Runs dry-run first; stores pending proposal.",
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
      return jsonResult(record);
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
        hint: onboarded ? undefined : "Run http://localhost:8780/onboard first",
      });
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
}

function withDb<T>(fn: (db: ReturnType<typeof openDatabase>) => T): T {
  const db = openDatabase();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
