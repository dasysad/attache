/**
 * Ledger errors — typed failures for money movement (ADR-001 P0).
 */

export class InsufficientFundsError extends Error {
  constructor(
    message = "Insufficient ledger balance for this transfer",
  ) {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

export class LedgerInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerInvariantError";
  }
}
