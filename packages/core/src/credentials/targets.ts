/**
 * High-value credential shortlist (BL-7 / VS-11 P0).
 *
 * What: emails + funding institutions + obligation payees already in Attache.
 * Why: HIBP and "rotate this login" only make sense for accounts we track —
 *      not a password manager vault, not bulk rotation (Dashlane failure).
 * Honesty: we never store website passwords. Payees/institutions are names
 *          only; HIBP is called solely for mailbox emails.
 */
import type Database from "better-sqlite3";
import { listAccounts } from "../account.js";
import { listGmailAccounts } from "../gmail/store.js";
import { listImapAccounts } from "../imap/store.js";
import { listObligations } from "../obligation.js";
import { isOnboarded } from "../tenant.js";

export type HighValueKind = "email" | "institution" | "payee";

export interface HighValueTarget {
  kind: HighValueKind;
  name: string;
  source: "gmail" | "imap" | "account" | "obligation";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function listHighValueTargets(
  db: Database.Database,
): HighValueTarget[] {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  const out: HighValueTarget[] = [];
  const seen = new Set<string>();

  const add = (target: HighValueTarget) => {
    const key = `${target.kind}:${target.name.trim().toLowerCase()}`;
    if (!target.name.trim() || seen.has(key)) return;
    seen.add(key);
    out.push({ ...target, name: target.name.trim() });
  };

  for (const g of listGmailAccounts(db)) {
    add({ kind: "email", name: g.email, source: "gmail" });
  }
  for (const imap of listImapAccounts(db)) {
    if (looksLikeEmail(imap.username)) {
      add({ kind: "email", name: imap.username, source: "imap" });
    }
  }
  for (const account of listAccounts(db)) {
    add({
      kind: "institution",
      name: account.institution?.trim() || account.name,
      source: "account",
    });
  }
  for (const ob of listObligations(db)) {
    add({ kind: "payee", name: ob.payee, source: "obligation" });
  }
  return out;
}
