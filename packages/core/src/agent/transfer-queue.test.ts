import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../db.js";
import { createAccount, listAccounts } from "../account.js";
import { createTenant } from "../tenant.js";
import { proposeTransfer } from "./transfer.js";
import {
  approveTransferProposal,
  countPendingTransferProposals,
  createTransferProposal,
  listTransferProposals,
  rejectTransferProposal,
} from "./transfer-queue.js";

describe("VS-5.1 transfer queue", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  function setup() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-xfer-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "A" });
    createAccount(db, { name: "Checking", balanceUsd: 5000 });
    createAccount(db, { name: "Savings", balanceUsd: 10000 });
    return { db };
  }

  it("creates pending proposal from simulation", () => {
    const { db } = setup();
    const checking = listAccounts(db)[0]!;
    const savings = listAccounts(db)[1]!;
    const record = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 500,
      proposedBy: "cli",
    });
    expect(record.status).toBe("pending");
    expect(record.allowed).toBe(true);
    expect(record.simulation.dryRun).toBe(true);
    expect(countPendingTransferProposals(db)).toBe(1);
    db.close();
  });

  it("rejects approval when blockers present", async () => {
    const { db } = setup();
    const checking = listAccounts(db)[0]!;
    const sim = proposeTransfer(db, {
      fromAccountId: checking.id,
      amountUsd: 999_999,
    });
    expect(sim.allowed).toBe(false);

    const record = createTransferProposal(db, {
      fromAccountId: checking.id,
      amountUsd: 999_999,
    });
    await expect(approveTransferProposal(db, record.id)).rejects.toThrow(/blockers/i);
    db.close();
  });

  it("executes manual internal transfer on approve via ledger", async () => {
    const { db } = setup();
    const checking = listAccounts(db).find((a) => a.name === "Checking")!;
    const savings = listAccounts(db).find((a) => a.name === "Savings")!;
    const record = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 750,
    });
    const approved = await approveTransferProposal(db, record.id, "ok");
    expect(approved.status).toBe("executed");

    const after = listAccounts(db);
    expect(after.find((a) => a.id === checking.id)!.balanceUsd).toBe(4250);
    expect(after.find((a) => a.id === savings.id)!.balanceUsd).toBe(10750);

    const xfer = db
      .prepare(`SELECT ledger_transfer_id FROM transfer_proposal WHERE id = ?`)
      .get(record.id) as { ledger_transfer_id: string };
    expect(xfer.ledger_transfer_id).toBeTruthy();
    db.close();
  });

  it("approve is idempotent at the ledger layer on retry", async () => {
    const { db } = setup();
    const checking = listAccounts(db).find((a) => a.name === "Checking")!;
    const savings = listAccounts(db).find((a) => a.name === "Savings")!;
    const record = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 100,
    });
    await approveTransferProposal(db, record.id);
    await expect(approveTransferProposal(db, record.id)).rejects.toThrow(/executed/i);
    expect(listAccounts(db).find((a) => a.id === checking.id)!.balanceUsd).toBe(4900);
    db.close();
  });

  it("rejects proposal", () => {
    const { db } = setup();
    const checking = listAccounts(db)[0]!;
    const record = createTransferProposal(db, {
      fromAccountId: checking.id,
      amountUsd: 100,
    });
    rejectTransferProposal(db, record.id, "not now");
    expect(listTransferProposals(db, { status: "pending" })).toHaveLength(0);
    expect(getRejected(db, record.id)?.status).toBe("rejected");
    db.close();
  });
});

function getRejected(db: ReturnType<typeof openDatabase>, id: string) {
  return listTransferProposals(db).find((p) => p.id === id);
}
