import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "../account.js";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { InsufficientFundsError } from "./errors.js";
import { SqliteLedgerAdapter } from "./sqlite-adapter.js";
import { minorToUsd, usdToMinor } from "./types.js";

describe("SqliteLedgerAdapter", () => {
  let dataDir: string;
  let db: ReturnType<typeof openDatabase>;
  const ledger = new SqliteLedgerAdapter();
  let tenantId: string;
  let checkingId: string;
  let savingsId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-ledger-"));
    db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    tenantId = (db.prepare(`SELECT id FROM tenant LIMIT 1`).get() as { id: string }).id;
    checkingId = createAccount(db, { name: "Checking", balanceUsd: 5000 }).id;
    savingsId = createAccount(db, { name: "Savings", balanceUsd: 10000 }).id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("bootstraps opening balance from funding_account.balance_usd", async () => {
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(5000);
    const history = await ledger.getAccountHistory(db, tenantId, checkingId);
    expect(history.some((h) => h.idempotencyKey === `opening:${checkingId}`)).toBe(true);
  });

  it("posts a balanced internal transfer and syncs projections", async () => {
    const result = await ledger.postTransfer(db, {
      tenantId,
      idempotencyKey: "test:internal-1",
      fromFundingAccountId: checkingId,
      toFundingAccountId: savingsId,
      amountUsd: 750,
      memo: "sweep",
    });
    expect(result.created).toBe(true);

    const entries = db
      .prepare(
        `SELECT amount_minor FROM ledger_entry WHERE transfer_id = ? ORDER BY amount_minor`,
      )
      .all(result.transfer.id) as Array<{ amount_minor: number }>;
    expect(entries).toHaveLength(2);
    expect(entries[0]!.amount_minor + entries[1]!.amount_minor).toBe(0);

    const accounts = listAccounts(db);
    expect(accounts.find((a) => a.id === checkingId)!.balanceUsd).toBe(4250);
    expect(accounts.find((a) => a.id === savingsId)!.balanceUsd).toBe(10750);
  });

  it("is idempotent — reposting the same key does not double-debit", async () => {
    const input = {
      tenantId,
      idempotencyKey: "test:idempotent",
      fromFundingAccountId: checkingId,
      toFundingAccountId: savingsId,
      amountUsd: 100,
    };
    const first = await ledger.postTransfer(db, input);
    const second = await ledger.postTransfer(db, input);
    expect(second.created).toBe(false);
    expect(second.transfer.id).toBe(first.transfer.id);
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(4900);
  });

  it("throws InsufficientFundsError when amount exceeds balance", async () => {
    await expect(
      ledger.postTransfer(db, {
        tenantId,
        idempotencyKey: "test:insufficient",
        fromFundingAccountId: checkingId,
        amountUsd: 999_999,
      }),
    ).rejects.toThrow(InsufficientFundsError);
  });

  it("posts outbound transfer to the external system account", async () => {
    await ledger.postTransfer(db, {
      tenantId,
      idempotencyKey: "test:outbound",
      fromFundingAccountId: checkingId,
      amountUsd: 200,
      memo: "external payment",
    });
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(4800);

    const external = db
      .prepare(
        `SELECT id FROM ledger_account WHERE tenant_id = ? AND role = 'external'`,
      )
      .get(tenantId) as { id: string };
    const extBalance = db
      .prepare(`SELECT SUM(amount_minor) AS t FROM ledger_entry WHERE account_id = ?`)
      .get(external.id) as { t: number };
    expect(minorToUsd(extBalance.t)).toBe(200);
  });

  it("usdToMinor rejects non-finite amounts", () => {
    expect(() => usdToMinor(Number.NaN)).toThrow();
  });
});
