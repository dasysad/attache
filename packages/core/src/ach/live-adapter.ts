/**
 * Live Plaid Transfer adapter (ADR-013 P1).
 *
 * WHAT: debit then credit via Plaid REST (`/transfer/authorization/create`,
 *       `/transfer/create`). Settlement is polled (`get`); simulatePosted throws.
 * WHY: Plaid is the licensed originator; Attache never holds deposits.
 *      A2A needs a funded Transfer ledger in production — sandbox FBO is free.
 *
 * HOW: fetch against PLAID_ENV base URL with the same client id/secret headers
 *      as ingest (SDK v43 in this repo has no Transfer methods).
 */
import { loadPlaidConfig } from "../plaid/config.js";
import { mapPlaidApiError } from "../plaid/errors.js";
import type { AchPort, AchRailTransfer, AchSubmitInput } from "./port.js";

interface PlaidTransferBody {
  transfer?: { id?: string; status?: string; amount?: string };
  authorization?: { id?: string; decision?: string };
  error_message?: string;
  error_code?: string;
}

function achDescription(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9 ]/g, "").trim() || "ATTACHE";
  return cleaned.slice(0, 15).toUpperCase();
}

function amountString(amountUsd: number): string {
  return amountUsd.toFixed(2);
}

function mapStatus(raw: string | undefined): AchRailTransfer["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s === "posted" || s === "settled") return "posted";
  if (s === "failed" || s === "cancelled" || s === "canceled") return "failed";
  if (s === "returned") return "returned";
  return "submitted";
}

export class LivePlaidAchAdapter implements AchPort {
  readonly mode = "live" as const;

  constructor(
    private readonly postJson: (
      path: string,
      body: Record<string, unknown>,
    ) => Promise<PlaidTransferBody> = plaidPost,
  ) {}

  async submit(input: AchSubmitInput): Promise<AchRailTransfer> {
    if (input.amountUsd <= 0 || !Number.isFinite(input.amountUsd)) {
      throw new Error("ACH amount must be a positive finite number");
    }
    const description = achDescription(input.description);
    const amount = amountString(input.amountUsd);

    const debit = await this.createLeg({
      accessToken: input.debit.accessToken,
      accountId: input.debit.plaidAccountId,
      type: "debit",
      amount,
      description,
      legalName: input.legalName,
      idempotencyKey: `${input.idempotencyKey}:debit`,
    });
    const credit = await this.createLeg({
      accessToken: input.credit.accessToken,
      accountId: input.credit.plaidAccountId,
      type: "credit",
      amount,
      description,
      legalName: input.legalName,
      idempotencyKey: `${input.idempotencyKey}:credit`,
    });

    return {
      debitTransferId: debit.id,
      creditTransferId: credit.id,
      status: "submitted",
      network: "ach",
      amountUsd: input.amountUsd,
    };
  }

  async get(debitTransferId: string): Promise<AchRailTransfer | null> {
    const body = await this.postJson("/transfer/get", {
      transfer_id: debitTransferId,
    });
    const t = body.transfer;
    if (!t?.id) return null;
    return {
      debitTransferId: t.id,
      creditTransferId: t.id,
      status: mapStatus(t.status),
      network: "ach",
      amountUsd: Number(t.amount ?? 0),
    };
  }

  async simulatePosted(_debitTransferId: string): Promise<AchRailTransfer> {
    throw new Error(
      "Live Plaid Transfer cannot simulatePosted — use attache ach sync (or Plaid sandbox simulate in Dashboard)",
    );
  }

  private async createLeg(args: {
    accessToken: string;
    accountId: string;
    type: "debit" | "credit";
    amount: string;
    description: string;
    legalName: string;
    idempotencyKey: string;
  }): Promise<{ id: string }> {
    const auth = await this.postJson("/transfer/authorization/create", {
      access_token: args.accessToken,
      account_id: args.accountId,
      type: args.type,
      network: "ach",
      amount: args.amount,
      ach_class: "ppd",
      user: { legal_name: args.legalName },
      idempotency_key: args.idempotencyKey,
    });
    const authorizationId = auth.authorization?.id;
    const decision = auth.authorization?.decision;
    if (!authorizationId) {
      throw new Error("Plaid Transfer authorization missing id");
    }
    if (decision && decision !== "approved") {
      throw new Error(`Plaid Transfer authorization ${decision}`);
    }

    const created = await this.postJson("/transfer/create", {
      access_token: args.accessToken,
      account_id: args.accountId,
      authorization_id: authorizationId,
      description: args.description,
    });
    const id = created.transfer?.id;
    if (!id) throw new Error("Plaid Transfer create returned no transfer id");
    return { id };
  }
}

async function plaidPost(
  path: string,
  body: Record<string, unknown>,
): Promise<PlaidTransferBody> {
  const config = loadPlaidConfig();
  try {
    const res = await fetch(`${config.env}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PLAID-CLIENT-ID": config.clientId,
        "PLAID-SECRET": config.secret,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as PlaidTransferBody;
    if (!res.ok) {
      throw new Error(
        json.error_message ?? json.error_code ?? `Plaid Transfer HTTP ${res.status}`,
      );
    }
    return json;
  } catch (e) {
    throw mapPlaidApiError(e);
  }
}
