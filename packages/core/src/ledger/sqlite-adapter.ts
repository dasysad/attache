import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getAccount } from "../account.js";
import { InsufficientFundsError, LedgerInvariantError } from "./errors.js";
import type { LedgerPort } from "./port.js";
import { syncFundingBalanceProjection } from "./projection.js";
import type {
  LedgerAccount,
  LedgerAccountRole,
  LedgerHistoryEntry,
  LedgerTransfer,
  PostTransferInput,
  PostTransferResult,
} from "./types.js";
import { minorToUsd, usdToMinor } from "./types.js";

/**
 * SQLite-backed LedgerPort (ADR-001 P0).
 *
 * WHAT: double-entry journal tables in the same `attache.db` as domain data.
 * HOW: each transfer creates a header + balanced signed entries; asset balances
 *      are SUM(amount_minor); funding_account.balance_usd is synced after post.
 * WHY: dogfood-ready audit trail without running TigerBeetle yet.
 */

interface AccountRow {
  id: string;
  tenant_id: string;
  funding_account_id: string | null;
  role: string;
  name: string;
  created_at: string;
}

interface TransferRow {
  id: string;
  tenant_id: string;
  idempotency_key: string;
  amount_minor: number;
  memo: string | null;
  proposal_id: string | null;
  created_at: string;
}

function mapAccount(row: AccountRow): LedgerAccount {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fundingAccountId: row.funding_account_id,
    role: row.role as LedgerAccountRole,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapTransfer(row: TransferRow): LedgerTransfer {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    idempotencyKey: row.idempotency_key,
    amountMinor: row.amount_minor,
    memo: row.memo,
    proposalId: row.proposal_id,
    createdAt: row.created_at,
  };
}

function systemAccountId(tenantId: string, role: "equity" | "external"): string {
  return `ledger-system-${role}-${tenantId}`;
}

function sumAccountMinor(db: Database.Database, accountId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM ledger_entry WHERE account_id = ?`,
    )
    .get(accountId) as { total: number };
  return row.total;
}

function assertBalancedTransfer(db: Database.Database, transferId: string): void {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM ledger_entry WHERE transfer_id = ?`,
    )
    .get(transferId) as { total: number };
  if (row.total !== 0) {
    throw new LedgerInvariantError(
      `Transfer ${transferId} is unbalanced: sum=${row.total} minor units`,
    );
  }
}

export class SqliteLedgerAdapter implements LedgerPort {
  private getAccountRow(
    db: Database.Database,
    tenantId: string,
    ledgerAccountId: string,
  ): AccountRow {
    const row = db
      .prepare(`SELECT * FROM ledger_account WHERE id = ? AND tenant_id = ?`)
      .get(ledgerAccountId, tenantId) as AccountRow | undefined;
    if (!row) throw new LedgerInvariantError(`ledger account not found: ${ledgerAccountId}`);
    return row;
  }

  private findByFundingAccount(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): AccountRow | undefined {
    return db
      .prepare(
        `SELECT * FROM ledger_account WHERE tenant_id = ? AND funding_account_id = ?`,
      )
      .get(tenantId, fundingAccountId) as AccountRow | undefined;
  }

  private ensureSystemAccount(
    db: Database.Database,
    tenantId: string,
    role: "equity" | "external",
    name: string,
  ): AccountRow {
    const id = systemAccountId(tenantId, role);
    const existing = db
      .prepare(`SELECT * FROM ledger_account WHERE id = ?`)
      .get(id) as AccountRow | undefined;
    if (existing) return existing;

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ledger_account (id, tenant_id, funding_account_id, role, name, created_at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
    ).run(id, tenantId, role, name, now);
    return this.getAccountRow(db, tenantId, id);
  }

  ensureFundingAccount(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): string {
    const funding = getAccount(db, fundingAccountId);
    if (!funding) throw new Error("funding account not found");

    let row = this.findByFundingAccount(db, tenantId, fundingAccountId);
    if (!row) {
      const now = new Date().toISOString();
      const id = randomUUID();
      db.prepare(
        `INSERT INTO ledger_account (id, tenant_id, funding_account_id, role, name, created_at)
         VALUES (?, ?, ?, 'asset', ?, ?)`,
      ).run(id, tenantId, fundingAccountId, funding.name, now);
      row = this.getAccountRow(db, tenantId, id);
    }

    this.bootstrapOpeningBalance(db, tenantId, row, funding.balanceUsd);
    return row.id;
  }

