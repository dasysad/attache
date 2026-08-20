import type Database from "better-sqlite3";
import { getAccount } from "../account.js";
import { achBackendFromEnv, type AchBackend } from "../ach/config.js";
import type { FundingAccount } from "../domain.js";

/**
 * Transfer honesty (slice 5 + BL-12) — approve ≠ ACH unless the rail is on.
 *
 * What: classify whether approving a proposal will post via LedgerPort, submit
 *       licensed ACH, or only record household consent.
 * Why: Plaid-linked funding accounts have no bank move unless AchPort is enabled
 *      and both legs are Plaid (A2A). SnapTrade never ACH-executes.
 */

export type TransferExecutionMode = "ledger_execute" | "approval_only" | "ach_submit";

export interface TransferHonesty {
  mode: TransferExecutionMode;
  /** Short canonical note for CLI/MCP/UI. */
  note: string;
  /** Which proposal legs are Plaid-backed. */
  plaidLegs: Array<"from" | "to">;
  /** True when approve will call LedgerPort.postTransfer immediately. */
  willExecute: boolean;
  /** True when approve will call AchPort.submit (Plaid A2A, rail on). */
  willSubmitAch: boolean;
}

export const TRANSFER_HONESTY = {
  ledgerExecute:
    "Approve will execute locally via ledger (manual accounts only — not a bank ACH).",
  approvalOnly:
    "Approve records consent only — no bank move. One or more legs are Plaid/SnapTrade-linked (ACH off or ineligible).",
  approvedStatus:
    "Approved but not executed — linked brokerage/bank leg(s); no ACH / balance change.",
  executedStatus:
    "Executed on local ledger (manual accounts). Not an external bank transfer.",
  achSubmitSandbox:
    "Approve will submit sandbox ACH (fake licensed rail — not a real bank). Then: attache ach simulate <id>.",
  achSubmitLive:
    "Approve will originate ACH via Plaid Transfer (licensed rail). Then: attache ach sync.",
  achPendingStatus:
    "ACH submitted — awaiting settlement (sandbox: attache ach simulate; live: attache ach sync).",
  achFailedStatus: "ACH failed or returned — no ledger post.",
  executedAchStatus:
    "ACH posted on the licensed rail and recorded on the local ledger.",
} as const;

function isManualExecutable(account: FundingAccount | null | undefined): boolean {
  if (!account) return false;
  return (
    account.provenance === "native" &&
    account.syncStatus === "manual" &&
    !account.plaidAccountId &&
    !account.snaptradeAccountId
  );
}

function isPlaidLinked(account: FundingAccount | null | undefined): boolean {
  if (!account) return false;
  return account.provenance === "plaid" && Boolean(account.plaidAccountId);
}

/**
 * Classify approve outcome for a from/to funding account pair.
 */
export function transferHonesty(
  db: Database.Database,
  fromAccountId: string,
  toAccountId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): TransferHonesty {
  const from = getAccount(db, fromAccountId);
  const plaidLegs: Array<"from" | "to"> = [];
  const backend: AchBackend = achBackendFromEnv(env);

  if (!from) {
    return {
      mode: "approval_only",
      note: TRANSFER_HONESTY.approvalOnly,
      plaidLegs: ["from"],
      willExecute: false,
      willSubmitAch: false,
    };
  }
  if (!isManualExecutable(from)) plaidLegs.push("from");

  let toPlaid = false;
  if (toAccountId) {
    const to = getAccount(db, toAccountId);
    if (!to || !isManualExecutable(to)) {
      plaidLegs.push("to");
    }
    toPlaid = isPlaidLinked(to);
  }

  const fromPlaid = isPlaidLinked(from);
  if (backend !== "off" && fromPlaid && toPlaid) {
    return {
      mode: "ach_submit",
      note:
        backend === "plaid"
          ? TRANSFER_HONESTY.achSubmitLive
          : TRANSFER_HONESTY.achSubmitSandbox,
      plaidLegs: ["from", "to"],
      willExecute: false,
      willSubmitAch: true,
    };
  }

  if (plaidLegs.length > 0) {
    return {
      mode: "approval_only",
      note: TRANSFER_HONESTY.approvalOnly,
      plaidLegs,
      willExecute: false,
      willSubmitAch: false,
    };
  }

  return {
    mode: "ledger_execute",
    note: TRANSFER_HONESTY.ledgerExecute,
    plaidLegs: [],
    willExecute: true,
    willSubmitAch: false,
  };
}

/** Warning line attached to dry-run / pending proposals with Plaid legs. */
export function transferHonestyWarning(honesty: TransferHonesty): string | null {
  if (honesty.mode === "ledger_execute") return null;
  return honesty.note;
}

/** Post-approve message for agents and redirects. */
export function transferApprovalMessage(status: "executed" | "approved" | string): string {
  if (status === "executed") return TRANSFER_HONESTY.executedStatus;
  if (status === "approved") return TRANSFER_HONESTY.approvedStatus;
  if (status === "ach_pending") return TRANSFER_HONESTY.achPendingStatus;
  if (status === "ach_failed") return TRANSFER_HONESTY.achFailedStatus;
  return `Transfer ${status}`;
}
