import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getLedger } from "../ledger/factory.js";
import { InsufficientFundsError } from "../ledger/errors.js";
import { getTenant, isOnboarded } from "../tenant.js";
import { proposeTransfer, type TransferProposalInput } from "./transfer.js";
import { transferHonesty } from "./transfer-honesty.js";
import { getAch } from "../ach/create-adapter.js";
import { submitAch } from "../ach/submit.js";
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
export async function approveTransferProposal(
  db: Database.Database,
  id: string,
  reviewNote?: string,
): Promise<TransferProposalRecord> {
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

  // BL-12: Plaid A2A + ACH rail → submit, settle later. Slice 5: manual → ledger.
  const honesty = transferHonesty(db, proposal.fromAccountId, proposal.toAccountId);
  if (honesty.willSubmitAch) {
    const ach = getAch();
    if (!ach) {
      throw new Error("ACH rail is off — set ATTACHE_ACH=sandbox or ATTACHE_ACH=plaid");
    }
    await submitAch(db, proposal, ach);
    status = "ach_pending";
  } else if (await canExecuteOnManualAccounts(db, proposal)) {
    await executeViaLedger(db, proposal);
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

async function canExecuteOnManualAccounts(
  db: Database.Database,
  proposal: TransferProposalRecord,
): Promise<boolean> {
  const honesty = transferHonesty(db, proposal.fromAccountId, proposal.toAccountId);
  if (!honesty.willExecute) return false;
  const ledger = getLedger();
  const available = await ledger.getBalanceUsd(db, proposal.tenantId, proposal.fromAccountId);
  return available >= proposal.amountUsd;
}

/**
 * Post an approved proposal through LedgerPort (ADR-001).
 * Idempotent on `proposal:{id}` so approval retries never double-post.
 */
async function executeViaLedger(
  db: Database.Database,
  proposal: TransferProposalRecord,
): Promise<void> {
  const ledger = getLedger();
  try {
    const result = await ledger.postTransfer(db, {
      tenantId: proposal.tenantId,
      idempotencyKey: `proposal:${proposal.id}`,
      fromFundingAccountId: proposal.fromAccountId,
      toFundingAccountId: proposal.toAccountId,
      amountUsd: proposal.amountUsd,
      memo: proposal.memo ?? undefined,
      proposalId: proposal.id,
    });
    db.prepare(
      `UPDATE transfer_proposal SET ledger_transfer_id = ? WHERE id = ?`,
    ).run(result.transfer.id, proposal.id);
  } catch (e) {
    if (e instanceof InsufficientFundsError) {
      throw new Error(e.message);
    }
    throw e;
  }
}
