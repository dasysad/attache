/**
 * LedgerPort — authoritative money journal (ADR-001).
 *
 * WHAT: post transfers, read balances, inspect history.
 * WHY: all balance mutations flow here; `funding_account.balance_usd` is a
 *      projection for fast reads, not the source of truth after bootstrap.
 *
 * P0: `SqliteLedgerAdapter` (default). P1: `TigerBeetleLedgerAdapter` opt-in.
 * Methods are async so the TigerBeetle Node client can sit behind the same port.
 */
import type Database from "better-sqlite3";
import type {
  LedgerHistoryEntry,
  LedgerTransfer,
  PostTransferInput,
  PostTransferResult,
} from "./types.js";

export interface LedgerPort {
  /**
   * Ensure a ledger asset account exists for `fundingAccountId`, bootstrapping
   * an opening-balance entry from equity when first seen.
   */
  ensureFundingAccount(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): Promise<string>;

  /** Post a double-entry transfer. Idempotent on `idempotencyKey`. */
  postTransfer(
    db: Database.Database,
    input: PostTransferInput,
  ): Promise<PostTransferResult>;

  /** Current balance in USD (from summed cents on the asset account). */
  getBalanceUsd(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): Promise<number>;

  /** Recent journal lines for a funding account (newest first). */
  getAccountHistory(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
    options?: { limit?: number },
  ): Promise<LedgerHistoryEntry[]>;

  /** Lookup a prior post by idempotency key (for retries). */
  lookupTransfer(
    db: Database.Database,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<LedgerTransfer | null>;
}
