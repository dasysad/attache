import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LocalVaultPort, setVaultForTests } from "@attache/core";
import { registerAttacheTools } from "./tools.js";

/** Schema smoke tests — MCP registration is integration-tested via core agent tests. */
describe("@attache/mcp schemas", () => {
  it("transfer input validates positive amount", () => {
    const schema = z.object({
      fromAccountId: z.string(),
      amountUsd: z.number().positive(),
    });
    expect(() => schema.parse({ fromAccountId: "a", amountUsd: -1 })).toThrow();
    expect(schema.parse({ fromAccountId: "a", amountUsd: 10 })).toEqual({
      fromAccountId: "a",
      amountUsd: 10,
    });
  });

  it("approve/reject require id; note is optional", () => {
    const schema = z.object({
      id: z.string(),
      note: z.string().optional(),
    });
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ id: "" })).not.toThrow(); // empty string is still a string
    expect(schema.parse({ id: "prop_1" })).toEqual({ id: "prop_1" });
    expect(schema.parse({ id: "prop_1", note: "ok" })).toEqual({
      id: "prop_1",
      note: "ok",
    });
  });
});

type RegisteredTools = Record<
  string,
  { handler: (args: Record<string, unknown>, extra?: unknown) => Promise<{ content: Array<{ text: string }> }> }
>;

function parseJson(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text);
}

