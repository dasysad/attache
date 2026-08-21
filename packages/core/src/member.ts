/**
 * Household members (UI P4+).
 *
 * What: people on the tenant — account_holder, partner, dependent, other.
 * Why: family context without mesh auth or WorkOS. Non-holders get auth_level none.
 * How: thin rows on existing `member` table; kinds are display roles only.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getTenant, isOnboarded } from "./tenant.js";

export type MemberKind =
  | "account_holder"
  | "partner"
  | "dependent"
  | "other"
  | "shadow"
  | "linked_external";

export type MemberAuthLevel = "none" | "view_only" | "full";

export interface HouseholdMember {
  id: string;
  tenantId: string;
  displayName: string;
  kind: MemberKind;
  authLevel: MemberAuthLevel;
  createdAt: string;
}

interface MemberRow {
  id: string;
  tenant_id: string;
  display_name: string;
  kind: string;
  auth_level: string;
  created_at: string;
}

const ADDABLE_KINDS: readonly MemberKind[] = [
  "partner",
  "dependent",
  "other",
];

function requireTenantId(db: Database.Database): string {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  return getTenant(db)!.id;
}

function parseKind(raw: string): MemberKind {
  const k = raw as MemberKind;
  const allowed: MemberKind[] = [
    "account_holder",
    "partner",
    "dependent",
    "other",
    "shadow",
    "linked_external",
  ];
  if (!allowed.includes(k)) {
    throw new Error(
      `member kind must be account_holder|partner|dependent|other (got ${raw})`,
    );
  }
  return k;
}

function mapRow(row: MemberRow): HouseholdMember {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    kind: parseKind(row.kind),
    authLevel: row.auth_level as MemberAuthLevel,
    createdAt: row.created_at,
  };
}

export function listMembers(db: Database.Database): HouseholdMember[] {
  if (!getTenant(db)) return [];
  const tenantId = getTenant(db)!.id;
  const rows = db
    .prepare(
      `SELECT * FROM member WHERE tenant_id = ?
       ORDER BY
         CASE kind
           WHEN 'account_holder' THEN 0
           WHEN 'partner' THEN 1
           WHEN 'dependent' THEN 2
           ELSE 3
         END,
         display_name`,
    )
    .all(tenantId) as MemberRow[];
  return rows.map(mapRow);
}

export function getMember(
  db: Database.Database,
  id: string,
): HouseholdMember | null {
  const tenantId = requireTenantId(db);
  const row = db
    .prepare(`SELECT * FROM member WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as MemberRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * Add a non-holder member. Account holders are created only via onboard.
 */
export function addMember(
  db: Database.Database,
  input: { displayName: string; kind: string },
): HouseholdMember {
  const tenantId = requireTenantId(db);
  const name = input.displayName.trim();
  if (!name) throw new Error("display name required");
  const kind = parseKind(input.kind);
  if (!ADDABLE_KINDS.includes(kind)) {
    throw new Error("cannot add account_holder here — use onboard");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO member (id, tenant_id, display_name, kind, auth_level, created_at)
     VALUES (?, ?, ?, ?, 'none', ?)`,
  ).run(id, tenantId, name, kind, now);
  return getMember(db, id)!;
}

/**
 * Remove a non-holder. Refuses to delete the last account_holder.
 */
export function removeMember(db: Database.Database, id: string): void {
  const tenantId = requireTenantId(db);
  const existing = getMember(db, id);
  if (!existing) throw new Error("member not found");
  if (existing.kind === "account_holder") {
    const holders = listMembers(db).filter((m) => m.kind === "account_holder");
    if (holders.length <= 1) {
      throw new Error("cannot remove the only account holder");
    }
  }
  const result = db
    .prepare(`DELETE FROM member WHERE id = ? AND tenant_id = ?`)
    .run(id, tenantId);
  if (result.changes === 0) throw new Error("member not found");
}

export function parseMemberKind(raw: string): MemberKind {
  return parseKind(raw);
}
