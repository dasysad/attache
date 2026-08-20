/**
 * Transfer rule types (ADR-017 / BL-12 P3).
 *
 * What: typed policy documents for autonomous sweeps — not Starflow YAML,
 *       not Decider rubrics, not free-form script.
 * Why: caps + account ids must be structured so agents and humans can audit
 *      them; CEL `when` is a later optional guard, not the whole rule.
 */

/** P0: fire on every evaluate, or when an account balance clears a threshold. */
export type TransferRuleTrigger =
  | { kind: "always" }
  | { kind: "balance_above"; accountId: string; thresholdUsd: number };

/** P0: fixed-amount A2A sweep. */
export type TransferRuleAction = {
  kind: "sweep";
  fromAccountId: string;
  toAccountId: string;
  amountUsd: number;
};

/**
 * autonomy=proposal → always HITL queue.
 * autonomy=auto → approve immediately when dry-run allows (still honesty-bound).
 */
export type TransferRuleAutonomy = "proposal" | "auto";

export interface TransferRulePolicy {
  maxPerRunUsd: number;
  maxPerMonthUsd: number;
  autonomy: TransferRuleAutonomy;
}

export interface TransferRule {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  trigger: TransferRuleTrigger;
  action: TransferRuleAction;
  policy: TransferRulePolicy;
  createdAt: string;
  updatedAt: string;
}

export type TransferRuleRunOutcome =
  | "skipped"
  | "proposed"
  | "blocked"
  | "executed"
  | "approved"
  | "ach_pending"
  | "failed";

export interface TransferRuleRun {
  id: string;
  tenantId: string;
  ruleId: string;
  periodKey: string;
  idempotencyKey: string;
  outcome: TransferRuleRunOutcome;
  proposalId: string | null;
  amountUsd: number | null;
  message: string | null;
  createdAt: string;
}

export interface CreateTransferRuleInput {
  name: string;
  trigger?: TransferRuleTrigger;
  fromAccountId: string;
  toAccountId: string;
  amountUsd: number;
  maxPerRunUsd?: number;
  maxPerMonthUsd?: number;
  autonomy?: TransferRuleAutonomy;
  /** balance_above only — defaults to fromAccountId when omitted. */
  triggerAccountId?: string;
  thresholdUsd?: number;
}
