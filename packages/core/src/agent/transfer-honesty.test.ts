import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "../account.js";
import { openDatabase } from "../db.js";
import { FakePlaidAdapter } from "../ingest/fake-plaid-adapter.js";
import { connectSandboxPlaid } from "../plaid/sync.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import { proposeTransfer } from "./transfer.js";
import {
  TRANSFER_HONESTY,
  transferApprovalMessage,
  transferHonesty,
} from "./transfer-honesty.js";
import {
  approveTransferProposal,
  createTransferProposal,
} from "./transfer-queue.js";

describe("slice 5 transfer honesty", () => {
  let dataDir: string;
  let vaultDir: string;

  afterEach(() => {
    setVaultForTests(null);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  function setupManual() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-honesty-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    createAccount(db, { name: "Checking", balanceUsd: 5000 });
    createAccount(db, { name: "Savings", balanceUsd: 1000 });
    return { db };
  }

  it("classifies all-manual as ledger_execute", () => {
    const { db } = setupManual();
    const [checking, savings] = listAccounts(db);
    const h = transferHonesty(db, checking!.id, savings!.id);
    expect(h.mode).toBe("ledger_execute");
    expect(h.willExecute).toBe(true);
    expect(h.willSubmitAch).toBe(false);
    expect(h.plaidLegs).toEqual([]);
    expect(h.note).toBe(TRANSFER_HONESTY.ledgerExecute);
    db.close();
  });

  it("classifies Plaid from as approval_only and warns on propose", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-honesty-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-honesty-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    await connectSandboxPlaid(db, new FakePlaidAdapter(), vault);
    const plaid = listAccounts(db).find((a) => a.provenance === "plaid")!;

    const h = transferHonesty(db, plaid.id, null, { ATTACHE_ACH: "off" });
    expect(h.mode).toBe("approval_only");
    expect(h.willExecute).toBe(false);
    expect(h.willSubmitAch).toBe(false);
    expect(h.plaidLegs).toContain("from");

    const sim = proposeTransfer(db, {
      fromAccountId: plaid.id,
      amountUsd: 25,
    });
    expect(sim.warnings.some((w) => /no bank move|Plaid/i.test(w))).toBe(true);

    const pending = createTransferProposal(db, {
      fromAccountId: plaid.id,
      amountUsd: 25,
      proposedBy: "cli",
    });
    const approved = await approveTransferProposal(db, pending.id);
    expect(approved.status).toBe("approved");
    expect(transferApprovalMessage(approved.status)).toBe(
      TRANSFER_HONESTY.approvedStatus,
    );
    // Balance unchanged — honesty: no fake ACH.
    expect(listAccounts(db).find((a) => a.id === plaid.id)!.balanceUsd).toBe(
      plaid.balanceUsd,
    );
    db.close();
  });

  it("unknown from account → approval_only (negative)", () => {
    const { db } = setupManual();
    const h = transferHonesty(db, "missing-id");
    expect(h.mode).toBe("approval_only");
    expect(h.willExecute).toBe(false);
    db.close();
  });

  it("executed message for manual approve", async () => {
    const { db } = setupManual();
    const checking = listAccounts(db)[0]!;
    const pending = createTransferProposal(db, {
      fromAccountId: checking.id,
      amountUsd: 10,
      proposedBy: "cli",
    });
    const executed = await approveTransferProposal(db, pending.id);
    expect(executed.status).toBe("executed");
    expect(transferApprovalMessage("executed")).toBe(TRANSFER_HONESTY.executedStatus);
    db.close();
  });
});
