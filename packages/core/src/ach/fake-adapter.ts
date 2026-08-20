/**
 * In-memory Plaid Transfer stand-in (ADR-013 P0).
 *
 * WHAT: idempotent A2A ACH with submitted → posted via simulatePosted.
 * WHY: dogfood + tests without Transfer production access or a funded FBO.
 *      Live money movement requires ATTACHE_ACH=plaid.
 */
import type { AchPort, AchRailTransfer, AchSubmitInput } from "./port.js";

interface Stored extends AchRailTransfer {
  idempotencyKey: string;
}

export class FakeAchAdapter implements AchPort {
  readonly mode = "sandbox" as const;
  private byKey = new Map<string, Stored>();
  private byDebitId = new Map<string, Stored>();

  async submit(input: AchSubmitInput): Promise<AchRailTransfer> {
    if (input.amountUsd <= 0 || !Number.isFinite(input.amountUsd)) {
      throw new Error("ACH amount must be a positive finite number");
    }
    if (input.debit.plaidAccountId === input.credit.plaidAccountId) {
      throw new Error("ACH debit and credit accounts must differ");
    }
    if (!input.debit.accessToken || !input.credit.accessToken) {
      throw new Error("ACH submit requires vault access tokens for both legs");
    }
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return this.public(existing);

    const debitTransferId = `sandbox_ach_debit_${input.idempotencyKey}`;
    const creditTransferId = `sandbox_ach_credit_${input.idempotencyKey}`;
    const stored: Stored = {
      idempotencyKey: input.idempotencyKey,
      debitTransferId,
      creditTransferId,
      status: "submitted",
      network: "ach",
      amountUsd: input.amountUsd,
    };
    this.byKey.set(input.idempotencyKey, stored);
    this.byDebitId.set(debitTransferId, stored);
    return this.public(stored);
  }

  async get(debitTransferId: string): Promise<AchRailTransfer | null> {
    const stored = this.byDebitId.get(debitTransferId);
    return stored ? this.public(stored) : null;
  }

  async simulatePosted(debitTransferId: string): Promise<AchRailTransfer> {
    const stored = this.byDebitId.get(debitTransferId);
    if (!stored) throw new Error("ACH transfer not found");
    if (stored.status === "failed" || stored.status === "returned") {
      throw new Error(`cannot simulate posted: status is ${stored.status}`);
    }
    stored.status = "posted";
    return this.public(stored);
  }

  private public(stored: Stored): AchRailTransfer {
    return {
      debitTransferId: stored.debitTransferId,
      creditTransferId: stored.creditTransferId,
      status: stored.status,
      network: stored.network,
      amountUsd: stored.amountUsd,
    };
  }
}
