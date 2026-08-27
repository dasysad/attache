import { beforeEach, describe, expect, it } from "vitest";
import {
  accountsPage,
  activityPage,
  appHomePage,
  cashflowPage,
  connectionsPage,
  connectHintsPanel,
  layout,
  netWorthPage,
  onboardAccountPage,
  onboardConnectPage,
  onboardDiscoverPage,
  onboardPage,
  setupPage,
  setNavCurrentPath,
} from "./views.js";
import type { CashflowReport, CashflowTrend, DiscoverCandidate, FundingAccount, SolvencyForecast } from "@attache/core";
import { computeNetWorth } from "@attache/core";

const emptyForecast: SolvencyForecast = {
  liquidBalanceUsd: 0,
  runwayDays: 30,
  horizonDays: 30,
  dueIn7dUsd: 0,
  overdueUsd: 0,
  plannedIncomeUsd: 0,
  hasIncomeStreams: false,
  series: [],
  upcoming: [],
};

function account(partial: Partial<FundingAccount> & { name: string }): FundingAccount {
  return {
    id: partial.id ?? "a1",
    tenantId: "t",
    name: partial.name,
    institution: partial.institution ?? null,
    mask: partial.mask ?? null,
    kind: partial.kind ?? "checking",
    balanceUsd: partial.balanceUsd ?? 0,
    provenance: partial.provenance ?? "native",
    syncStatus: partial.syncStatus ?? "manual",
    plaidAccountId: partial.plaidAccountId ?? null,
    plaidItemId: partial.plaidItemId ?? null,
    snaptradeAccountId: partial.snaptradeAccountId ?? null,
    snaptradeConnectionId: partial.snaptradeConnectionId ?? null,
    lastSyncedAt: partial.lastSyncedAt ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("layout IA (ADR-014)", () => {
  beforeEach(() => setNavCurrentPath("/"));
  it("keeps daily views in primary nav and connections in Connect", () => {
    setNavCurrentPath("/");
    const html = layout("Home", "<p>x</p>");
    expect(html).toContain(">Home<");
    expect(html).toContain(">Accounts<");
    expect(html).toContain(">Bills<");
    expect(html).toContain(">Activity<");
    expect(html).toContain(">Transfers<");
    expect(html).toContain(">Alerts<");
    expect(html).toContain("<summary>Connect</summary>");
    expect(html).toContain("<summary>More</summary>");
    expect(html).toContain("/app/setup");
    expect(html).toContain("/app/people");
    expect(html).toContain("/app/income");
    expect(html).toContain("/app/net-worth");
    expect(html).toContain("/app/cashflow");
    expect(html).not.toMatch(/<nav>[\s\S]*href="\/app\/plaid">Plaid</);
  });

  it("marks the current path active", () => {
    setNavCurrentPath("/app/accounts");
    const html = layout("Accounts", "<p>x</p>");
    expect(html).toMatch(/href="\/app\/accounts" class="active"/);
    expect(html).not.toMatch(/href="\/" class="active"/);
  });

  it("opens Connect when on a connection page", () => {
    setNavCurrentPath("/app/plaid");
    const html = layout("Plaid", "<p>x</p>");
    expect(html).toMatch(/<details class="nav-more" open>\s*<summary>Connect<\/summary>/);
  });
});

describe("appHomePage", () => {
  beforeEach(() => setNavCurrentPath("/"));
  it("omits the attention strip when healthy (negative)", () => {
    const html = appHomePage("Smith", "site-id-xxx", emptyForecast, [], [], []);
    expect(html).not.toContain("attention-strip");
    expect(html).toContain("No accounts yet");
    expect(html).toContain("No upcoming bills");
    expect(html).toContain('label="Planned income"');
    expect(html).toContain("Add payroll on Income");
  });

  it("shows planned income amount when streams exist", () => {
    const html = appHomePage(
      "Smith",
      "site-id-xxx",
      {
        ...emptyForecast,
        liquidBalanceUsd: 100,
        plannedIncomeUsd: 5000,
        hasIncomeStreams: true,
      },
      [account({ id: "c", name: "Checking", kind: "checking", balanceUsd: 100 })],
      [],
      [],
    );
    expect(html).toContain('label="Planned income"');
    expect(html).toContain("$5,000.00");
    expect(html).toContain("30d income streams");
    expect(html).not.toContain("Add payroll on Income");
  });

  it("renders attention items and groups brokerage separately", () => {
    const html = appHomePage(
      "Smith",
      "site-id-xxx",
      { ...emptyForecast, liquidBalanceUsd: 100 },
      [
        account({ id: "c", name: "Checking", kind: "checking", balanceUsd: 100 }),
        account({ id: "b", name: "Brokerage", kind: "brokerage", balanceUsd: 500 }),
      ],
      [],
      [],
      [
        {
          id: "hitl",
          severity: "action",
          title: "Transfers need approval",
          body: "1 proposal waiting",
          href: "/app/transfers",
          cliHint: "attache transfer list --pending",
        },
      ],
    );
    expect(html).toContain("attention-strip");
    expect(html).toContain("Transfers need approval");
    expect(html).toContain("Checking");
    expect(html).toContain("Brokerage");
    expect(html).toContain('label="Brokerage"');
    expect(html).toContain('label="Net worth"');
    expect(html).toContain("manual accounts still work");
  });
});

describe("accountsPage", () => {
  beforeEach(() => setNavCurrentPath("/app/accounts"));
  it("groups by kind and excludes brokerage from liquid", () => {
    const html = accountsPage([
      account({ id: "c", name: "Checking", kind: "checking", balanceUsd: 100 }),
      account({ id: "b", name: "IRA", kind: "brokerage", balanceUsd: 900 }),
    ]);
    expect(html).toContain("Checking · $100.00");
    expect(html).toContain("Brokerage · $900.00");
    expect(html).toContain("Liquid (runway)");
    expect(html).toContain("$100.00");
    expect(html).toContain("excluded");
  });

  it("lists credit/loan kinds and owed total", () => {
    const html = accountsPage([
      account({ id: "v", name: "Visa", kind: "credit", balanceUsd: 250 }),
    ]);
    expect(html).toContain("Credit cards · $250.00");
    expect(html).toContain("Owed:");
    expect(html).toContain('option value="credit"');
    expect(html).toContain('option value="loan"');
  });

  it("does not invent groups when empty (negative)", () => {
    const html = accountsPage([]);
    expect(html).not.toContain("Checking ·");
    expect(html).toContain("No accounts yet");
  });
});

describe("activityPage + connectionsPage", () => {
  beforeEach(() => setNavCurrentPath("/app/activity"));
  it("activity empty state does not require a bank link", () => {
    const html = activityPage([]);
    expect(html).toContain("manual accounts");
    expect(html).not.toContain("att-transaction-row");
    expect(html).toContain("filter-bar");
  });

  it("activity filtered empty copy when filters are set (negative)", () => {
    const html = activityPage([], [], {
      accountId: "missing",
      pending: "pending",
      fromDate: "2026-01-01",
    });
    expect(html).toContain("No transactions match these filters");
    expect(html).not.toContain("Connect a bank");
  });

  it("connections hub links the three tools", () => {
    const html = connectionsPage({
      plaidItems: 0,
      snaptradeConnections: 0,
      gmailAccounts: 0,
      imapAccounts: 0,
      attention: [],
    });
    expect(html).toContain("/app/plaid");
    expect(html).toContain("/app/snaptrade");
    expect(html).toContain("/app/ingest");
    expect(html).not.toContain("attention-strip");
    expect(html).not.toContain("Mail saw");
  });

  it("surfaces statement connect hints with an explicit Link click (negative: empty has none)", () => {
    const hints: DiscoverCandidate[] = [
      {
        eventId: "e1",
        kind: "statement",
        payee: "Chase",
        amountUsd: null,
        dueDate: null,
        institutionHint: "Chase",
        rail: "plaid",
        confidence: 0.8,
        action: "connect_plaid",
        source: "email",
        assetHint: null,
        assetConfirmed: false,
      },
    ];
    const html = connectionsPage({
      plaidItems: 0,
      snaptradeConnections: 0,
      gmailAccounts: 1,
      imapAccounts: 0,
      attention: [],
      connectHints: hints,
      livePlaid: true,
    });
    expect(html).toContain("Gmail saw a Chase statement");
    expect(html).toContain("Not a bank until you Link");
    expect(html).toContain("/app/plaid/connect");
    expect(html).toContain("/app/plaid/connect-sandbox");
    expect(html).toContain("attache plaid connect");
    expect(html).not.toContain("funding_account");

    const emptyPanel = connectHintsPanel([], {
      livePlaid: true,
      liveSnaptrade: false,
      heading: "Mail saw these institutions",
    });
    expect(emptyPanel).toBe("");
  });
});

describe("netWorthPage + cashflowPage", () => {
  it("does not invent a chart when there are no accounts (negative)", () => {
    setNavCurrentPath("/app/net-worth");
    const html = netWorthPage(computeNetWorth([]), 0);
    expect(html).toContain("No accounts yet");
    expect(html).toContain("Equals assets");
    expect(html).toContain("Home/vehicle");
    expect(html).not.toContain("Sankey");
  });

  it("omits unvalued household assets from the total (negative)", () => {
    setNavCurrentPath("/app/net-worth");
    const html = netWorthPage(
      computeNetWorth([], [{ estimatedUsd: null }]),
      0,
      [
        {
          id: "h1",
          tenantId: "t",
          kind: "home",
          label: "123 Main",
          notes: null,
          estimatedUsd: null,
          ingestedEventId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    );
    expect(html).toContain("123 Main");
    expect(html).toContain("unvalued");
    expect(html).toContain("do not invent a value");
  });

  it("shows negative net worth when only liabilities exist", () => {
    setNavCurrentPath("/app/net-worth");
    const html = netWorthPage(
      computeNetWorth([{ balanceUsd: 400, kind: "credit" }]),
      1,
    );
    expect(html).toContain("$-400.00");
    expect(html).toContain("Assets − liabilities");
  });

  it("cashflow empty state is honest, not a hollow Sankey (negative)", () => {
    setNavCurrentPath("/app/cashflow");
    const empty: CashflowReport = {
      fromDate: "2026-07-17",
      toDate: "2026-08-15",
      inflowUsd: 0,
      outflowUsd: 0,
      netUsd: 0,
      uncategorizedCount: 0,
      buckets: [],
      plannedIncomeUsd: 0,
      plannedObligationsUsd: 0,
    };
    const html = cashflowPage(empty);
    expect(html).toContain("do not invent a Sankey");
    expect(html).toContain("att-cashflow-bar");
    expect(html).toContain("attache cashflow");
  });

  it("trend empty windows do not draw a sparkline (negative)", () => {
    setNavCurrentPath("/app/cashflow");
    const empty: CashflowReport = {
      fromDate: "2026-08-01",
      toDate: "2026-08-10",
      inflowUsd: 0,
      outflowUsd: 0,
      netUsd: 0,
      uncategorizedCount: 0,
      buckets: [],
      plannedIncomeUsd: 0,
      plannedObligationsUsd: 0,
    };
    const trend: CashflowTrend = {
      current: empty,
      prior: { ...empty, fromDate: "2026-07-22", toDate: "2026-07-31" },
      outflowDeltaUsd: 0,
      inflowDeltaUsd: 0,
      netDeltaUsd: 0,
      series: [],
      categories: [],
    };
    const html = cashflowPage(empty, undefined, trend);
    expect(html).toContain("att-cashflow-trend");
    expect(html).toContain("No posted spend in this window to chart");
    expect(html).toContain("No category deltas");
    expect(html).toContain("attache cashflow trend");
    expect(html).not.toContain("delta-table");
  });
});

describe("onboard wizard (ADR-015 P3)", () => {
  beforeEach(() => setNavCurrentPath("/onboard"));

  it("household step is 1 of 5 and names Find mail", () => {
    const html = onboardPage();
    expect(html).toContain('current="1"');
    expect(html).toContain('total="5"');
    expect(html).toContain("Find mail");
    expect(html).not.toContain('total="3"');
  });

  it("discover GET lists bills to confirm and skip; does not invent a poll (negative)", () => {
    const bill: DiscoverCandidate = {
      eventId: "evt_bill",
      kind: "bill",
      payee: "PG&E",
      amountUsd: 142,
      dueDate: "2026-09-01",
      institutionHint: null,
      rail: null,
      confidence: 0.9,
      action: "confirm_bill",
      source: "email",
      assetHint: { kind: "home", label: "PG&E" },
      assetConfirmed: false,
    };
    const statement: DiscoverCandidate = {
      eventId: "evt_stmt",
      kind: "statement",
      payee: "Chase",
      amountUsd: null,
      dueDate: null,
      institutionHint: "Chase",
      rail: "plaid",
      confidence: 0.8,
      action: "connect_plaid",
      source: "email",
      assetHint: null,
      assetConfirmed: false,
    };
    const html = onboardDiscoverPage({
      candidates: [bill, statement],
      mailConnected: false,
      gmailOAuth: false,
    });
    expect(html).toContain("Find bills in Gmail");
    expect(html).toContain("Never required");
    expect(html).toContain("/onboard/discover/skip");
    expect(html).toContain("/onboard/discover/confirm/evt_bill");
    expect(html).toContain("PG&amp;E");
    expect(html).toContain("attache ingest discover-sandbox");
    expect(html).not.toContain("/onboard/discover/confirm/evt_stmt");
    expect(html).toContain("/onboard/discover/asset/evt_bill");
    expect(html).toContain("Confirm as home");
    expect(html).not.toContain("method=\"get\" action=\"/onboard/discover/run\"");
    expect(html).not.toContain("funding_account");
  });

  it("empty discover still offers skip — Gmail is not a gate (negative)", () => {
    const html = onboardDiscoverPage({
      candidates: [],
      mailConnected: false,
      gmailOAuth: false,
    });
    expect(html).toContain("Skip for now");
    expect(html).toContain("No bills in the queue yet");
    expect(html).not.toContain("Confirm bill");
    expect(html).not.toContain("Gmail saw");
  });

  it("connect step reuses hint cards; Link stays a click (negative: skip present)", () => {
    const hints: DiscoverCandidate[] = [
      {
        eventId: "e1",
        kind: "statement",
        payee: "Chase",
        amountUsd: null,
        dueDate: null,
        institutionHint: "Chase",
        rail: "plaid",
        confidence: 0.8,
        action: "connect_plaid",
        source: "email",
        assetHint: null,
        assetConfirmed: false,
      },
    ];
    const html = onboardConnectPage({
      hints,
      livePlaid: true,
      liveSnaptrade: false,
    });
    expect(html).toContain("Gmail saw a Chase statement");
    expect(html).toContain("/app/plaid/connect");
    expect(html).toContain("/onboard/connect/skip");
    expect(html).not.toContain("funding_account");
  });

  it("account step still allows a manual balance without Plaid (negative)", () => {
    const html = onboardAccountPage();
    expect(html).toContain("no bank link required");
    expect(html).toContain("Or connect a bank (optional)");
    expect(html).toContain('current="4"');
  });
});

describe("setupPage hub", () => {
  it("lists accelerators while setup is open", () => {
    const html = setupPage({
      onboarded: true,
      setupComplete: false,
      items: [],
      gaps: [],
      message: "2 optional gap(s)",
    });
    expect(html).toContain("/onboard/discover");
    expect(html).toContain("/onboard/connect");
    expect(html).toContain("/onboard/account");
    expect(html).toContain("/onboard/obligation");
    expect(html).toContain("Mark setup complete");
  });

  it("hides accelerators after setup complete (negative)", () => {
    const html = setupPage({
      onboarded: true,
      setupComplete: true,
      items: [],
      gaps: [],
      message: "done",
    });
    expect(html).not.toContain("setup-accelerators");
    expect(html).not.toContain("Mark setup complete");
  });
});
