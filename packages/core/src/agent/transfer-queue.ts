import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getAccount, updateManualAccount } from "../account.js";
import { getTenant, isOnboarded } from "../tenant.js";
import { proposeTransfer, type TransferProposalInput } from "./transfer.js";
import type {
  CreateTransferProposalInput,
  ListTransferProposalsOptions,
  TransferProposalRecord,
  TransferProposalStatus,
} from "./transfer-types.js";

interface ProposalRow {
  id: string;
  tenant_id: string;
  from_account_id: string;
  to_account_id: string | null;
  amount_usd: number;
  memo: string | null;
  status: TransferProposalStatus;
  allowed: number;
  proposed_by: string;
  proposal_json: string;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function requireTenantId(db: Database.Database): string {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  return getTenant(db)!.id;
}

function rowToRecord(row: ProposalRow): TransferProposalRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amountUsd: row.amount_usd,
    memo: row.memo,
    status: row.status,
    allowed: row.allowed === 1,
    proposedBy: row.proposed_by as TransferProposalRecord["proposedBy"],
    simulation: JSON.parse(row.proposal_json),
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Run dry-run simulation and enqueue for human review (VS-5.1).
 * Why: agents propose; household CFO approves before any balance change.
 */
export function createTransferProposal(
  db: Database.Database,
  input: CreateTransferProposalInput,
): TransferProposalRecord {
  const tenantId = requireTenantId(db);
  const simulation = proposeTransfer(db, input as TransferProposalInput);
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO transfer_proposal (
      id, tenant_id, from_account_id, to_account_id, amount_usd, memo,
      status, allowed, proposed_by, proposal_json, review_note, reviewed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.fromAccountId,
    input.toAccountId ?? null,
    input.amountUsd,
    input.memo?.trim() || null,
    simulation.allowed ? 1 : 0,
    input.proposedBy ?? "agent",
    JSON.stringify(simulation),
    now,
    now,
  );

  return getTransferProposal(db, id)!;
}

export function getTransferProposal(
  db: Database.Database,
  id: string,
): TransferProposalRecord | null {
  const tenantId = requireTenantId(db);
  const row = db
    .prepare(`SELECT * FROM transfer_proposal WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as ProposalRow | undefined;
  return row ? rowToRecord(row) : null;
}

export function listTransferProposals(
  db: Database.Database,
  options: ListTransferProposalsOptions = {},
): TransferProposalRecord[] {
  const tenantId = requireTenantId(db);
  const clauses = ["tenant_id = ?"];
  const params: unknown[] = [tenantId];

  if (options.status) {
    clauses.push("status = ?");
    params.push(options.status);
  }

  const limit = options.limit ?? 50;
  const sql = `SELECT * FROM transfer_proposal WHERE ${clauses.join(" AND ")}
    ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as ProposalRow[];
  return rows.map(rowToRecord);
}

export function countPendingTransferProposals(db: Database.Database): number {
  const tenantId = requireTenantId(db);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM transfer_proposal
       WHERE tenant_id = ? AND status = 'pending'`,
    )
    .get(tenantId) as { c: number };
  return row.c;
}

/**
 * Approve a pending proposal. Manual accounts get local balance updates (dogfood).
 * Plaid-linked legs record approval only — no fake bank movement.
 */
export function approveTransferProposal(
  db: Database.Database,
  id: string,
  reviewNote?: string,
): TransferProposalRecord {
  const proposal = getTransferProposal(db, id);
  if (!proposal) throw new Error("proposal not found");
  if (proposal.status !== "pending") {
    throw new Error(`proposal is ${proposal.status}`);
  }
  if (!proposal.allowed) {
    throw new Error("proposal has blockers — cannot approve");
  }

  const now = new Date().toISOString();
  let status: TransferProposalStatus = "approved";

  if (canExecuteOnManualAccounts(db, proposal)) {
    applyManualTransfer(db, proposal);
    status = "executed";
  }

  db.prepare(
    `UPDATE transfer_proposal SET
       status = ?, review_note = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(status, reviewNote?.trim() || null, now, now, id);

  return getTransferProposal(db, id)!;
}

export function rejectTransferProposal(
  db: Database.Database,
  id: string,
  reviewNote?: string,
): TransferProposalRecord {
  const proposal = getTransferProposal(db, id);
  if (!proposal) throw new Error("proposal not found");
  if (proposal.status !== "pending") {
    throw new Error(`proposal is ${proposal.status}`);
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE transfer_proposal SET
       status = 'rejected', review_note = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(reviewNote?.trim() || null, now, now, id);

  return getTransferProposal(db, id)!;
}

function canExecuteOnManualAccounts(
  db: Database.Database,
  proposal: TransferProposalRecord,
): boolean {
  const from = getAccount(db, proposal.fromAccountId);
  if (!from || from.plaidAccountId || from.syncStatus !== "manual") return false;
  if (proposal.toAccountId) {
    const to = getAccount(db, proposal.toAccountId);
    if (!to || to.plaidAccountId || to.syncStatus !== "manual") return false;
  }
  return from.balanceUsd >= proposal.amountUsd;
}

function applyManualTransfer(
  db: Database.Database,
  proposal: TransferProposalRecord,
): void {
  const from = getAccount(db, proposal.fromAccountId)!;
  updateManualAccount(db, from.id, {
    balanceUsd: from.balanceUsd - proposal.amountUsd,
  });
  if (proposal.toAccountId) {
    const to = getAccount(db, proposal.toAccountId)!;
    updateManualAccount(db, to.id, {
      balanceUsd: to.balanceUsd + proposal.amountUsd,
    });
  }
}
