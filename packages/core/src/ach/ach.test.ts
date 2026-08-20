import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAccount, listAccounts } from "../account.js";
import {
  approveTransferProposal,
  createTransferProposal,
} from "../agent/transfer-queue.js";
import { TRANSFER_HONESTY, transferHonesty } from "../agent/transfer-honesty.js";
import { openDatabase } from "../db.js";
import { FakePlaidAdapter } from "../ingest/fake-plaid-adapter.js";
import { connectSandboxPlaid } from "../plaid/sync.js";
import { unlinkPlaidItem } from "../plaid/unlink.js";
import { createTenant } from "../tenant.js";
import { LocalVaultPort, setVaultForTests } from "../vault/local-vault.js";
import { achBackendFromEnv } from "./config.js";
import { setAchForTests } from "./create-adapter.js";
import { FakeAchAdapter } from "./fake-adapter.js";
import { LivePlaidAchAdapter } from "./live-adapter.js";
import { achStatus } from "./status.js";
import { getAchTransferByProposal } from "./store.js";
import { simulateAchPosted, syncAchTransfers } from "./submit.js";

describe("ACH config", () => {
  it("defaults to off", () => {
    expect(achBackendFromEnv({})).toBe("off");
  });

  it("accepts sandbox and plaid", () => {
    expect(achBackendFromEnv({ ATTACHE_ACH: "sandbox" })).toBe("sandbox");
    expect(achBackendFromEnv({ ATTACHE_ACH: "live" })).toBe("plaid");
  });

  it("rejects unknown ATTACHE_ACH (negative)", () => {
    expect(() => achBackendFromEnv({ ATTACHE_ACH: "dwolla" })).toThrow(/Unknown ATTACHE_ACH/i);
  });
});

describe("FakeAchAdapter", () => {
  it("rejects same debit/credit (negative)", async () => {
    const ach = new FakeAchAdapter();
    await expect(
      ach.submit({
        idempotencyKey: "k",
        amountUsd: 10,
        description: "t",
        legalName: "A",
        debit: { accessToken: "x", plaidAccountId: "same" },
        credit: { accessToken: "y", plaidAccountId: "same" },
      }),
    ).rejects.toThrow(/differ/i);
  });

  it("rejects missing tokens (negative)", async () => {
    const ach = new FakeAchAdapter();
    await expect(
      ach.submit({
        idempotencyKey: "k",
        amountUsd: 10,
        description: "t",
        legalName: "A",
        debit: { accessToken: "", plaidAccountId: "a" },
        credit: { accessToken: "y", plaidAccountId: "b" },
      }),
    ).rejects.toThrow(/access tokens/i);
  });

  it("is idempotent on submit", async () => {
    const ach = new FakeAchAdapter();
    const input = {
      idempotencyKey: "proposal:1",
      amountUsd: 10,
      description: "t",
      legalName: "A",
      debit: { accessToken: "x", plaidAccountId: "a" },
      credit: { accessToken: "y", plaidAccountId: "b" },
    };
    const first = await ach.submit(input);
    const second = await ach.submit(input);
    expect(second.debitTransferId).toBe(first.debitTransferId);
    expect(first.status).toBe("submitted");
  });
});

describe("LivePlaidAchAdapter", () => {
  it("simulatePosted throws (negative)", async () => {
    const ach = new LivePlaidAchAdapter(async () => ({}));
    await expect(ach.simulatePosted("x")).rejects.toThrow(/cannot simulatePosted/i);
  });

  it("submits debit then credit via injected post", async () => {
    const paths: string[] = [];
    const ach = new LivePlaidAchAdapter(async (path) => {
      paths.push(path);
      if (path.includes("authorization")) {
        return { authorization: { id: "auth_1", decision: "approved" } };
      }
      return { transfer: { id: `tr_${paths.length}`, status: "pending" } };
    });
    const rail = await ach.submit({
      idempotencyKey: "proposal:live",
      amountUsd: 12.5,
      description: "sweep",
      legalName: "Alex",
      debit: { accessToken: "tok_d", plaidAccountId: "acct_d" },
      credit: { accessToken: "tok_c", plaidAccountId: "acct_c" },
    });
    expect(paths.filter((p) => p.includes("authorization"))).toHaveLength(2);
    expect(paths.filter((p) => p.includes("/transfer/create"))).toHaveLength(2);
    expect(rail.debitTransferId).toBeTruthy();
    expect(rail.creditTransferId).toBeTruthy();
  });

  it("rejects declined authorization (negative)", async () => {
    const ach = new LivePlaidAchAdapter(async () => ({
      authorization: { id: "auth_x", decision: "declined" },
    }));
    await expect(
      ach.submit({
        idempotencyKey: "proposal:nope",
        amountUsd: 1,
        description: "t",
        legalName: "A",
        debit: { accessToken: "t", plaidAccountId: "a" },
        credit: { accessToken: "t", plaidAccountId: "b" },
      }),
    ).rejects.toThrow(/declined/i);
  });
});

