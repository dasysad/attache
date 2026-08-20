/**
 * ACH submit / simulate / sync (ADR-013 P0).
 *
 * WHAT: HITL approve calls submitAch; sandbox simulate or live sync settles
 *       posted rails into LedgerPort (same idempotency as manual execute).
 * WHY: approve ≠ settlement. Agents run simulate/sync as a second step.
 */
import type Database from "better-sqlite3";
import { getAccount } from "../account.js";
import { InsufficientFundsError } from "../ledger/errors.js";
import { getLedger } from "../ledger/factory.js";
import { getPlaidItem } from "../plaid/store.js";
import { getTenant } from "../tenant.js";
import { getVault } from "../vault/local-vault.js";
import type { TransferProposalRecord } from "../agent/transfer-types.js";
import type { AchPort } from "./port.js";
import { getAch } from "./create-adapter.js";
import {
  getAchTransferByProposal,
  insertAchTransfer,
  listAchTransfers,
  updateAchTransferStatus,
  type AchTransferRecord,
} from "./store.js";

function holderLegalName(db: Database.Database): string {
  const tenant = getTenant(db);
  const row = db
    .prepare(
      `SELECT display_name FROM member WHERE kind = 'account_holder' LIMIT 1`,
    )
    .get() as { display_name: string } | undefined;
  return row?.display_name?.trim() || tenant?.name || "Account Holder";
}

function plaidLeg(db: Database.Database, fundingAccountId: string): {
  accessToken: string;
  plaidAccountId: string;
} {
  const account = getAccount(db, fundingAccountId);
  if (!account?.plaidAccountId || !account.plaidItemId) {
    throw new Error("ACH requires Plaid-linked funding accounts on both legs");
  }
  const item = getPlaidItem(db, account.plaidItemId);
  if (!item) throw new Error("plaid item not found for ACH leg");
  const accessToken = getVault().get(item.vaultCredentialRef);
  if (!accessToken) {
    throw new Error(`vault credential missing: ${item.vaultCredentialRef}`);
  }
  return { accessToken, plaidAccountId: account.plaidAccountId };
}

/**
 * Originate A2A ACH for an approved proposal. Idempotent on proposal id.
 */
export async function submitAch(
  db: Database.Database,
  proposal: TransferProposalRecord,
  ach: AchPort = getAch() ?? failNoAch(),
): Promise<AchTransferRecord> {
  if (!proposal.toAccountId) {
    throw new Error("ACH A2A requires a Plaid-linked destination account");
  }
  const existing = getAchTransferByProposal(db, proposal.id);
  if (existing) return existing;

  const rail = await ach.submit({
    idempotencyKey: `proposal:${proposal.id}`,
    amountUsd: proposal.amountUsd,
    description: proposal.memo || "ATTACHE",
    legalName: holderLegalName(db),
    debit: plaidLeg(db, proposal.fromAccountId),
    credit: plaidLeg(db, proposal.toAccountId),
  });

  return insertAchTransfer(db, {
    proposalId: proposal.id,
    provider: ach.mode === "live" ? "plaid" : "sandbox",
    debitTransferId: rail.debitTransferId,
    creditTransferId: rail.creditTransferId,
    fromAccountId: proposal.fromAccountId,
    toAccountId: proposal.toAccountId,
    amountUsd: proposal.amountUsd,
    status: rail.status,
  });
}

/**
 * Sandbox: mark rail posted and post LedgerPort (manual execute path).
 */
export async function simulateAchPosted(
  db: Database.Database,
  proposalId: string,
  ach: AchPort = getAch() ?? failNoAch(),
): Promise<AchTransferRecord> {
  const row = getAchTransferByProposal(db, proposalId);
  if (!row) throw new Error("ACH transfer not found for proposal");
  if (row.status === "posted") {
    await settleAchToLedger(db, proposalId, row);
    return getAchTransferByProposal(db, proposalId)!;
  }

  const rail = await ach.simulatePosted(row.debitTransferId);
  updateAchTransferStatus(db, proposalId, rail.status);
  if (rail.status === "posted") {
    await settleAchToLedger(db, proposalId, {
      ...row,
      status: "posted",
    });
  }
  return getAchTransferByProposal(db, proposalId)!;
}

/**
 * Poll live/sandbox rails that are still submitted; settle posted ones.
 */
export async function syncAchTransfers(
  db: Database.Database,
  ach: AchPort = getAch() ?? failNoAch(),
): Promise<AchTransferRecord[]> {
  const open = listAchTransfers(db).filter((t) => t.status === "submitted");
  const out: AchTransferRecord[] = [];
  for (const row of open) {
    const rail = await ach.get(row.debitTransferId);
    if (!rail) continue;
    const updated = updateAchTransferStatus(db, row.proposalId, rail.status);
    if (updated.status === "posted") {
      await settleAchToLedger(db, row.proposalId, updated);
    }
    if (updated.status === "failed" || updated.status === "returned") {
      markProposalAchFailed(db, row.proposalId, updated.status);
    }
    out.push(getAchTransferByProposal(db, row.proposalId)!);
  }
  return out;
}

async function settleAchToLedger(
  db: Database.Database,
  proposalId: string,
  achRow: AchTransferRecord,
): Promise<void> {
  const ledger = getLedger();
  try {
    const result = await ledger.postTransfer(db, {
      tenantId: achRow.tenantId,
      idempotencyKey: `proposal:${proposalId}`,
      fromFundingAccountId: achRow.fromAccountId,
      toFundingAccountId: achRow.toAccountId,
      amountUsd: achRow.amountUsd,
      memo: "ACH posted",
      proposalId,
    });
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE transfer_proposal SET
         status = 'executed', ledger_transfer_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(result.transfer.id, now, proposalId);
  } catch (e) {
    if (e instanceof InsufficientFundsError) {
      throw new Error(e.message);
    }
    throw e;
  }
}

function markProposalAchFailed(
  db: Database.Database,
  proposalId: string,
  railStatus: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE transfer_proposal SET status = 'ach_failed', review_note = ?, updated_at = ?
     WHERE id = ? AND status = 'ach_pending'`,
  ).run(`ACH ${railStatus}`, now, proposalId);
}

function failNoAch(): never {
  throw new Error("ACH rail is off — set ATTACHE_ACH=sandbox or ATTACHE_ACH=plaid");
}
