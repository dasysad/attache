/**
 * Household entities (ADR-015 P4) — payee / institution names, not contacts.
 *
 * What: a read-only projection of obligation payees and account institutions.
 * Why: confirming a bill already records the vendor; we do not stand up a CRM.
 * No table. Discover does not insert entities.
 */
import type Database from "better-sqlite3";
import { listAccounts } from "./account.js";
import { listObligations } from "./obligation.js";
import { getTenant } from "./tenant.js";

export type HouseholdEntityKind = "payee" | "institution";

export interface HouseholdEntity {
  name: string;
  kind: HouseholdEntityKind;
  /** How many unpaid+paid obligations use this payee (0 for institutions). */
  obligationCount: number;
}

export function listHouseholdEntities(db: Database.Database): HouseholdEntity[] {
  if (!getTenant(db)) return [];
  const byName = new Map<string, HouseholdEntity>();

  for (const o of listObligations(db)) {
    const name = o.payee.trim();
    if (!name) continue;
    const key = `payee:${name.toLowerCase()}`;
    const prev = byName.get(key);
    if (prev) prev.obligationCount += 1;
    else byName.set(key, { name, kind: "payee", obligationCount: 1 });
  }

  for (const a of listAccounts(db)) {
    const name = a.institution?.trim();
    if (!name) continue;
    const key = `institution:${name.toLowerCase()}`;
    if (byName.has(key)) continue;
    byName.set(key, { name, kind: "institution", obligationCount: 0 });
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
