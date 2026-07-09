/**
 * Ledger domain types (ADR-001 P0).
 *
 * WHAT: shared shapes for the double-entry journal — transfers, entries, history.
 * HOW: amounts in **minor units (cents)** inside the ledger; USD floats only at
 *      UI boundaries.
 * WHY: float balances caused silent drift; the journal enforces invariants.
 */

/** Ledger account role in the per-tenant chart of accounts. */
export type LedgerAccountRole = "asset" | "equity" | "external";

/** A row in `ledger_account` — may map to a funding account or a system leg. */
export interface LedgerAccount {
  id: string;
  tenantId: string;
  /** Null for system accounts (opening balance, external sink). */
  fundingAccountId: string | null;
  role: LedgerAccountRole;
  name: string;
  createdAt: string;
}

/** Posted transfer header. */
export interface LedgerTransfer {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  /** Positive amount moved (cents); entries carry signed legs. */
  amountMinor: number;
  memo: string | null;
  proposalId: string | null;
  createdAt: string;
}

/** One leg of a double-entry transfer. Signed cents: credit +, debit −. */
export interface LedgerEntry {
  id: string;
  transferId: string;
  accountId: string;
  amountMinor: number;
  createdAt: string;
}

/** Input to post a transfer between funding accounts (or outbound). */
export interface PostTransferInput {
  tenantId: string;
  /** Stable retry key — e.g. `proposal:{transferProposalId}`. */
  idempotencyKey: string;
  fromFundingAccountId: string;
  /** Omit/null for outbound transfers that leave the household books. */
  toFundingAccountId?: string | null;
  /** Whole USD amount; converted to cents at the adapter boundary. */
  amountUsd: number;
  memo?: string;
  proposalId?: string;
}

export interface PostTransferResult {
  transfer: LedgerTransfer;
  /** False when an existing transfer was returned for the idempotency key. */
  created: boolean;
}

/** One line in account history for agents/UI. */
export interface LedgerHistoryEntry {
  transferId: string;
  amountMinor: number;
  memo: string | null;
  createdAt: string;
  idempotencyKey: string;
}

/** Convert USD to integer cents with banker's rounding to nearest cent. */
export function usdToMinor(amountUsd: number): number {
  if (!Number.isFinite(amountUsd)) {
    throw new Error("amount must be a finite number");
  }
  return Math.round(amountUsd * 100);
}

/** Convert ledger cents to USD for projections. */
export function minorToUsd(amountMinor: number): number {
  return amountMinor / 100;
}
