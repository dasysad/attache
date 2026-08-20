/**
 * Transfer rule store (ADR-017).
 *
 * What: CRUD for typed policies + run history for monthly idempotency.
 * Why: SQLite is the local source of truth; Starflow only triggers evaluate later.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getAccount } from "../account.js";
import { getTenant, isOnboarded } from "../tenant.js";
import type {
  CreateTransferRuleInput,
  TransferRule,
  TransferRuleAction,
  TransferRuleAutonomy,
  TransferRulePolicy,
  TransferRuleRun,
  TransferRuleRunOutcome,
  TransferRuleTrigger,
} from "./transfer-rule-types.js";
import { assertValidWhenCel } from "./transfer-rule-cel.js";

interface RuleRow {
  id: string;
  tenant_id: string;
  name: string;
  enabled: number;
  trigger_json: string;
  action_json: string;
  policy_json: string;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  tenant_id: string;
  rule_id: string;
  period_key: string;
  idempotency_key: string;
  outcome: string;
  proposal_id: string | null;
  amount_usd: number | null;
  message: string | null;
  created_at: string;
}

function requireTenantId(db: Database.Database): string {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  return getTenant(db)!.id;
}

function mapRule(row: RuleRow): TransferRule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    enabled: row.enabled === 1,
    trigger: JSON.parse(row.trigger_json) as TransferRuleTrigger,
    action: JSON.parse(row.action_json) as TransferRuleAction,
    policy: JSON.parse(row.policy_json) as TransferRulePolicy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: RunRow): TransferRuleRun {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ruleId: row.rule_id,
    periodKey: row.period_key,
    idempotencyKey: row.idempotency_key,
    outcome: row.outcome as TransferRuleRunOutcome,
    proposalId: row.proposal_id,
    amountUsd: row.amount_usd,
    message: row.message,
    createdAt: row.created_at,
  };
}

function parseAutonomy(raw: string | undefined): TransferRuleAutonomy {
  if (!raw || raw === "proposal") return "proposal";
  if (raw === "auto") return "auto";
  throw new Error("autonomy must be proposal|auto");
}

/** Calendar month key for ADR-001 style idempotency (`rule:{id}:period:{YYYY-MM}`). */
export function transferRulePeriodKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function transferRuleIdempotencyKey(
  ruleId: string,
  periodKey: string,
): string {
  return `rule:${ruleId}:period:${periodKey}`;
}

/**
 * Create an enabled sweep rule.
 * How: validate accounts + amounts at the boundary so evaluate never sees junk.
 */
export function createTransferRule(
  db: Database.Database,
  input: CreateTransferRuleInput,
): TransferRule {
  const tenantId = requireTenantId(db);
  const name = input.name.trim();
  if (!name) throw new Error("rule name required");
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("amount must be positive");
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new Error("from and to account must differ");
  }
  const from = getAccount(db, input.fromAccountId);
  const to = getAccount(db, input.toAccountId);
  if (!from) throw new Error("from account not found");
  if (!to) throw new Error("to account not found");

  const maxPerRun = input.maxPerRunUsd ?? input.amountUsd;
  const maxPerMonth = input.maxPerMonthUsd ?? maxPerRun * 4;
  if (!Number.isFinite(maxPerRun) || maxPerRun <= 0) {
    throw new Error("maxPerRunUsd must be positive");
  }
  if (!Number.isFinite(maxPerMonth) || maxPerMonth <= 0) {
    throw new Error("maxPerMonthUsd must be positive");
  }
  if (input.amountUsd > maxPerRun) {
    throw new Error("amount exceeds maxPerRunUsd");
  }

  let trigger: TransferRuleTrigger;
  if (input.trigger) {
    trigger = input.trigger;
  } else if (input.thresholdUsd !== undefined) {
    if (!Number.isFinite(input.thresholdUsd) || input.thresholdUsd < 0) {
      throw new Error("thresholdUsd must be a non-negative number");
    }
    trigger = {
      kind: "balance_above",
      accountId: input.triggerAccountId ?? input.fromAccountId,
      thresholdUsd: input.thresholdUsd,
    };
    if (!getAccount(db, trigger.accountId)) {
      throw new Error("trigger account not found");
    }
  } else {
    trigger = { kind: "always" };
  }

  if (trigger.kind === "balance_above") {
    if (!Number.isFinite(trigger.thresholdUsd) || trigger.thresholdUsd < 0) {
      throw new Error("thresholdUsd must be a non-negative number");
    }
    if (!getAccount(db, trigger.accountId)) {
      throw new Error("trigger account not found");
    }
  }

  const action: TransferRuleAction = {
    kind: "sweep",
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amountUsd: input.amountUsd,
  };
  const policy: TransferRulePolicy = {
    maxPerRunUsd: maxPerRun,
    maxPerMonthUsd: maxPerMonth,
    autonomy: parseAutonomy(input.autonomy),
    whenCel: null,
  };
  if (input.whenCel !== undefined) {
    const expr = input.whenCel.trim();
    if (expr) {
      assertValidWhenCel(expr);
      policy.whenCel = expr;
    }
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO transfer_rule
      (id, tenant_id, name, enabled, trigger_json, action_json, policy_json, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    name,
    JSON.stringify(trigger),
    JSON.stringify(action),
    JSON.stringify(policy),
    now,
    now,
  );
  return getTransferRule(db, id)!;
}