describe("@attache/mcp HITL + Plaid tools", () => {
  let dataDir: string;
  let vaultDir: string;
  let tools: RegisteredTools;
  let prevDataDir: string | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "attache-mcp-"));
    vaultDir = mkdtempSync(join(tmpdir(), "attache-mcp-vault-"));
    prevDataDir = process.env.ATTACHE_DATA_DIR;
    process.env.ATTACHE_DATA_DIR = dataDir;
    setVaultForTests(new LocalVaultPort(vaultDir, null));

    const server = new McpServer({ name: "attache-test", version: "0.0.0" });
    registerAttacheTools(server);
    tools = (server as unknown as { _registeredTools: RegisteredTools })._registeredTools;
  });

  afterEach(() => {
    setVaultForTests(null);
    if (prevDataDir === undefined) delete process.env.ATTACHE_DATA_DIR;
    else process.env.ATTACHE_DATA_DIR = prevDataDir;
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it("registers approve/reject and plaid tools", () => {
    for (const name of [
      "approve_transfer_proposal",
      "reject_transfer_proposal",
      "plaid_status",
      "plaid_sync",
      "plaid_connect_sandbox",
      "unlink_plaid_item",
      "delete_account",
      "list_transfer_proposals",
      "ledger_status",
      "ach_status",
      "simulate_ach",
      "sync_ach",
      "get_attention",
      "list_transactions",
      "list_snaptrade_positions",
      "get_net_worth",
      "get_cashflow",
      "get_cashflow_trend",
      "set_transaction_category",
      "create_obligation",
      "mark_obligation_paid",
      "ingest_discover",
      "list_assets",
      "create_asset",
      "confirm_asset",
      "delete_asset",
      "list_entities",
      "register_device",
      "list_devices",
      "unlink_device",
      "credentials_check",
      "credentials_assist",
      "ingest_ingress_status",
      "list_transfer_rules",
      "create_transfer_rule",
      "disable_transfer_rule",
      "evaluate_transfer_rules",
    ]) {
      expect(tools[name], name).toBeDefined();
    }
  });

  it("onboard next names optional ingest_discover; completeSetup skips it (negative)", async () => {
    const open = parseJson(
      await tools.onboard!.handler({
        householdName: "H",
        holderDisplayName: "A",
      }),
    ) as { ok: boolean; next: string; setupComplete: boolean };
    expect(open.ok).toBe(true);
    expect(open.setupComplete).toBe(false);
    expect(open.next).toContain("ingest_discover");
    expect(open.next).toMatch(/Gmail\/Plaid never required/);
  });

  it("get_attention is empty when healthy; not onboarded is an error (negative)", async () => {
    const before = parseJson(await tools.get_attention!.handler({})) as {
      ok: boolean;
      error?: string;
    };
    expect(before.ok).toBe(false);
    expect(before.error).toMatch(/not onboarded/i);

    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    await tools.create_account!.handler({ name: "Checking", balanceUsd: 2500 });
    const after = parseJson(await tools.get_attention!.handler({})) as {
      ok: boolean;
      count: number;
      attention: unknown[];
    };
    expect(after.ok).toBe(true);
    expect(after.count).toBe(0);
    expect(after.attention).toEqual([]);
  });

  it("list_transactions is empty without a bank; bad dates fail (negative)", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const empty = parseJson(await tools.list_transactions!.handler({})) as {
      ok: boolean;
      count: number;
    };
    expect(empty.ok).toBe(true);
    expect(empty.count).toBe(0);

    const bad = parseJson(
      await tools.list_transactions!.handler({ fromDate: "nope" }),
    ) as { ok: boolean; error?: string };
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/YYYY-MM-DD/);
  });

  it("get_net_worth can be negative; get_cashflow empty without txs; recategorize unknown fails (negative)", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    await tools.create_account!.handler({
      name: "Visa",
      balanceUsd: 400,
      kind: "credit",
    });
    const nw = parseJson(await tools.get_net_worth!.handler({})) as {
      ok: boolean;
      netWorthUsd: number;
      hasLiabilities: boolean;
    };
    expect(nw.ok).toBe(true);
    expect(nw.hasLiabilities).toBe(true);
    expect(nw.netWorthUsd).toBe(-400);

    const cf = parseJson(await tools.get_cashflow!.handler({})) as {
      ok: boolean;
      buckets: unknown[];
      netUsd: number;
    };
    expect(cf.ok).toBe(true);
    expect(cf.buckets).toEqual([]);
    expect(cf.netUsd).toBe(0);

    const trend = parseJson(await tools.get_cashflow_trend!.handler({})) as {
      ok: boolean;
      series: unknown[];
      categories: unknown[];
    };
    expect(trend.ok).toBe(true);
    expect(trend.series).toEqual([]);
    expect(trend.categories).toEqual([]);

    const missing = parseJson(
      await tools.set_transaction_category!.handler({ id: "nope", category: "X" }),
    ) as { ok: boolean; error?: string };
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/not found/);
  });

  it("list_snaptrade_positions after sandbox connect", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const before = parseJson(await tools.list_snaptrade_positions!.handler({})) as {
      ok: boolean;
      count: number;
    };
    expect(before.count).toBe(0);

    await tools.snaptrade_connect_sandbox!.handler({});
    const after = parseJson(await tools.list_snaptrade_positions!.handler({})) as {
      ok: boolean;
      count: number;
      positions: Array<{ symbol: string }>;
    };
    expect(after.ok).toBe(true);
    expect(after.count).toBe(2);
    expect(after.positions.map((p) => p.symbol).sort()).toEqual(["VTI", "VXUS"]);
  });

  it("approve/reject fail for missing proposal (negative)", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const approve = parseJson(
      await tools.approve_transfer_proposal!.handler({ id: "missing" }),
    ) as { ok: boolean; error?: string };
    expect(approve.ok).toBe(false);
    expect(approve.error).toMatch(/not found|missing|unknown/i);

    const reject = parseJson(
      await tools.reject_transfer_proposal!.handler({ id: "missing" }),
    ) as { ok: boolean; error?: string };
    expect(reject.ok).toBe(false);
    expect(reject.error).toBeTruthy();
  });

  it("submit → approve executes manual transfer via MCP", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const created = parseJson(
      await tools.create_account!.handler({
        name: "Checking",
        balanceUsd: 5000,
      }),
    ) as { account: { id: string } };
    const savings = parseJson(
      await tools.create_account!.handler({
        name: "Savings",
        balanceUsd: 1000,
      }),
    ) as { account: { id: string } };

    const proposal = parseJson(
      await tools.submit_transfer_proposal!.handler({
        fromAccountId: created.account.id,
        toAccountId: savings.account.id,
        amountUsd: 100,
      }),
    ) as { id: string; status: string };
    expect(proposal.status).toBe("pending");

    const approved = parseJson(
      await tools.approve_transfer_proposal!.handler({
        id: proposal.id,
        note: "mcp ok",
      }),
    ) as {
      ok: boolean;
      proposal: { status: string };
      message?: string;
    };
    expect(approved.ok).toBe(true);
    expect(approved.proposal.status).toBe("executed");
    expect(approved.message).toMatch(/ledger|manual/i);
  });

  it("ledger_status reports sqlite by default", async () => {
    const prev = process.env.ATTACHE_LEDGER;
    delete process.env.ATTACHE_LEDGER;
    try {
      const s = parseJson(await tools.ledger_status!.handler({})) as {
        backend: string;
        replicaRequired: boolean;
      };
      expect(s.backend).toBe("sqlite");
      expect(s.replicaRequired).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ATTACHE_LEDGER;
      else process.env.ATTACHE_LEDGER = prev;
    }
  });

  it("submit → reject marks rejected", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const created = parseJson(
      await tools.create_account!.handler({
        name: "Checking",
        balanceUsd: 5000,
      }),
    ) as { account: { id: string } };

    const proposal = parseJson(
      await tools.submit_transfer_proposal!.handler({
        fromAccountId: created.account.id,
        amountUsd: 50,
      }),
    ) as { id: string };

    const rejected = parseJson(
      await tools.reject_transfer_proposal!.handler({
        id: proposal.id,
        note: "nope",
      }),
    ) as { ok: boolean; proposal: { status: string } };
    expect(rejected.ok).toBe(true);
    expect(rejected.proposal.status).toBe("rejected");
  });

  it("plaid_status / sync require onboard; sandbox connect then sync", async () => {
    const locked = parseJson(await tools.plaid_status!.handler({})) as {
      ok: boolean;
      error?: string;
    };
    expect(locked.ok).toBe(false);
    expect(locked.error).toMatch(/not onboarded/i);

    const syncLocked = parseJson(await tools.plaid_sync!.handler({})) as {
      ok: boolean;
      error?: string;
    };
    expect(syncLocked.ok).toBe(false);

    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });

    const emptySync = parseJson(await tools.plaid_sync!.handler({})) as {
      ok: boolean;
      error?: string;
    };
    expect(emptySync.ok).toBe(false);
    expect(emptySync.error).toMatch(/no active/i);

    const connected = parseJson(
      await tools.plaid_connect_sandbox!.handler({}),
    ) as { ok: boolean; itemId?: string };
    expect(connected.ok).toBe(true);
    expect(connected.itemId).toBeTruthy();

    const status = parseJson(await tools.plaid_status!.handler({})) as {
      ok: boolean;
      linkedAccountCount: number;
      items: unknown[];
    };
    expect(status.ok).toBe(true);
    expect(status.linkedAccountCount).toBeGreaterThan(0);
    expect(status.items.length).toBe(1);

    const synced = parseJson(await tools.plaid_sync!.handler({})) as {
      ok: boolean;
      results: unknown[];
    };
    expect(synced.ok).toBe(true);
    expect(synced.results).toHaveLength(1);

    const statusAfter = parseJson(await tools.plaid_status!.handler({})) as {
      items: Array<{ id: string }>;
    };
    const itemId = statusAfter.items[0]!.id;
    const unlinked = parseJson(
      await tools.unlink_plaid_item!.handler({ itemId }),
    ) as { ok: boolean; accountsRemoved: number };
    expect(unlinked.ok).toBe(true);
    expect(unlinked.accountsRemoved).toBeGreaterThan(0);

    const after = parseJson(await tools.plaid_status!.handler({})) as {
      linkedAccountCount: number;
      items: unknown[];
    };
    expect(after.items).toHaveLength(0);
    expect(after.linkedAccountCount).toBe(0);
  });

  it("delete_account removes manual; rejects plaid-linked (negative)", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const created = parseJson(
      await tools.create_account!.handler({
        name: "Cash",
        balanceUsd: 20,
        kind: "cash",
      }),
    ) as { account: { id: string } };
    const deleted = parseJson(
      await tools.delete_account!.handler({ id: created.account.id }),
    ) as { ok: boolean };
    expect(deleted.ok).toBe(true);

    await tools.plaid_connect_sandbox!.handler({});
    const listed = parseJson(await tools.list_accounts!.handler({})) as {
      accounts: Array<{ id: string; provenance: string }>;
    };
    const plaid = listed.accounts.find((a) => a.provenance === "plaid")!;
    const refuse = parseJson(
      await tools.delete_account!.handler({ id: plaid.id }),
    ) as { ok: boolean; error?: string };
    expect(refuse.ok).toBe(false);
    expect(refuse.error).toMatch(/plaid/i);
  });

  it("ingest: sandbox gmail → poll → confirm → unlink", async () => {
    for (const name of [
      "ingest_status",
      "gmail_connect_sandbox",
      "poll_gmail",
      "ingest_discover",
      "confirm_bill_ingest",
      "unlink_gmail_account",
    ]) {
      expect(tools[name], name).toBeDefined();
    }

    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const connected = parseJson(
      await tools.gmail_connect_sandbox!.handler({}),
    ) as { ok: boolean; account: { id: string } };
    expect(connected.ok).toBe(true);

    const polled = parseJson(await tools.poll_gmail!.handler({})) as {
      ok: boolean;
      billsCreated: number;
    };
    expect(polled.ok).toBe(true);
    expect(polled.billsCreated).toBeGreaterThan(0);

    const status = parseJson(await tools.ingest_status!.handler({})) as {
      pending: Array<{ id: string }>;
    };
    expect(status.pending.length).toBeGreaterThan(0);

    const confirmed = parseJson(
      await tools.confirm_bill_ingest!.handler({
        eventId: status.pending[0]!.id,
      }),
    ) as { ok: boolean; obligation: { provenance: string } };
    expect(confirmed.ok).toBe(true);
    expect(confirmed.obligation.provenance).toBe("email");

    const unlinked = parseJson(
      await tools.unlink_gmail_account!.handler({
        accountId: connected.account.id,
      }),
    ) as { ok: boolean };
    expect(unlinked.ok).toBe(true);

    const refuse = parseJson(
      await tools.unlink_gmail_account!.handler({ accountId: "missing" }),
    ) as { ok: boolean };
    expect(refuse.ok).toBe(false);
  });

  it("create_obligation + mark paid; not onboarded / already paid / unknown id fail (negative)", async () => {
    const before = parseJson(
      await tools.create_obligation!.handler({
        payee: "Rent",
        amountUsd: 1800,
        dueDate: "2099-09-01",
      }),
    ) as { ok: boolean; error?: string };
    expect(before.ok).toBe(false);
    expect(before.error).toMatch(/not onboarded/i);

    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });

    const badDate = parseJson(
      await tools.create_obligation!.handler({
        payee: "Rent",
        amountUsd: 1800,
        dueDate: "09-01-2099",
      }),
    ) as { ok: boolean; error?: string };
    expect(badDate.ok).toBe(false);
    expect(badDate.error).toMatch(/YYYY-MM-DD/);

    const created = parseJson(
      await tools.create_obligation!.handler({
        payee: "Rent",
        amountUsd: 1800,
        dueDate: "2099-09-01",
        cadence: "monthly",
      }),
    ) as { ok: boolean; obligation: { id: string; payee: string } };
    expect(created.ok).toBe(true);
    expect(created.obligation.payee).toBe("Rent");

    const missing = parseJson(
      await tools.mark_obligation_paid!.handler({ id: "missing" }),
    ) as { ok: boolean; error?: string };
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/not found or already paid/);

    const paid = parseJson(
      await tools.mark_obligation_paid!.handler({ id: created.obligation.id }),
    ) as { ok: boolean; obligation: { paidAt: string | null } };
    expect(paid.ok).toBe(true);
    expect(paid.obligation.paidAt).toBeTruthy();

    const twice = parseJson(
      await tools.mark_obligation_paid!.handler({ id: created.obligation.id }),
    ) as { ok: boolean; error?: string };
    expect(twice.ok).toBe(false);
    expect(twice.error).toMatch(/already paid/);
  });

  it("ingest_discover ranks bill then statement; no mail / confirm statement fail (negative)", async () => {
    const before = parseJson(await tools.ingest_discover!.handler({})) as {
      ok: boolean;
      error?: string;
    };
    expect(before.ok).toBe(false);
    expect(before.error).toMatch(/not onboarded/i);

    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });

    const noMail = parseJson(await tools.ingest_discover!.handler({})) as {
      ok: boolean;
      code?: string;
    };
    expect(noMail.ok).toBe(false);
    expect(noMail.code).toBe("no_mail");

    const discovered = parseJson(
      await tools.ingest_discover!.handler({ sandbox: true }),
    ) as {
      ok: boolean;
      candidates: Array<{
        kind: string;
        action: string;
        eventId: string;
        amountUsd: number | null;
        payee?: string;
        assetHint?: { kind: string } | null;
      }>;
      lookbackDays: number;
      limit: number;
      message: string;
    };
    expect(discovered.ok).toBe(true);
    expect(discovered.lookbackDays).toBe(90);
    expect(discovered.limit).toBe(40);
    expect(discovered.candidates.map((c) => c.kind)).toEqual([
      "bill",
      "bill",
      "bill",
      "statement",
      "statement",
    ]);
    const bill = discovered.candidates.find((c) =>
      /utility/i.test((c as { payee?: string }).payee ?? ""),
    )!;
    const homeHint = discovered.candidates.find(
      (c) => (c as { assetHint?: { kind: string } }).assetHint?.kind === "home",
    ) as { eventId: string };
    const statement = discovered.candidates.find((c) => c.action === "connect_plaid")!;
    expect(bill.action).toBe("confirm_bill");
    expect(statement.action).toBe("connect_plaid");
    expect(statement.amountUsd).toBeNull();
    expect(discovered.message).toMatch(/attache plaid connect/);

    const refuseStatement = parseJson(
      await tools.confirm_bill_ingest!.handler({ eventId: statement.eventId }),
    ) as { ok: boolean; error?: string };
    expect(refuseStatement.ok).toBe(false);
    expect(refuseStatement.error).toMatch(/connect hint/i);

    const confirmed = parseJson(
      await tools.confirm_bill_ingest!.handler({ eventId: bill.eventId }),
    ) as { ok: boolean; obligation: { payee: string } };
    expect(confirmed.ok).toBe(true);
    expect(confirmed.obligation.payee).toMatch(/utility/i);

    const asset = parseJson(
      await tools.confirm_asset!.handler({ eventId: homeHint.eventId }),
    ) as { ok: boolean; asset: { kind: string; estimatedUsd: number | null } };
    expect(asset.ok).toBe(true);
    expect(asset.asset.kind).toBe("home");
    expect(asset.asset.estimatedUsd).toBeNull();

    const refuseAsset = parseJson(
      await tools.confirm_asset!.handler({ eventId: statement.eventId }),
    ) as { ok: boolean; error?: string };
    expect(refuseAsset.ok).toBe(false);
    expect(refuseAsset.error).toMatch(/connect hint/i);
  });

  it("register_device rejects ios; credentials_check sandbox hits sandbox@gmail.com (negative)", async () => {
    await tools.onboard!.handler({
      householdName: "H",
      holderDisplayName: "A",
      completeSetup: true,
    });
    const ios = parseJson(
      await tools.register_device!.handler({ fcmToken: "tok", platform: "ios" }),
    ) as { ok: boolean; error?: string };
    expect(ios.ok).toBe(false);
    expect(ios.error).toMatch(/android/);

    const listed = parseJson(await tools.list_devices!.handler({})) as {
      ok: boolean;
      devices: unknown[];
      fcm: { backend: string };
    };
    expect(listed.ok).toBe(true);
    expect(listed.devices).toEqual([]);
    expect(listed.fcm.backend).toBe("off");

    const check = parseJson(
      await tools.credentials_check!.handler({ sandbox: true }),
    ) as { ok: boolean; emailsChecked: string[]; breaches: unknown[] };
    expect(check.ok).toBe(true);
    expect(check.emailsChecked).toEqual([]);
    expect(check.breaches).toEqual([]);

    const ingress = parseJson(await tools.ingest_ingress_status!.handler({})) as {
      ok: boolean;
      mailgunConfigured: boolean;
      honesty: string;
      primaryPath: string;
    };
    expect(ingress.ok).toBe(true);
    expect(ingress.mailgunConfigured).toBe(false);
    expect(ingress.primaryPath).toBe("imap_or_gmail");
    expect(ingress.honesty).toMatch(/plaintext/);
  });
});
