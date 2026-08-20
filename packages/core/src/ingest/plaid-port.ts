import type {
  FundingAccountKind,
  PlaidBalancePayload,
  PlaidTransactionPayload,
} from "../domain.js";

/** Account snapshot from a bank link provider. */
export interface PlaidLinkedAccount {
  plaidAccountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  kind: FundingAccountKind | "other";
  balanceUsd: number;
}

/** Result of a Plaid sync pull — normalized before persistence. */
export interface PlaidSyncSnapshot {
  accounts: PlaidLinkedAccount[];
  transactions: PlaidTransactionPayload[];
  balances: PlaidBalancePayload[];
}

/**
 * Plaid ingest port — swap FakePlaidAdapter (sandbox) for live API adapter.
 * Access tokens are never passed through SQLite; adapter receives token from VaultPort.
 */
export interface PlaidIngestPort {
  readonly mode: "sandbox" | "live";
  /** Institution label for UI. */
  institutionName(accessToken: string): Promise<string>;
  fetchSnapshot(accessToken: string): Promise<PlaidSyncSnapshot>;
}