export function getTransferRule(
  db: Database.Database,
  id: string,
): TransferRule | null {
  const tenantId = requireTenantId(db);
  const row = db
    .prepare(`SELECT * FROM transfer_rule WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as RuleRow | undefined;
  return row ? mapRule(row) : null;
}

export function listTransferRules(
  db: Database.Database,
  options: { enabledOnly?: boolean } = {},
): TransferRule[] {
  const tenantId = requireTenantId(db);
  const rows = options.enabledOnly
    ? (db
        .prepare(
          `SELECT * FROM transfer_rule WHERE tenant_id = ? AND enabled = 1
           ORDER BY created_at ASC`,
        )
        .all(tenantId) as RuleRow[])
    : (db
        .prepare(
          `SELECT * FROM transfer_rule WHERE tenant_id = ? ORDER BY created_at ASC`,
        )
        .all(tenantId) as RuleRow[]);
  return rows.map(mapRule);
}

export function disableTransferRule(
  db: Database.Database,
  id: string,
): TransferRule | null {
  requireTenantId(db);
  const existing = getTransferRule(db, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE transfer_rule SET enabled = 0, updated_at = ? WHERE id = ?`,
  ).run(now, id);
  return getTransferRule(db, id);
}

export function getTransferRuleRunForPeriod(
  db: Database.Database,
  ruleId: string,
  periodKey: string,
): TransferRuleRun | null {
  const row = db
    .prepare(
      `SELECT * FROM transfer_rule_run WHERE rule_id = ? AND period_key = ?`,
    )
    .get(ruleId, periodKey) as RunRow | undefined;
  return row ? mapRun(row) : null;
}

/** Sum of successful fire amounts in the period (proposed counts toward the month cap). */
export function sumTransferRuleRunAmountsForPeriod(
  db: Database.Database,
  ruleId: string,
  periodKey: string,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_usd), 0) AS s FROM transfer_rule_run
       WHERE rule_id = ? AND period_key = ?
         AND outcome IN ('proposed', 'executed', 'approved', 'ach_pending')`,
    )
    .get(ruleId, periodKey) as { s: number };
  return row.s;
}

export function insertTransferRuleRun(
  db: Database.Database,
  input: {
    ruleId: string;
    periodKey: string;
    idempotencyKey: string;
    outcome: TransferRuleRunOutcome;
    proposalId?: string | null;
    amountUsd?: number | null;
    message?: string | null;
  },
): TransferRuleRun {
  const tenantId = requireTenantId(db);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO transfer_rule_run
      (id, tenant_id, rule_id, period_key, idempotency_key, outcome,
       proposal_id, amount_usd, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.ruleId,
    input.periodKey,
    input.idempotencyKey,
    input.outcome,
    input.proposalId ?? null,
    input.amountUsd ?? null,
    input.message ?? null,
    now,
  );
  const row = db
    .prepare(`SELECT * FROM transfer_rule_run WHERE id = ?`)
    .get(id) as RunRow;
  return mapRun(row);
}

export function listTransferRuleRuns(
  db: Database.Database,
  ruleId?: string,
): TransferRuleRun[] {
  const tenantId = requireTenantId(db);
  const rows = ruleId
    ? (db
        .prepare(
          `SELECT * FROM transfer_rule_run WHERE tenant_id = ? AND rule_id = ?
           ORDER BY created_at DESC`,
        )
        .all(tenantId, ruleId) as RunRow[])
    : (db
        .prepare(
          `SELECT * FROM transfer_rule_run WHERE tenant_id = ?
           ORDER BY created_at DESC LIMIT 50`,
        )
        .all(tenantId) as RunRow[]);
  return rows.map(mapRun);
}
