/**
 * Evaluate transfer rules (ADR-017 P0).
 *
 * What: for each enabled rule, decide skip / propose / auto-approve.
 * Why: local cron or agents call this; Starflow (BL-13) will only shell it.
 * How: period idempotency + caps → createTransferProposal → optional approve.
 * Honesty: auto still uses approveTransferProposal (ACH/ledger/consent).
 *
 * Period slot: only persisted outcomes consume UNIQUE(rule, YYYY-MM).
 * "Trigger not matched" does **not** write a run — so a low balance today
 * does not burn the monthly fire.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getAccount, listAccounts, sumLiquidBalanceUsd } from "../account.js";
import { computeSolvencyForecast } from "../forecast.js";
import { listIncomeStreams } from "../income-stream.js";
import { listObligations } from "../obligation.js";
import { isOnboarded } from "../tenant.js";
import {
  approveTransferProposal,
  createTransferProposal,
} from "./transfer-queue.js";
import {
  evaluateWhenCel,
  TransferRuleCelError,
} from "./transfer-rule-cel.js";
import type { TransferRule, TransferRuleRun } from "./transfer-rule-types.js";
import {
  getTransferRuleRunForPeriod,
  insertTransferRuleRun,
  listTransferRules,
  sumTransferRuleRunAmountsForPeriod,
  transferRuleIdempotencyKey,
  transferRulePeriodKey,
} from "./transfer-rule-store.js";

export interface EvaluateTransferRulesOptions {
  /** Override clock for tests (UTC month key). */
  now?: Date;
  /** Evaluate a single rule id (still respects enabled + caps). */
  ruleId?: string;
}

export interface EvaluateTransferRulesResult {
  periodKey: string;
  evaluated: number;
  runs: TransferRuleRun[];
  message: string;
}

function triggerMatches(db: Database.Database, rule: TransferRule): boolean {
  if (rule.trigger.kind === "always") return true;
  const account = getAccount(db, rule.trigger.accountId);
  if (!account) return false;
  return account.balanceUsd >= rule.trigger.thresholdUsd;
}

