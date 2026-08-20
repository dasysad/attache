/**
 * ACH webhook settle path (ADR-013 P2).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAccounts } from "../account.js";
import { openDatabase } from "../db.js";
import { FakePlaidAdapter } from "../ingest/fake-plaid-adapter.js";
import { connectSandboxPlaid } from "../plaid/sync.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import {
  approveTransferProposal,
  createTransferProposal,
} from "../agent/transfer-queue.js";
import { FakeAchAdapter } from "./fake-adapter.js";
import { setAchForTests } from "./create-adapter.js";
import { getAchTransferByProposal } from "./store.js";
import {
  AchWebhookError,
  achWebhookStatus,
  handleAchWebhook,
} from "./webhook.js";

describe("ACH webhook", () => {
  let dataDir: string;
  let vaultDir: string;
  const prevAch = process.env.ATTACHE_ACH;
  const prevSecret = process.env.ATTACHE_ACH_WEBHOOK_SECRET;

  afterEach(() => {
    setAchForTests(undefined);
    setVaultForTests(null);
    if (prevAch === undefined) delete process.env.ATTACHE_ACH;
    else process.env.ATTACHE_ACH = prevAch;
    if (prevSecret === undefined) delete process.env.ATTACHE_ACH_WEBHOOK_SECRET;
    else process.env.ATTACHE_ACH_WEBHOOK_SECRET = prevSecret;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  async function setupPending() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-ach-wh-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-ach-wh-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "Alex" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    process.env.ATTACHE_ACH = "sandbox";
    process.env.ATTACHE_ACH_WEBHOOK_SECRET = "test-secret";
    setAchForTests(new FakeAchAdapter());
    await connectSandboxPlaid(db, new FakePlaidAdapter(), vault);
    const plaid = listAccounts(db).filter((a) => a.provenance === "plaid");
    const pending = createTransferProposal(db, {
      fromAccountId: plaid[0]!.id,
      toAccountId: plaid[1]!.id,
      amountUsd: 15,
      proposedBy: "cli",
    });
    await approveTransferProposal(db, pending.id);
    const achRow = getAchTransferByProposal(db, pending.id)!;
    return { db, checking: plaid[0]!, savings: plaid[1]!, achRow };
  }

  it("reports off without secret (negative)", () => {
    delete process.env.ATTACHE_ACH_WEBHOOK_SECRET;
    expect(achWebhookStatus().configured).toBe(false);
  });

  it("rejects missing auth (negative)", async () => {
    const { db, achRow } = await setupPending();
    await expect(
      handleAchWebhook(db, {
        transfer_id: achRow.debitTransferId,
        status: "posted",
      }),
    ).rejects.toBeInstanceOf(AchWebhookError);
    db.close();
  });

  it("settles posted webhook onto ledger", async () => {
    const { db, checking, savings, achRow } = await setupPending();
    const beforeChecking = checking.balanceUsd;
    const beforeSavings = savings.balanceUsd;
    const updated = await handleAchWebhook(
      db,
      { transfer_id: achRow.debitTransferId, status: "posted" },
      { authorizationHeader: "Bearer test-secret" },
    );
    expect(updated.status).toBe("posted");
    expect(listAccounts(db).find((a) => a.id === checking.id)!.balanceUsd).toBe(
      beforeChecking - 15,
    );
    expect(listAccounts(db).find((a) => a.id === savings.id)!.balanceUsd).toBe(
      beforeSavings + 15,
    );
    // Idempotent second call
    const again = await handleAchWebhook(
      db,
      { transfer_id: achRow.debitTransferId, status: "posted" },
      { authorizationHeader: "Bearer test-secret" },
    );
    expect(again.status).toBe("posted");
    db.close();
  });

  it("unknown debit id → 404 (negative)", async () => {
    const { db } = await setupPending();
    await expect(
      handleAchWebhook(
        db,
        { transfer_id: "missing", status: "posted" },
        { authorizationHeader: "Bearer test-secret" },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    db.close();
  });
});