  /**
   * One-time equity credit so the ledger matches the pre-existing manual balance.
   * Idempotent via `opening:{fundingAccountId}`.
   */
  private bootstrapOpeningBalance(
    db: Database.Database,
    tenantId: string,
    asset: AccountRow,
    balanceUsd: number,
  ): void {
    const idempotencyKey = `opening:${asset.funding_account_id}`;
    if (this.lookupTransfer(db, tenantId, idempotencyKey)) return;

    const amountMinor = usdToMinor(balanceUsd);
    if (amountMinor === 0) return;

    const equity = this.ensureSystemAccount(db, tenantId, "equity", "Opening Balance");
    const now = new Date().toISOString();
    const transferId = randomUUID();

    db.prepare(
      `INSERT INTO ledger_transfer
       (id, tenant_id, idempotency_key, amount_minor, memo, proposal_id, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    ).run(
      transferId,
      tenantId,
      idempotencyKey,
      Math.abs(amountMinor),
      "Opening balance bootstrap",
      now,
    );

    this.insertEntry(db, transferId, asset.id, amountMinor, now);
    this.insertEntry(db, transferId, equity.id, -amountMinor, now);
    assertBalancedTransfer(db, transferId);

    if (asset.funding_account_id) {
      syncFundingBalanceProjection(db, tenantId, asset.funding_account_id);
    }
  }

  private insertEntry(
    db: Database.Database,
    transferId: string,
    accountId: string,
    amountMinor: number,
    createdAt: string,
  ): void {
    db.prepare(
      `INSERT INTO ledger_entry (id, transfer_id, account_id, amount_minor, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), transferId, accountId, amountMinor, createdAt);
  }

  postTransfer(db: Database.Database, input: PostTransferInput): PostTransferResult {
    const amountMinor = usdToMinor(input.amountUsd);
    if (amountMinor <= 0) throw new Error("amount must be positive");

    const existing = this.lookupTransfer(db, input.tenantId, input.idempotencyKey);
    if (existing) {
      return { transfer: existing, created: false };
    }

    const fromLedgerId = this.ensureFundingAccount(
      db,
      input.tenantId,
      input.fromFundingAccountId,
    );
    const fromRow = this.getAccountRow(db, input.tenantId, fromLedgerId);

    let toLedgerId: string;
    if (input.toFundingAccountId) {
      toLedgerId = this.ensureFundingAccount(
        db,
        input.tenantId,
        input.toFundingAccountId,
      );
      if (input.toFundingAccountId === input.fromFundingAccountId) {
        throw new Error("from and to account must differ");
      }
    } else {
      toLedgerId = this.ensureSystemAccount(
        db,
        input.tenantId,
        "external",
        "External",
      ).id;
    }

    const available = sumAccountMinor(db, fromLedgerId);
    if (available < amountMinor) {
      throw new InsufficientFundsError(
        `Insufficient balance: ${minorToUsd(available)} USD available, ${input.amountUsd} requested`,
      );
    }

    const now = new Date().toISOString();
    const transferId = randomUUID();

    const run = db.transaction(() => {
      db.prepare(
        `INSERT INTO ledger_transfer
         (id, tenant_id, idempotency_key, amount_minor, memo, proposal_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        transferId,
        input.tenantId,
        input.idempotencyKey,
        amountMinor,
        input.memo?.trim() || null,
        input.proposalId ?? null,
        now,
      );

      this.insertEntry(db, transferId, fromLedgerId, -amountMinor, now);
      this.insertEntry(db, transferId, toLedgerId, amountMinor, now);
      assertBalancedTransfer(db, transferId);
    });
    run();

    syncFundingBalanceProjection(db, input.tenantId, input.fromFundingAccountId);
    if (input.toFundingAccountId) {
      syncFundingBalanceProjection(db, input.tenantId, input.toFundingAccountId);
    }

    const transfer = this.lookupTransfer(db, input.tenantId, input.idempotencyKey)!;
    return { transfer, created: true };
  }

  getBalanceUsd(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
  ): number {
    const ledgerId = this.ensureFundingAccount(db, tenantId, fundingAccountId);
    return minorToUsd(sumAccountMinor(db, ledgerId));
  }

  getAccountHistory(
    db: Database.Database,
    tenantId: string,
    fundingAccountId: string,
    options: { limit?: number } = {},
  ): LedgerHistoryEntry[] {
    const ledgerId = this.ensureFundingAccount(db, tenantId, fundingAccountId);
    const limit = options.limit ?? 50;
    const rows = db
      .prepare(
        `SELECT e.amount_minor, e.created_at, t.id AS transfer_id, t.memo, t.idempotency_key
         FROM ledger_entry e
         JOIN ledger_transfer t ON t.id = e.transfer_id
         WHERE e.account_id = ? AND t.tenant_id = ?
         ORDER BY e.created_at DESC
         LIMIT ?`,
      )
      .all(ledgerId, tenantId, limit) as Array<{
      amount_minor: number;
      created_at: string;
      transfer_id: string;
      memo: string | null;
      idempotency_key: string;
    }>;

    return rows.map((r) => ({
      transferId: r.transfer_id,
      amountMinor: r.amount_minor,
      memo: r.memo,
      createdAt: r.created_at,
      idempotencyKey: r.idempotency_key,
    }));
  }

  lookupTransfer(
    db: Database.Database,
    tenantId: string,
    idempotencyKey: string,
  ): LedgerTransfer | null {
    const row = db
      .prepare(
        `SELECT * FROM ledger_transfer WHERE tenant_id = ? AND idempotency_key = ?`,
      )
      .get(tenantId, idempotencyKey) as TransferRow | undefined;
    return row ? mapTransfer(row) : null;
  }
}

/** Default production adapter. */
let defaultLedger: LedgerPort | null = null;

export function getLedger(): LedgerPort {
  if (!defaultLedger) defaultLedger = new SqliteLedgerAdapter();
  return defaultLedger;
}

export function setLedgerForTests(ledger: LedgerPort | null): void {
  defaultLedger = ledger;
}
