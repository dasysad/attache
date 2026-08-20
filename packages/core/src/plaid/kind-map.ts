import type { FundingAccountKind } from "../domain.js";

/**
 * Map Plaid account subtype/type → Attache funding kind.
 *
 * What: normalize vendor labels so My Accounts, runway, and net worth stay consistent.
 * Why: live Plaid returns many subtypes; we persist checking | savings | cash |
 *      brokerage | credit | loan. Cash is reserved for manual envelopes.
 * How: credit/loan/investment types first, then savings-like, then checking-like.
 */
export function mapPlaidAccountKind(
  subtype: string | null | undefined,
  type?: string | null,
): FundingAccountKind | "other" {
  const s = (subtype ?? "").toLowerCase().trim();
  const t = (type ?? "").toLowerCase().trim();

  if (t === "credit" || s === "credit card" || s === "credit_card") {
    return "credit";
  }
  if (t === "loan" || s === "mortgage" || s === "student" || s === "auto") {
    return "loan";
  }
  if (
    t === "investment" ||
    s === "brokerage" ||
    s === "ira" ||
    s === "401k" ||
    s === "403b"
  ) {
    return "brokerage";
  }

  if (
    s === "savings" ||
    s === "money market" ||
    s === "money_market" ||
    s === "cd" ||
    s === "hsa" ||
    s === "isa"
  ) {
    return "savings";
  }

  if (
    s === "checking" ||
    s === "prepaid" ||
    s === "paypal" ||
    s === "cash management" ||
    s === "cash_management"
  ) {
    return "checking";
  }

  if (t === "other") return "other";
  if (s) return "other";
  if (t === "depository") return "checking";
  return "other";
}

/**
 * Persist Plaid kinds. Unknown "other" still lands as checking so the row
 * appears on My Accounts; credit/loan/brokerage stay first-class (ADR-014 P2).
 */
export function fundingKindFromPlaid(
  kind: "checking" | "savings" | "other" | FundingAccountKind,
): FundingAccountKind {
  if (kind === "other") return "checking";
  return kind;
}
