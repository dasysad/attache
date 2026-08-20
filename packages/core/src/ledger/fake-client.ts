/**
 * In-memory TigerBeetle replica for tests (ADR-001 P1).
 *
 * WHAT: createAccounts / createTransfers / lookup* with TB invariants we rely on.
 * WHY: CI and unit tests must not need the tigerbeetle binary. Live replica is
 *      opt-in via ATTACHE_LEDGER=tigerbeetle.
 *
 * Semantics implemented: exists vs exists_with_different_*, exceeds_credits
 * (debits_must_not_exceed_credits), accounts_must_be_different, id reserved.
 * Two-phase pending is out of scope (HITL stays SQLite).
 */
import type {
  TbAccount,
  TbCreateResult,
  TbTransfer,
  TigerBeetleClient,
} from "./client.js";
import { TbAccountFlags } from "./client.js";

const U128_MAX = (1n << 128n) - 1n;
const CREATED = "created";

function ok(timestamp: bigint, status: string): TbCreateResult {
  return { timestamp, status };
}

function accountFingerprint(a: TbAccount): string {
  return [a.flags, a.ledger, a.code, a.user_data_128, a.user_data_64, a.user_data_32].join(":");
}

function transferDiff(existing: TbTransfer, next: TbTransfer): string | null {
  if (existing.flags !== next.flags) return "exists_with_different_flags";
  if (existing.pending_id !== next.pending_id) return "exists_with_different_pending_id";
  if (existing.timeout !== next.timeout) return "exists_with_different_timeout";
  if (existing.debit_account_id !== next.debit_account_id) {
    return "exists_with_different_debit_account_id";
  }
  if (existing.credit_account_id !== next.credit_account_id) {
    return "exists_with_different_credit_account_id";
  }
  if (existing.amount !== next.amount) return "exists_with_different_amount";
  if (existing.user_data_128 !== next.user_data_128) return "exists_with_different_user_data_128";
  if (existing.user_data_64 !== next.user_data_64) return "exists_with_different_user_data_64";
  if (existing.user_data_32 !== next.user_data_32) return "exists_with_different_user_data_32";
  if (existing.ledger !== next.ledger) return "exists_with_different_ledger";
  if (existing.code !== next.code) return "exists_with_different_code";
  return null;
}

export class FakeTigerBeetleClient implements TigerBeetleClient {
  private accounts = new Map<bigint, TbAccount>();
  private transfers = new Map<bigint, TbTransfer>();
  /** Transfer ids that failed with a transient error (TB id_already_failed). */
  private failedIds = new Set<bigint>();
  private clock = 1n;

  async createAccounts(batch: TbAccount[]): Promise<TbCreateResult[]> {
    return batch.map((raw) => this.createAccount(raw));
  }

  async createTransfers(batch: TbTransfer[]): Promise<TbCreateResult[]> {
    return batch.map((raw) => this.createTransfer(raw));
  }

  async lookupAccounts(ids: bigint[]): Promise<TbAccount[]> {
    const out: TbAccount[] = [];
    for (const id of ids) {
      const a = this.accounts.get(id);
      if (a) out.push({ ...a });
    }
    return out;
  }

  async lookupTransfers(ids: bigint[]): Promise<TbTransfer[]> {
    const out: TbTransfer[] = [];
    for (const id of ids) {
      const t = this.transfers.get(id);
      if (t) out.push({ ...t });
    }
    return out;
  }

  private createAccount(raw: TbAccount): TbCreateResult {
    const ts = this.clock++;
    if (raw.id === 0n) return ok(ts, "id_must_not_be_zero");
    if (raw.id === U128_MAX) return ok(ts, "id_must_not_be_int_max");
    if (raw.ledger === 0) return ok(ts, "ledger_must_not_be_zero");
    if (raw.code === 0) return ok(ts, "code_must_not_be_zero");

    const existing = this.accounts.get(raw.id);
    if (existing) {
      if (accountFingerprint(existing) !== accountFingerprint(raw)) {
        if (existing.flags !== raw.flags) return ok(ts, "exists_with_different_flags");
        if (existing.ledger !== raw.ledger) return ok(ts, "exists_with_different_ledger");
        if (existing.code !== raw.code) return ok(ts, "exists_with_different_code");
        return ok(ts, "exists_with_different_user_data_128");
      }
      return ok(existing.timestamp, "exists");
    }

    this.accounts.set(raw.id, {
      ...raw,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      timestamp: ts,
    });
    return ok(ts, CREATED);
  }

  private createTransfer(raw: TbTransfer): TbCreateResult {
    const ts = this.clock++;
    if (raw.id === 0n) return ok(ts, "id_must_not_be_zero");
    if (raw.id === U128_MAX) return ok(ts, "id_must_not_be_int_max");
    if (this.failedIds.has(raw.id)) return ok(ts, "id_already_failed");

    const existing = this.transfers.get(raw.id);
    if (existing) {
      const diff = transferDiff(existing, raw);
      if (diff) return ok(ts, diff);
      return ok(existing.timestamp, "exists");
    }

    if (raw.debit_account_id === 0n) return ok(ts, "debit_account_id_must_not_be_zero");
    if (raw.credit_account_id === 0n) return ok(ts, "credit_account_id_must_not_be_zero");
    if (raw.debit_account_id === raw.credit_account_id) {
      return ok(ts, "accounts_must_be_different");
    }
    if (raw.ledger === 0) return ok(ts, "ledger_must_not_be_zero");
    if (raw.code === 0) return ok(ts, "code_must_not_be_zero");

    const debit = this.accounts.get(raw.debit_account_id);
    const credit = this.accounts.get(raw.credit_account_id);
    if (!debit) {
      this.failedIds.add(raw.id);
      return ok(ts, "debit_account_not_found");
    }
    if (!credit) {
      this.failedIds.add(raw.id);
      return ok(ts, "credit_account_not_found");
    }
    if (debit.ledger !== credit.ledger) {
      return ok(ts, "accounts_must_have_the_same_ledger");
    }
    if (raw.ledger !== debit.ledger) {
      return ok(ts, "transfer_must_have_the_same_ledger_as_accounts");
    }

    const flagDebitCap = TbAccountFlags.debits_must_not_exceed_credits;
    if (
      (debit.flags & flagDebitCap) !== 0 &&
      debit.debits_posted + debit.debits_pending + raw.amount > debit.credits_posted
    ) {
      this.failedIds.add(raw.id);
      return ok(ts, "exceeds_credits");
    }

    debit.debits_posted += raw.amount;
    credit.credits_posted += raw.amount;
    this.transfers.set(raw.id, { ...raw, timestamp: ts });
    return ok(ts, CREATED);
  }
}
