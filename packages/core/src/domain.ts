/**
 * Provenance tags for obligations and calendar (PRD event model).
 * VS-1 uses `native` for manual entry only.
 */
export type Provenance =
  | "native"
  | "caldav"
  | "google"
  | "ics"
  | "plaid"
  | "snaptrade"
  | "email"
  | "document"
  | "agent"
  | "rule";

export type FundingAccountKind =
  | "checking"
  | "savings"
  | "cash"
  | "brokerage"
  | "credit"
  | "loan";

/** Asset kinds that fund the 30-day runway (excludes brokerage + liabilities). */
export const LIQUID_ACCOUNT_KINDS: FundingAccountKind[] = [
  "checking",
  "savings",
  "cash",
];

export const LIABILITY_ACCOUNT_KINDS: FundingAccountKind[] = ["credit", "loan"];

export const FUNDING_ACCOUNT_KINDS: FundingAccountKind[] = [
  "checking",
  "savings",
  "cash",
  "brokerage",
  "credit",
  "loan",
];

export type AccountSyncStatus = "manual" | "fresh" | "stale" | "error";

export interface FundingAccount {
  id: string;
  tenantId: string;
  name: string;
  institution: string | null;
  mask: string | null;
  kind: FundingAccountKind;
  balanceUsd: number;
  provenance: Provenance;
  syncStatus: AccountSyncStatus;
  plaidAccountId: string | null;
  plaidItemId: string | null;
  snaptradeAccountId: string | null;
  snaptradeConnectionId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ObligationCadence = "once" | "monthly" | "yearly";

export interface Obligation {
  id: string;
  tenantId: string;
  payee: string;
  amountUsd: number;
  cadence: ObligationCadence;
  /** Anchor due date (ISO date YYYY-MM-DD). */
  dueDate: string;
  autopay: boolean;
  /** When set, obligation is retired (VS-1: full pay-off). */
  paidAt: string | null;
  provenance: Provenance;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Computed forecast status for UI rows — not stored. */
export type ObligationDisplayStatus =
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "paid"
  | "scheduled";

export interface ObligationOccurrence {
  obligationId: string;
  payee: string;
  date: string;
  amountUsd: number;
  autopay: boolean;
  provenance: Provenance;
  status: ObligationDisplayStatus;
}

export interface ForecastDay {
  date: string;
  balanceUsd: number;
  obligationsDueUsd: number;
}

export interface SolvencyForecast {
  liquidBalanceUsd: number;
  /** Days until balance goes negative within horizon, or full horizon if solvent. */
  runwayDays: number;
  horizonDays: number;
  dueIn7dUsd: number;
  overdueUsd: number;
  /**
   * Sum of income_stream occurrences in [today, today+horizonDays).
   * Zero when no streams — Home helper should say “add income”, not fake payroll.
   */
  plannedIncomeUsd: number;
  /** True when at least one income_stream row exists (even if none fall in horizon). */
  hasIncomeStreams: boolean;
  series: ForecastDay[];
  upcoming: ObligationOccurrence[];
}

export type IngestSource = "plaid" | "email" | "document" | "snaptrade" | "manual";

export type IngestKind = "transaction" | "balance" | "bill" | "statement" | "notice";

export interface IngestedEvent {
  id: string;
  tenantId: string;
  source: IngestSource;
  kind: IngestKind;
  externalId: string | null;
  fundingAccountId: string | null;
  payloadJson: string;
  confidence: number;
  reviewed: boolean;
  promotedAt: string | null;
  ingestedAt: string;
}

export interface BankTransaction {
  id: string;
  tenantId: string;
  fundingAccountId: string;
  ingestedEventId: string | null;
  externalId: string;
  payee: string;
  amountUsd: number;
  postedDate: string;
  pending: boolean;
  category: string | null;
  provenance: Provenance;
  createdAt: string;
}

export interface PlaidItem {
  id: string;
  tenantId: string;
  externalItemId: string;
  institutionName: string;
  vaultCredentialRef: string;
  status: "active" | "error" | "disconnected";
  lastSyncAt: string | null;
  /** Plaid error code when status=error (slice 3). */
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Normalized payload inside ingested_event.payload_json for Plaid transactions. */
export interface PlaidTransactionPayload {
  plaidAccountId: string;
  transactionId: string;
  payee: string;
  amountUsd: number;
  date: string;
  pending: boolean;
  category?: string;
}

export interface PlaidBalancePayload {
  plaidAccountId: string;
  balanceUsd: number;
}

/** Normalized bill extraction inside ingested_event.payload_json (document/email). */
export interface BillExtractPayload {
  payee: string;
  /** 0 when unknown (statements) — confirmBillIngest still requires a positive amount. */
  amountUsd: number;
  /** Empty when unknown (statements). */
  dueDate: string;
  cadence: ObligationCadence;
  autopay: boolean;
  classifier: "bill" | "statement" | "notice" | "other";
  documentArtifactId: string | null;
  filename: string;
  rawText?: string;
  /** Statement → Plaid/SnapTrade hint (ADR-015). Never auto-Link. */
  institutionHint?: string | null;
  rail?: "plaid" | "snaptrade" | null;
}

export interface DocumentArtifact {
  id: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  storageRef: string;
  sha256: string;
  byteSize: number;
  createdAt: string;
}

/** VS-4.2: IMAP mailbox metadata — password in vault only. */
export interface ImapAccount {
  id: string;
  tenantId: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  vaultCredentialRef: string;
  mailbox: string;
  status: "active" | "error" | "disconnected";
  lastSyncAt: string | null;
  lastUid: number | null;
  /** Short poll/auth failure message when status=error (slice 4). */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** VS-4.3: Gmail OAuth account — refresh token in vault only (ADR-008). */
export interface GmailAccount {
  id: string;
  tenantId: string;
  email: string;
  label: string;
  vaultCredentialRef: string;
  status: "active" | "error" | "disconnected";
  lastSyncAt: string | null;
  historyId: string | null;
  /** Short poll/auth failure message when status=error (slice 4). */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** BL-5: SnapTrade brokerage connection — userSecret in vault only. */
export interface SnapTradeConnection {
  id: string;
  tenantId: string;
  /** SnapTrade userId (stable, not email). */
  externalUserId: string;
  label: string;
  brokerageName: string | null;
  vaultCredentialRef: string;
  status: "active" | "error" | "disconnected";
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
