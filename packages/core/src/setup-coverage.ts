/**
 * Setup coverage checklist (UI P4+ / ADR-014).
 *
 * What: skippable household gaps after onboard — accounts, bills, people,
 *       income, assets, connect rails. Not a Mint-style gate.
 * Why: automation UI waits until basics exist; attention must name leftovers.
 * How: pure projection over existing lists + income/members.
 */
import type Database from "better-sqlite3";
import { listAccounts } from "./account.js";
import { listGmailAccounts } from "./gmail/store.js";
import { listHouseholdAssets } from "./household-asset.js";
import { listHouseholdEntities } from "./household-entity.js";
import { listIncomeStreams } from "./income-stream.js";
import { listImapAccounts } from "./imap/store.js";
import { listMembers } from "./member.js";
import { listObligations } from "./obligation.js";
import { listPlaidItems } from "./plaid/store.js";
import { isSetupComplete } from "./setup.js";
import { listSnapTradeConnections } from "./snaptrade/store.js";
import { isOnboarded } from "./tenant.js";

export type SetupCoverageId =
  | "people"
  | "accounts"
  | "bills"
  | "income"
  | "assets"
  | "entities"
  | "connect_bank"
  | "connect_mail";

export interface SetupCoverageItem {
  id: SetupCoverageId;
  title: string;
  body: string;
  satisfied: boolean;
  required: boolean;
  href: string;
  cliHint: string;
}

export interface SetupCoverage {
  onboarded: boolean;
  setupComplete: boolean;
  items: SetupCoverageItem[];
  gaps: SetupCoverageItem[];
  message: string;
}

export function getSetupCoverage(db: Database.Database): SetupCoverage {
  const onboarded = isOnboarded(db);
  if (!onboarded) {
    return {
      onboarded: false,
      setupComplete: false,
      items: [],
      gaps: [],
      message: "Not onboarded — run attache onboard --household … --holder …",
    };
  }

  const members = listMembers(db);
  const accounts = listAccounts(db);
  const obligations = listObligations(db);
  const unpaid = obligations.filter((o) => !o.paidAt);
  const income = listIncomeStreams(db);
  const assets = listHouseholdAssets(db);
  const entities = listHouseholdEntities(db);
  const hasBank =
    listPlaidItems(db).length > 0 || listSnapTradeConnections(db).length > 0;
  const hasMail =
    listGmailAccounts(db).length > 0 || listImapAccounts(db).length > 0;

  const items: SetupCoverageItem[] = [
    {
      id: "people",
      title: "People",
      body:
        members.length <= 1
          ? "Account holder on file — add partner/dependents when ready."
          : `${members.length} household members.`,
      satisfied: members.length >= 1,
      required: true,
      href: "/app/people",
      cliHint: "attache members list",
    },
    {
      id: "accounts",
      title: "Money accounts",
      body:
        accounts.length === 0
          ? "No funding accounts — add manual or Link a bank."
          : `${accounts.length} account(s) on My Accounts.`,
      satisfied: accounts.length > 0,
      required: false,
      href: "/app/accounts",
      cliHint: "attache accounts create --name Checking --balance 2500",
    },
    {
      id: "bills",
      title: "Bills",
      body:
        unpaid.length === 0
          ? "No unpaid obligations — create Rent or confirm mail."
          : `${unpaid.length} unpaid bill(s).`,
      satisfied: unpaid.length > 0,
      required: false,
      href: "/app/obligations",
      cliHint:
        "attache obligations create --payee Rent --amount 1800 --due YYYY-MM-DD",
    },
    {
      id: "income",
      title: "Income streams",
      body:
        income.length === 0
          ? "No recurring income — runway treats outflow only until you add payroll."
          : `${income.length} income stream(s).`,
      satisfied: income.length > 0,
      required: false,
      href: "/app/income",
      cliHint:
        "attache income create --label Payroll --amount 5000 --cadence monthly --next YYYY-MM-DD",
    },
    {
      id: "assets",
      title: "Home / vehicles",
      body:
        assets.length === 0
          ? "No household assets — optional for net worth."
          : `${assets.length} asset(s).`,
      satisfied: assets.length > 0,
      required: false,
      href: "/app/assets",
      cliHint: "attache assets create --kind home --label …",
    },
    {
      id: "entities",
      title: "Payees / institutions",
      body:
        entities.length === 0
          ? "Entities appear when you add bills or linked institutions."
          : `${entities.length} name(s) projected from bills/accounts.`,
      satisfied: entities.length > 0,
      required: false,
      href: "/app/entities",
      cliHint: "attache entities list",
    },
    {
      id: "connect_bank",
      title: "Bank / brokerage link",
      body: hasBank
        ? "Plaid or SnapTrade connected."
        : "Optional — manual accounts stay first-class.",
      satisfied: hasBank,
      required: false,
      href: "/app/connections",
      cliHint: "attache plaid connect-sandbox",
    },
    {
      id: "connect_mail",
      title: "Mail ingest",
      body: hasMail
        ? "Gmail or IMAP connected."
        : "Optional — discover bills later.",
      satisfied: hasMail,
      required: false,
      href: "/app/ingest",
      cliHint: "attache ingest gmail connect-sandbox",
    },
  ];

  const gaps = items.filter((i) => !i.satisfied && !i.required);
  const setupComplete = isSetupComplete(db);

  return {
    onboarded: true,
    setupComplete,
    items,
    gaps,
    message: setupComplete
      ? gaps.length === 0
        ? "Setup complete — household coverage looks full."
        : `Setup marked complete with ${gaps.length} optional gap(s).`
      : `${gaps.length} optional gap(s) — use accelerators below or visit any checklist link.`,
  };
}

export function listSetupGaps(db: Database.Database): SetupCoverageItem[] {
  return getSetupCoverage(db).gaps;
}
