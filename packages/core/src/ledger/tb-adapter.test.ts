import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "../account.js";
import { openDatabase } from "../db.js";
import { createTenant } from "../tenant.js";
import { zeroTransfer } from "./client.js";
import { ledgerBackendFromEnv } from "./config.js";
import { InsufficientFundsError, LedgerInvariantError } from "./errors.js";
import { FakeTigerBeetleClient } from "./fake-client.js";
import { attacheIdToU128, fundingTbId, systemTbId, transferTbId } from "./ids.js";
import { ledgerStatus } from "./status.js";
import { TigerBeetleLedgerAdapter } from "./tb-adapter.js";

describe("TigerBeetleLedgerAdapter (fake replica)", () => {
  let dataDir: string;
  let db: ReturnType<typeof openDatabase>;
  let client: FakeTigerBeetleClient;
  let ledger: TigerBeetleLedgerAdapter;
  let tenantId: string;
  let checkingId: string;
  let savingsId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-tb-"));
    db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    tenantId = (db.prepare(`SELECT id FROM tenant LIMIT 1`).get() as { id: string }).id;
    checkingId = createAccount(db, { name: "Checking", balanceUsd: 5000 }).id;
    savingsId = createAccount(db, { name: "Savings", balanceUsd: 10000 }).id;
    client = new FakeTigerBeetleClient();
    ledger = new TigerBeetleLedgerAdapter(client);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("bootstraps opening on TB matching funding_account.balance_usd", async () => {
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(5000);
  });

  it("posts internal transfer: TB balance matches SQLite projection", async () => {
    await ledger.postTransfer(db, {
      tenantId,
      idempotencyKey: "test:internal-1",
      fromFundingAccountId: checkingId,
      toFundingAccountId: savingsId,
      amountUsd: 750,
      memo: "sweep",
    });
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(4250);
    expect(await ledger.getBalanceUsd(db, tenantId, savingsId)).toBe(10750);
    expect(listAccounts(db).find((a) => a.id === checkingId)!.balanceUsd).toBe(4250);
  });

  it("is idempotent across TB exists + SQLite lookup", async () => {
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

  it("throws InsufficientFundsError without burning a later success", async () => {
    await expect(
      ledger.postTransfer(db, {
        tenantId,
        idempotencyKey: "test:insufficient",
        fromFundingAccountId: checkingId,
        amountUsd: 999_999,
      }),
    ).rejects.toThrow(InsufficientFundsError);

    // Same idempotency key must still work for a smaller amount — we never
    // called createTransfers on the failed attempt (avoid id_already_failed).
    const ok = await ledger.postTransfer(db, {
      tenantId,
      idempotencyKey: "test:insufficient",
      fromFundingAccountId: checkingId,
      amountUsd: 10,
    });
    expect(ok.created).toBe(true);
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(4990);
  });

  it("posts outbound to TB external", async () => {
    await ledger.postTransfer(db, {
      tenantId,
      idempotencyKey: "test:outbound",
      fromFundingAccountId: checkingId,
      amountUsd: 200,
    });
    expect(await ledger.getBalanceUsd(db, tenantId, checkingId)).toBe(4800);
    const ext = await client.lookupAccounts([systemTbId(tenantId, "external")]);
    expect(Number(ext[0]!.credits_posted)).toBe(20000);
  });

  it("rejects from === to (negative)", async () => {
    await expect(
      ledger.postTransfer(db, {
        tenantId,
        idempotencyKey: "test:same",
        fromFundingAccountId: checkingId,
        toFundingAccountId: checkingId,
        amountUsd: 1,
      }),
    ).rejects.toThrow(/differ/i);
  });

  it("rejects missing funding account (negative)", async () => {
    await expect(
      ledger.postTransfer(db, {
        tenantId,
        idempotencyKey: "test:missing",
        fromFundingAccountId: "not-a-real-account",
        amountUsd: 1,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects exists_with_different_amount when SQLite row is gone (negative)", async () => {
    await ledger.postTransfer(db, {
      tenantId,
      idempotencyKey: "test:mutate",
      fromFundingAccountId: checkingId,
      amountUsd: 50,
    });
    db.prepare(`DELETE FROM ledger_entry`).run();
    db.prepare(`DELETE FROM ledger_transfer`).run();

    await expect(
      ledger.postTransfer(db, {
        tenantId,
        idempotencyKey: "test:mutate",
        fromFundingAccountId: checkingId,
        amountUsd: 75,
      }),
    ).rejects.toThrow(LedgerInvariantError);
  });
});

describe("ledger ids", () => {
  it("is stable for the same key", () => {
    expect(attacheIdToU128("funding:abc")).toBe(attacheIdToU128("funding:abc"));
    expect(transferTbId("proposal:1")).not.toBe(transferTbId("proposal:2"));
  });

  it("never returns reserved 0 or u128 max", () => {
    const id = attacheIdToU128("anything");
    expect(id).not.toBe(0n);
    expect(id).not.toBe((1n << 128n) - 1n);
  });
});

describe("ledger config + status", () => {
  it("defaults to sqlite", () => {
    expect(ledgerBackendFromEnv({})).toBe("sqlite");
    expect(ledgerBackendFromEnv({ ATTACHE_LEDGER: "sqlite" })).toBe("sqlite");
  });

  it("accepts tigerbeetle aliases", () => {
    expect(ledgerBackendFromEnv({ ATTACHE_LEDGER: "tigerbeetle" })).toBe("tigerbeetle");
    expect(ledgerBackendFromEnv({ ATTACHE_LEDGER: "TB" })).toBe("tigerbeetle");
  });

  it("rejects unknown ATTACHE_LEDGER (negative)", () => {
    expect(() => ledgerBackendFromEnv({ ATTACHE_LEDGER: "postgres" })).toThrow(
      /Unknown ATTACHE_LEDGER/i,
    );
  });

  it("sqlite status does not require a replica", async () => {
    const s = await ledgerStatus({ ATTACHE_LEDGER: "sqlite" });
    expect(s.backend).toBe("sqlite");
    expect(s.replicaRequired).toBe(false);
    expect(s.reachable).toBeNull();
  });

  it("tigerbeetle status pings the injected client", async () => {
    const fake = new FakeTigerBeetleClient();
    const s = await ledgerStatus(
      { ATTACHE_LEDGER: "tigerbeetle", ATTACHE_TB_ADDRESS: "127.0.0.1:3000" },
      { client: fake },
    );
    expect(s.backend).toBe("tigerbeetle");
    expect(s.reachable).toBe(true);
    expect(s.replicaAddress).toBe("127.0.0.1:3000");
  });

  it("records ping failure (negative)", async () => {
    const fake = new FakeTigerBeetleClient();
    const s = await ledgerStatus(
      { ATTACHE_LEDGER: "tb" },
      { client: fake, ping: async () => { throw new Error("replica down"); } },
    );
    expect(s.reachable).toBe(false);
    expect(s.error).toMatch(/replica down/);
  });
});

describe("FakeTigerBeetleClient", () => {
  it("returns exceeds_credits then id_already_failed for the same id (negative)", async () => {
    const c = new FakeTigerBeetleClient();
    const debit = fundingTbId("poor");
    const credit = fundingTbId("sink");
    await c.createAccounts([
      {
        id: debit,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1,
        code: 10,
        flags: 2,
        timestamp: 0n,
      },
      {
        id: credit,
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        user_data_128: 0n,
        user_data_64: 0n,
        user_data_32: 0,
        reserved: 0,
        ledger: 1,
        code: 10,
        flags: 0,
        timestamp: 0n,
      },
    ]);
    const xfer = zeroTransfer({
      id: 99n,
      debit_account_id: debit,
      credit_account_id: credit,
      amount: 1n,
    });
    expect((await c.createTransfers([xfer]))[0]!.status).toBe("exceeds_credits");
    expect((await c.createTransfers([xfer]))[0]!.status).toBe("id_already_failed");
  });
});
