/**
 * TigerBeetle client port (ADR-001 P1).
 *
 * WHAT: the subset of the Node client Attache needs, with string statuses.
 * WHY: tests use `FakeTigerBeetleClient` (no replica). Live wraps
 *      `tigerbeetle-node`. Status names match CreateTransferStatus keys.
 */
export const TB_LEDGER_USD = 1;
export const TB_CODE_ASSET = 10;
export const TB_CODE_EQUITY = 20;
export const TB_CODE_EXTERNAL = 30;
export const TB_CODE_TRANSFER = 1;

/** Mirrors tigerbeetle-node AccountFlags bits we use. */
export const TbAccountFlags = {
  none: 0,
  debits_must_not_exceed_credits: 2,
} as const;

export interface TbAccount {
  id: bigint;
  debits_pending: bigint;
  debits_posted: bigint;
  credits_pending: bigint;
  credits_posted: bigint;
  user_data_128: bigint;
  user_data_64: bigint;
  user_data_32: number;
  reserved: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: bigint;
}

export interface TbTransfer {
  id: bigint;
  debit_account_id: bigint;
  credit_account_id: bigint;
  amount: bigint;
  pending_id: bigint;
  user_data_128: bigint;
  user_data_64: bigint;
  user_data_32: number;
  timeout: number;
  ledger: number;
  code: number;
  flags: number;
  timestamp: bigint;
}

export interface TbCreateResult {
  timestamp: bigint;
  /** `created` / `exists` / `exceeds_credits` / … (enum key names). */
  status: string;
}

export interface TigerBeetleClient {
  createAccounts(batch: TbAccount[]): Promise<TbCreateResult[]>;
  createTransfers(batch: TbTransfer[]): Promise<TbCreateResult[]>;
  lookupAccounts(ids: bigint[]): Promise<TbAccount[]>;
  lookupTransfers(ids: bigint[]): Promise<TbTransfer[]>;
  destroy?(): void;
}

export function isTbCreateOk(status: string): boolean {
  return status === "created" || status === "exists";
}

export function zeroAccount(partial: Pick<TbAccount, "id" | "ledger" | "code" | "flags">): TbAccount {
  return {
    debits_pending: 0n,
    debits_posted: 0n,
    credits_pending: 0n,
    credits_posted: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    reserved: 0,
    timestamp: 0n,
    ...partial,
  };
}

export function zeroTransfer(
  partial: Pick<TbTransfer, "id" | "debit_account_id" | "credit_account_id" | "amount">,
): TbTransfer {
  return {
    pending_id: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    timeout: 0,
    ledger: TB_LEDGER_USD,
    code: TB_CODE_TRANSFER,
    flags: 0,
    timestamp: 0n,
    ...partial,
  };
}

/** Asset balance convention: credits − debits (opening credits the asset). */
export function tbAssetBalanceMinor(account: TbAccount): number {
  const n = account.credits_posted - account.debits_posted;
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("ledger balance exceeds JS safe integer");
  }
  return Number(n);
}