function ephemeralSkip(
  rule: TransferRule,
  periodKey: string,
  message: string,
): TransferRuleRun {
  return {
    id: randomUUID(),
    tenantId: rule.tenantId,
    ruleId: rule.id,
    periodKey,
    idempotencyKey: transferRuleIdempotencyKey(rule.id, periodKey),
    outcome: "skipped",
    proposalId: null,
    amountUsd: null,
    message,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Run all (or one) enabled rules once for the current calendar month period.
 */
export async function evaluateTransferRules(
  db: Database.Database,
  options: EvaluateTransferRulesOptions = {},
): Promise<EvaluateTransferRulesResult> {
  if (!isOnboarded(db)) throw new Error("not onboarded");

  const now = options.now ?? new Date();
  const periodKey = transferRulePeriodKey(now);
  const rules = listTransferRules(db, { enabledOnly: true }).filter((r) =>
    options.ruleId ? r.id === options.ruleId : true,
  );

  const runs: TransferRuleRun[] = [];
  for (const rule of rules) {
    runs.push(await evaluateOneRule(db, rule, periodKey));
  }

  const proposed = runs.filter((r) =>
    ["proposed", "executed", "approved", "ach_pending"].includes(r.outcome),
  ).length;
  const skipped = runs.filter((r) => r.outcome === "skipped").length;
  const blocked = runs.filter((r) => r.outcome === "blocked").length;

  return {
    periodKey,
    evaluated: rules.length,
    runs,
    message: `Evaluated ${rules.length} rule(s) for ${periodKey}: ${proposed} fired, ${skipped} skipped, ${blocked} blocked.`,
  };
}

async function evaluateOneRule(
  db: Database.Database,
  rule: TransferRule,
  periodKey: string,
): Promise<TransferRuleRun> {
  const idempotencyKey = transferRuleIdempotencyKey(rule.id, periodKey);

  const existing = getTransferRuleRunForPeriod(db, rule.id, periodKey);
  if (existing) {
    return {
      ...existing,
      message:
        existing.message ??
        `Already fired this period (${existing.outcome})`,
    };
  }

  if (!triggerMatches(db, rule)) {
    return ephemeralSkip(rule, periodKey, "Trigger not matched");
  }

  if (rule.policy.whenCel) {
    try {
      const snapshot = buildCelSnapshot(db, rule);
      if (!evaluateWhenCel(rule.policy.whenCel, snapshot)) {
        return ephemeralSkip(rule, periodKey, "CEL when guard false");
      }
    } catch (e) {
      const msg =
        e instanceof TransferRuleCelError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      return insertTransferRuleRun(db, {
        ruleId: rule.id,
        periodKey,
        idempotencyKey,
        outcome: "blocked",
        amountUsd: rule.action.amountUsd,
        message: `CEL when error: ${msg}`,
      });
    }
  }

  const amount = rule.action.amountUsd;
  if (amount > rule.policy.maxPerRunUsd) {
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome: "blocked",
      amountUsd: amount,
      message: `Amount $${amount} exceeds maxPerRunUsd $${rule.policy.maxPerRunUsd}`,
    });
  }

  const spent = sumTransferRuleRunAmountsForPeriod(db, rule.id, periodKey);
  if (spent + amount > rule.policy.maxPerMonthUsd) {
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome: "blocked",
      amountUsd: amount,
      message: `Would exceed maxPerMonthUsd $${rule.policy.maxPerMonthUsd} (spent $${spent})`,
    });
  }

  let proposal;
  try {
    proposal = createTransferProposal(db, {
      fromAccountId: rule.action.fromAccountId,
      toAccountId: rule.action.toAccountId,
      amountUsd: amount,
      memo: `rule:${rule.id} ${rule.name}`,
      proposedBy: "agent",
    });
  } catch (e) {
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome: "failed",
      amountUsd: amount,
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (!proposal.allowed) {
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome: "blocked",
      proposalId: proposal.id,
      amountUsd: amount,
      message: proposal.simulation.blockers.join("; ") || "Dry-run blockers",
    });
  }

  if (rule.policy.autonomy === "proposal") {
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome: "proposed",
      proposalId: proposal.id,
      amountUsd: amount,
      message: `Pending HITL proposal ${proposal.id}`,
    });
  }

  try {
    const approved = await approveTransferProposal(
      db,
      proposal.id,
      `auto rule:${rule.id}`,
    );
    const outcome =
      approved.status === "executed"
        ? "executed"
        : approved.status === "ach_pending"
          ? "ach_pending"
          : "approved";
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome,
      proposalId: proposal.id,
      amountUsd: amount,
      message: `Auto-approved → ${approved.status}`,
    });
  } catch (e) {
    return insertTransferRuleRun(db, {
      ruleId: rule.id,
      periodKey,
      idempotencyKey,
      outcome: "failed",
      proposalId: proposal.id,
      amountUsd: amount,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Snapshot for CEL when guards — no I/O beyond SQLite household state.
 * Why: agents write expressions against solvency-ish numbers, not raw SQL.
 */
function buildCelSnapshot(
  db: Database.Database,
  rule: TransferRule,
): import("./transfer-rule-cel.js").TransferRuleCelSnapshot {
  const accounts = listAccounts(db);
  const obligations = listObligations(db).filter((o) => !o.paidAt);
  const forecast = computeSolvencyForecast(accounts, obligations, 30, listIncomeStreams(db));
  const from = getAccount(db, rule.action.fromAccountId);
  const to = getAccount(db, rule.action.toAccountId);
  return {
    liquidBalanceUsd: sumLiquidBalanceUsd(accounts),
    runwayDays: forecast.runwayDays,
    dueIn7dUsd: forecast.dueIn7dUsd,
    fromBalanceUsd: from?.balanceUsd ?? 0,
    toBalanceUsd: to?.balanceUsd ?? 0,
    amountUsd: rule.action.amountUsd,
  };
}
