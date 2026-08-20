/**
 * SQLite persistence for ACH intents (ADR-013).
 *
 * WHAT: ach_transfer rows keyed by proposal_id; status mirrors the rail.
 * WHY: agents need a local audit even when the replica/Plaid dashboard is elsewhere.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getTenant, isOnboarded } from "../tenant.js";
import type { AchRailStatus } from "./port.js";

export interface AchTransferRecord {
  id: string;
  tenantId: string;
  proposalId: string;
  provider: "sandbox" | "plaid";
  debitTransferId: string;
  creditTransferId: string;
  fromAccountId: string;
  toAccountId: string;
  amountUsd: number;
  status: AchRailStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  tenant_id: string;
  proposal_id: string;
  provider: string;
  debit_transfer_id: string;
  credit_transfer_id: string;
  from_account_id: string;
  to_account_id: string;
  amount_usd: number;
  status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function requireTenantId(db: Database.Database): string {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  return getTenant(db)!.id;
}

function mapRow(row: Row): AchTransferRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    proposalId: row.proposal_id,
    provider: row.provider as AchTransferRecord["provider"],
    debitTransferId: row.debit_transfer_id,
    creditTransferId: row.credit_transfer_id,
    fromAccountId: row.from_account_id,
    toAccountId: row.to_account_id,
    amountUsd: row.amount_usd,
    status: row.status as AchRailStatus,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAchTransferByProposal(
  db: Database.Database,
  proposalId: string,
): AchTransferRecord | null {
  const tenantId = requireTenantId(db);
  const row = db
    .prepare(
      `SELECT * FROM ach_transfer WHERE tenant_id = ? AND proposal_id = ?`,
    )
    .get(tenantId, proposalId) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function listAchTransfers(
  db: Database.Database,
  options: { limit?: number } = {},
): AchTransferRecord[] {
  const tenantId = requireTenantId(db);
  const limit = options.limit ?? 50;
  const rows = db
    .prepare(
      `SELECT * FROM ach_transfer WHERE tenant_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(tenantId, limit) as Row[];
  return rows.map(mapRow);
}

export function insertAchTransfer(
  db: Database.Database,
  input: {
    proposalId: string;
    provider: "sandbox" | "plaid";
    debitTransferId: string;
    creditTransferId: string;
    fromAccountId: string;
    toAccountId: string;
    amountUsd: number;
    status: AchRailStatus;
  },
): AchTransferRecord {
  const tenantId = requireTenantId(db);
  const existing = getAchTransferByProposal(db, input.proposalId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ach_transfer (
      id, tenant_id, proposal_id, provider, debit_transfer_id, credit_transfer_id,
      from_account_id, to_account_id, amount_usd, status, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.proposalId,
    input.provider,
    input.debitTransferId,
    input.creditTransferId,
    input.fromAccountId,
    input.toAccountId,
    input.amountUsd,
    input.status,
    now,
    now,
  );
  db.prepare(`UPDATE transfer_proposal SET ach_transfer_id = ? WHERE id = ?`).run(
    id,
    input.proposalId,
  );
  return getAchTransferByProposal(db, input.proposalId)!;
}

export function updateAchTransferStatus(
  db: Database.Database,
  proposalId: string,
  status: AchRailStatus,
  lastError?: string | null,
): AchTransferRecord {
  const tenantId = requireTenantId(db);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE ach_transfer SET status = ?, last_error = ?, updated_at = ?
     WHERE tenant_id = ? AND proposal_id = ?`,
  ).run(status, lastError ?? null, now, tenantId, proposalId);
  const row = getAchTransferByProposal(db, proposalId);
  if (!row) throw new Error("ACH transfer not found");
  return row;
}
