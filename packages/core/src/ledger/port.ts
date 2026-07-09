import type Database from "better-sqlite3";
import type {
  LedgerHistoryEntry,
  LedgerTransfer,
  PostTransferInput,
  PostTransferResult,
} from "./types.js";

/**
 * LedgerPort — authoritative money journal (ADR-001).
 *
 * WHAT: post transfers, read balances, inspect history.
 * WHY: all balance mutations flow here; `funding_account.balance_usd` is a
 *      projection for fast reads, not the source of truth after bootstrap.
 *
 * P0: `SqliteLedgerAdapter` in-process. P1: `TigerBeetleLedgerAdapter` via HTTP.
 */
export interface LedgerPort {
  /**
   * Ensure a ledger asset account exists for `fundingAccountId`, bootstrapping
   * an opening-balance entry from equity when first seen.
   */
  ensureFundingAccount(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): string;

  /** Post a double-entry transfer. Idempotent on `idempotencyKey`. */
  postTransfer(
    db: Database.Database,
    input: PostTransferInput,
  ): PostTransferResult;

  /** Current balance in USD (from summed cents on the asset account). */
  getBalanceUsd(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): number;

  /** Recent journal lines for a funding account (newest first). */
  getAccountHistory(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
    options?: { limit?: number },
  ): LedgerHistoryEntry[];

  /** Lookup a prior post by idempotency key (for retries). */
  lookupTransfer(
    db: Database.Database,
    tenantId: string,
    idempotencyKey: string,
  ): LedgerTransfer | null;
}
