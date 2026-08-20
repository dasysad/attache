/**
 * TigerBeetle LedgerPort (ADR-001 P1 / BL-11).
 *
 * WHAT: post through a TB replica (or FakeTigerBeetleClient), then mirror into
 *       the SQLite journal so projections, memos, and HITL ids stay familiar.
 * HOW: TB first (deterministic u128 ids) → SqliteLedgerAdapter.postTransfer.
 *      `exists` is success (idempotent retry). `exceeds_credits` → funds error
 *      *before* createTransfers when we can, so we do not burn the transfer id.
 * WHY: TB is the invariant engine; SQLite remains the agent-readable audit copy.
 */
import type Database from "better-sqlite3";
import { getAccount } from "../account.js";
import type { TigerBeetleClient } from "./client.js";
import {
  isTbCreateOk,
  TB_CODE_ASSET,
  TB_CODE_EQUITY,
  TB_CODE_EXTERNAL,
  TB_LEDGER_USD,
  tbAssetBalanceMinor,
  TbAccountFlags,
  zeroAccount,
  zeroTransfer,
} from "./client.js";
import { InsufficientFundsError, LedgerInvariantError } from "./errors.js";
import { fundingTbId, openingTbId, systemTbId, transferTbId } from "./ids.js";
import type { LedgerPort } from "./port.js";
import { SqliteLedgerAdapter } from "./sqlite-adapter.js";
import type {
  LedgerHistoryEntry,
  LedgerTransfer,
  PostTransferInput,
  PostTransferResult,
} from "./types.js";
import { minorToUsd, usdToMinor } from "./types.js";

function firstStatus(results: Array<{ status: string }>): string {
  return results[0]?.status ?? "created";
}

function assertTbOk(op: string, status: string, extraOk: string[] = []): void {
  if (isTbCreateOk(status) || extraOk.includes(status)) return;
  if (status === "exceeds_credits") {
    throw new InsufficientFundsError();
  }
  throw new LedgerInvariantError(`TigerBeetle ${op} failed: ${status}`);
}

export class TigerBeetleLedgerAdapter implements LedgerPort {
  private readonly sqlite = new SqliteLedgerAdapter();

  constructor(private readonly client: TigerBeetleClient) {}

  async ensureFundingAccount(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): Promise<string> {
    const sqliteId = await this.sqlite.ensureFundingAccount(
      db,
      tenantId,
      fundingAccountId,
    );
    await this.ensureTbFunding(db, tenantId, fundingAccountId);
    return sqliteId;
  }

  async postTransfer(
    db: Database.Database,
    input: PostTransferInput,
  ): Promise<PostTransferResult> {
    const amountMinor = usdToMinor(input.amountUsd);
    if (amountMinor <= 0) throw new Error("amount must be positive");
    if (
      input.toFundingAccountId &&
      input.toFundingAccountId === input.fromFundingAccountId
    ) {
      throw new Error("from and to account must differ");
    }

    await this.ensureTbFunding(db, input.tenantId, input.fromFundingAccountId);
    if (input.toFundingAccountId) {
      await this.ensureTbFunding(db, input.tenantId, input.toFundingAccountId);
    } else {
      await this.ensureTbSystem(input.tenantId, "external");
    }

    const existing = await this.sqlite.lookupTransfer(
      db,
      input.tenantId,
      input.idempotencyKey,
    );
    const tbXferId = transferTbId(input.idempotencyKey);
    const debitId = fundingTbId(input.fromFundingAccountId);
    const creditId = input.toFundingAccountId
      ? fundingTbId(input.toFundingAccountId)
      : systemTbId(input.tenantId, "external");

    if (!existing) {
      const fromAccounts = await this.client.lookupAccounts([debitId]);
      const from = fromAccounts.find((a) => a.id === debitId);
      if (!from) {
        throw new LedgerInvariantError("TigerBeetle debit account missing after ensure");
      }
      if (tbAssetBalanceMinor(from) < amountMinor) {
        throw new InsufficientFundsError(
          `Insufficient balance: ${minorToUsd(tbAssetBalanceMinor(from))} USD available, ${input.amountUsd} requested`,
        );
      }
    }

    const posted = await this.client.createTransfers([
      zeroTransfer({
        id: tbXferId,
        debit_account_id: debitId,
        credit_account_id: creditId,
        amount: BigInt(existing ? existing.amountMinor : amountMinor),
      }),
    ]);
    const status = firstStatus(posted);
    if (existing && status === "exists_with_different_amount") {
      throw new LedgerInvariantError(
        `TigerBeetle transfer ${input.idempotencyKey} exists with a different amount`,
      );
    }
    assertTbOk("createTransfers", status);

    return this.sqlite.postTransfer(db, input);
  }

