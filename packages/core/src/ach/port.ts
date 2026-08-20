/**
 * AchPort — licensed payment rail (ADR-013 / BL-12).
 *
 * WHAT: authorize + create an A2A ACH, look it up, sandbox-simulate posted.
 * WHY: Attache is not a bank; a licensed partner (Plaid Transfer) originates ACH.
 *      HITL approve submits; settlement is a separate step (simulate / sync).
 */
export type AchMode = "sandbox" | "live";

export type AchRailStatus =
  | "submitted"
  | "posted"
  | "failed"
  | "returned";

export interface AchLeg {
  accessToken: string;
  plaidAccountId: string;
}

export interface AchSubmitInput {
  /** Stable retry key — `proposal:{uuid}`. */
  idempotencyKey: string;
  amountUsd: number;
  /** Short ACH description (rail may truncate ~15 chars). */
  description: string;
  legalName: string;
  debit: AchLeg;
  credit: AchLeg;
}

export interface AchRailTransfer {
  /** Provider debit transfer id (primary). */
  debitTransferId: string;
  /** Provider credit transfer id (A2A second leg). */
  creditTransferId: string;
  status: AchRailStatus;
  network: "ach";
  amountUsd: number;
}

export interface AchPort {
  readonly mode: AchMode;
  submit(input: AchSubmitInput): Promise<AchRailTransfer>;
  get(debitTransferId: string): Promise<AchRailTransfer | null>;
  /**
   * Sandbox-only: mark the transfer posted (Plaid `/sandbox/transfer/simulate`).
   * Live adapters throw — production waits on sync/webhooks.
   */
  simulatePosted(debitTransferId: string): Promise<AchRailTransfer>;
}