describe("ACH HITL (sandbox rail)", () => {
  let dataDir: string;
  let vaultDir: string;
  const prevAch = process.env.ATTACHE_ACH;

  afterEach(() => {
    setAchForTests(undefined);
    setVaultForTests(null);
    if (prevAch === undefined) delete process.env.ATTACHE_ACH;
    else process.env.ATTACHE_ACH = prevAch;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true });
  });

  async function setupPlaidA2A() {
    dataDir = mkdtempSync(join(tmpdir(), "attache-ach-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-ach-vault-"));
    const db = openDatabase(dataDir);
    createTenant(db, { householdName: "Home", holderDisplayName: "Alex" });
    const vault = new LocalVaultPort(vaultDir, null);
    setVaultForTests(vault);
    process.env.ATTACHE_ACH = "sandbox";
    setAchForTests(new FakeAchAdapter());
    await connectSandboxPlaid(db, new FakePlaidAdapter(), vault);
    const plaid = listAccounts(db).filter((a) => a.provenance === "plaid");
    return { db, vault, checking: plaid[0]!, savings: plaid[1]! };
  }

  it("classifies Plaid A2A as ach_submit when sandbox rail is on", async () => {
    const { db, checking, savings } = await setupPlaidA2A();
    const h = transferHonesty(db, checking.id, savings.id);
    expect(h.mode).toBe("ach_submit");
    expect(h.willSubmitAch).toBe(true);
    expect(h.willExecute).toBe(false);
    expect(h.note).toBe(TRANSFER_HONESTY.achSubmitSandbox);
    db.close();
  });

  it("approve submits ACH; simulate posts ledger", async () => {
    const { db, checking, savings } = await setupPlaidA2A();
    const pending = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 25,
      proposedBy: "cli",
    });
    const approved = await approveTransferProposal(db, pending.id);
    expect(approved.status).toBe("ach_pending");
    const achRow = getAchTransferByProposal(db, pending.id);
    expect(achRow?.status).toBe("submitted");

    const settled = await simulateAchPosted(db, pending.id);
    expect(settled.status).toBe("posted");
    const after = listAccounts(db);
    expect(after.find((a) => a.id === checking.id)!.balanceUsd).toBe(
      checking.balanceUsd - 25,
    );
    expect(after.find((a) => a.id === savings.id)!.balanceUsd).toBe(
      savings.balanceUsd + 25,
    );
    db.close();
  });

  it("simulate is idempotent (negative: second call does not double-post)", async () => {
    const { db, checking, savings } = await setupPlaidA2A();
    const pending = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 10,
    });
    await approveTransferProposal(db, pending.id);
    await simulateAchPosted(db, pending.id);
    await simulateAchPosted(db, pending.id);
    expect(listAccounts(db).find((a) => a.id === checking.id)!.balanceUsd).toBe(
      checking.balanceUsd - 10,
    );
    db.close();
  });

  it("SnapTrade/manual mix stays approval_only with ACH on (negative)", async () => {
    const { db, checking } = await setupPlaidA2A();
    const cash = createAccount(db, { name: "Cash", balanceUsd: 100, kind: "cash" });
    const h = transferHonesty(db, checking.id, cash.id);
    expect(h.mode).toBe("approval_only");
    expect(h.willSubmitAch).toBe(false);
    db.close();
  });

  it("Plaid outbound (no to) stays approval_only (negative)", async () => {
    const { db, checking } = await setupPlaidA2A();
    const h = transferHonesty(db, checking.id);
    expect(h.mode).toBe("approval_only");
    expect(h.willSubmitAch).toBe(false);
    db.close();
  });

  it("blocks Plaid unlink while ach_pending", async () => {
    const { db, vault, checking, savings } = await setupPlaidA2A();
    const pending = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 5,
    });
    await approveTransferProposal(db, pending.id);
    const itemId = checking.plaidItemId!;
    expect(() => unlinkPlaidItem(db, itemId, vault)).toThrow(/pending transfer/i);
    db.close();
  });

  it("simulate without ACH row throws (negative)", async () => {
    const { db } = await setupPlaidA2A();
    await expect(simulateAchPosted(db, "missing")).rejects.toThrow(/not found/i);
    db.close();
  });

  it("sync on already-submitted fake is a no-op until simulate", async () => {
    const { db, checking, savings } = await setupPlaidA2A();
    const pending = createTransferProposal(db, {
      fromAccountId: checking.id,
      toAccountId: savings.id,
      amountUsd: 5,
    });
    await approveTransferProposal(db, pending.id);
    const synced = await syncAchTransfers(db);
    expect(synced[0]!.status).toBe("submitted");
    db.close();
  });

  it("ach status reports sandbox", async () => {
    const { db } = await setupPlaidA2A();
    const s = achStatus(db, { ATTACHE_ACH: "sandbox" });
    expect(s.backend).toBe("sandbox");
    expect(s.enabled).toBe(true);
    db.close();
  });
});