  async getBalanceUsd(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): Promise<number> {
    await this.ensureFundingAccount(db, tenantId, fundingAccountId);
    const id = fundingTbId(fundingAccountId);
    const found = await this.client.lookupAccounts([id]);
    const account = found.find((a) => a.id === id);
    if (!account) {
      throw new LedgerInvariantError(`TigerBeetle account missing: ${fundingAccountId}`);
    }
    return minorToUsd(tbAssetBalanceMinor(account));
  }

  async getAccountHistory(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
    options?: { limit?: number },
  ): Promise<LedgerHistoryEntry[]> {
    await this.ensureTbFunding(db, tenantId, fundingAccountId);
    return this.sqlite.getAccountHistory(db, tenantId, fundingAccountId, options);
  }

  async lookupTransfer(
    db: Database.Database,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<LedgerTransfer | null> {
    return this.sqlite.lookupTransfer(db, tenantId, idempotencyKey);
  }

  /**
   * Create the TB asset (+ opening from current projected balance) and system legs.
   * Opening `exists_with_different_amount` means this replica was already seeded.
   */
  private async ensureTbFunding(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): Promise<void> {
    const funding = getAccount(db, fundingAccountId);
    if (!funding) throw new Error("funding account not found");

    await this.ensureTbSystem(tenantId, "equity");
    await this.ensureTbSystem(tenantId, "external");

    const assetId = fundingTbId(fundingAccountId);
    const created = await this.client.createAccounts([
      zeroAccount({
        id: assetId,
        ledger: TB_LEDGER_USD,
        code: TB_CODE_ASSET,
        flags: TbAccountFlags.debits_must_not_exceed_credits,
      }),
    ]);
    assertTbOk("createAccounts(asset)", firstStatus(created));

    const amountMinor = usdToMinor(funding.balanceUsd);
    if (amountMinor === 0) return;

    const already = await this.client.lookupTransfers([
      openingTbId(fundingAccountId),
    ]);
    if (already.some((t) => t.id === openingTbId(fundingAccountId))) return;

    const looked = await this.client.lookupAccounts([assetId]);
    const asset = looked.find((a) => a.id === assetId);
    if (asset && (asset.credits_posted !== 0n || asset.debits_posted !== 0n)) {
      return;
    }

    const opening = await this.client.createTransfers([
      zeroTransfer({
        id: openingTbId(fundingAccountId),
        debit_account_id: systemTbId(tenantId, "equity"),
        credit_account_id: assetId,
        amount: BigInt(amountMinor),
      }),
    ]);
    assertTbOk("createTransfers(opening)", firstStatus(opening), [
      "exists_with_different_amount",
    ]);
  }

  private async ensureTbSystem(
    tenantId: string,
    role: "equity" | "external",
  ): Promise<void> {
    const code = role === "equity" ? TB_CODE_EQUITY : TB_CODE_EXTERNAL;
    const results = await this.client.createAccounts([
      zeroAccount({
        id: systemTbId(tenantId, role),
        ledger: TB_LEDGER_USD,
        code,
        flags: TbAccountFlags.none,
      }),
    ]);
    assertTbOk(`createAccounts(${role})`, firstStatus(results));
  }
}
