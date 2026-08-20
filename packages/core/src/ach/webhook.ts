/**
 * ACH webhook intake (ADR-013 P2).
 *
 * What: apply a rail status update for a known debit transfer id, then settle
 *       to LedgerPort when posted (same path as `ach sync`).
 * Why: live Plaid Transfer events should not require polling; local-first
 *       still accepts a signed POST when the Mac is reachable (tunnel/BYO).
 * Honesty: missing ATTACHE_ACH_WEBHOOK_SECRET → webhooks off.
 */
import { timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { getAch } from "./create-adapter.js";
import type { AchPort, AchRailStatus } from "./port.js";
import {
  getAchTransferByDebitId,
  updateAchTransferStatus,
  type AchTransferRecord,
} from "./store.js";
import { settleAchToLedgerForProposal, markProposalAchFailed } from "./submit.js";

export class AchWebhookError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 401 | 404 | 503,
  ) {
    super(message);
    this.name = "AchWebhookError";
  }
}

export function achWebhookSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.ATTACHE_ACH_WEBHOOK_SECRET?.trim();
  return key ? key : null;
}

export function isAchWebhookConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(achWebhookSecretFromEnv(env));
}

export function assertAchWebhookAuthorized(
  authorizationHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const secret = achWebhookSecretFromEnv(env);
  if (!secret) {
    throw new AchWebhookError(
      "ACH webhooks off — set ATTACHE_ACH_WEBHOOK_SECRET",
      503,
    );
  }
  const expected = `Bearer ${secret}`;
  const actual = authorizationHeader ?? "";
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AchWebhookError("unauthorized", 401);
  }
}

export interface AchWebhookPayload {
  /** Plaid transfer id (debit leg) or Attache debit_transfer_id. */
  transfer_id?: string;
  transferId?: string;
  debit_transfer_id?: string;
  status?: string;
  webhook_type?: string;
  webhook_code?: string;
}

function mapWebhookStatus(raw: string | undefined): AchRailStatus | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === "posted" || s === "settled") return "posted";
  if (s === "failed" || s === "cancelled" || s === "canceled") return "failed";
  if (s === "returned") return "returned";
  if (s === "pending" || s === "submitted") return "submitted";
  return null;
}

/**
 * Apply a webhook (or agent POST). If status omitted, poll AchPort.get.
 */
export async function handleAchWebhook(
  db: Database.Database,
  payload: AchWebhookPayload,
  options: {
    ach?: AchPort | null;
    authorizationHeader?: string;
    env?: NodeJS.ProcessEnv;
    skipAuth?: boolean;
  } = {},
): Promise<AchTransferRecord> {
  const env = options.env ?? process.env;
  if (!options.skipAuth) {
    assertAchWebhookAuthorized(options.authorizationHeader, env);
  }

  const debitId =
    payload.debit_transfer_id?.trim() ||
    payload.transfer_id?.trim() ||
    payload.transferId?.trim();
  if (!debitId) {
    throw new AchWebhookError("transfer_id required", 400);
  }

  const existing = getAchTransferByDebitId(db, debitId);
  if (!existing) {
    throw new AchWebhookError("ACH transfer not found", 404);
  }
  if (existing.status === "posted") {
    return existing;
  }

  let status = mapWebhookStatus(payload.status);
  if (!status) {
    const ach = options.ach ?? getAch();
    if (!ach) {
      throw new AchWebhookError(
        "ACH rail off and webhook payload has no status — set ATTACHE_ACH or include status",
        503,
      );
    }
    const rail = await ach.get(debitId);
    if (!rail) {
      throw new AchWebhookError("rail transfer not found at provider", 404);
    }
    status = rail.status;
  }

  const updated = updateAchTransferStatus(db, existing.proposalId, status);
  if (updated.status === "posted") {
    await settleAchToLedgerForProposal(db, existing.proposalId, updated);
  } else if (updated.status === "failed" || updated.status === "returned") {
    markProposalAchFailed(db, existing.proposalId, updated.status);
  }
  return getAchTransferByDebitId(db, debitId)!;
}

export function achWebhookStatus(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  path: "/api/ach/webhook";
  message: string;
} {
  const configured = isAchWebhookConfigured(env);
  return {
    configured,
    path: "/api/ach/webhook",
    message: configured
      ? "ACH webhooks on — POST /api/ach/webhook with Bearer ATTACHE_ACH_WEBHOOK_SECRET."
      : "ACH webhooks off. Poll with attache ach sync, or set ATTACHE_ACH_WEBHOOK_SECRET.",
  };
}
