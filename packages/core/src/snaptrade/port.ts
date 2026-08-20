import type { SnapTradeConnection } from "../domain.js";

/** Brokerage account snapshot from SnapTrade (or fake). */
export interface SnapTradeLinkedAccount {
  snaptradeAccountId: string;
  name: string;
  number: string | null;
  /** Total equity / cash balance in USD for My Accounts. */
  balanceUsd: number;
  brokerageName: string;
}

export interface SnapTradePosition {
  symbol: string;
  units: number;
  priceUsd: number;
  marketValueUsd: number;
  /** Brokerage account this lot belongs to (SnapTrade account id). */
  snaptradeAccountId?: string | null;
}

export interface SnapTradeSyncSnapshot {
  accounts: SnapTradeLinkedAccount[];
  positions: SnapTradePosition[];
  brokerageName: string;
}

/**
 * SnapTrade ingest port — Fake for dogfood; Live when SNAPTRADE_* keys set.
 * userSecret lives in VaultPort; never passed through SQLite.
 */
export interface SnapTradeIngestPort {
  readonly mode: "sandbox" | "live";
  /**
   * Register (or reuse) a SnapTrade user and return credentials + optional portal URL.
   * Sandbox: deterministic ids; Live: SDK register + loginSnapTradeUser.
   */
  ensureUser(input: {
    externalUserId: string;
    existingUserSecret?: string | null;
  }): Promise<{
    externalUserId: string;
    userSecret: string;
    portalUrl: string | null;
  }>;
  fetchSnapshot(
    connection: SnapTradeConnection,
    userSecret: string,
  ): Promise<SnapTradeSyncSnapshot>;
}
