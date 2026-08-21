import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { openDatabase } from "./db.js";
import { getOrCreateSiteId, registerPeer } from "./peer.js";

export type TenantScope = "individual" | "household" | "business";
export type BillingPlan = "free" | "platform";

export interface Tenant {
  id: string;
  name: string;
  scope: TenantScope;
  billingPlan: BillingPlan;
  ledgerPrimarySiteId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  tenantId: string;
  displayName: string;
  kind: "account_holder" | "partner" | "dependent" | "other" | "shadow" | "linked_external";
  authLevel: "none" | "view_only" | "full";
  createdAt: string;
}

interface TenantRow {
  id: string;
  name: string;
  scope: TenantScope;
  billing_plan: BillingPlan;
  ledger_primary_site_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapTenant(row: TenantRow): Tenant {
  if (!row.ledger_primary_site_id) {
    throw new Error(`tenant ${row.id} missing ledger_primary_site_id`);
  }
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    billingPlan: row.billing_plan,
    ledgerPrimarySiteId: row.ledger_primary_site_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getTenant(db: Database.Database): Tenant | null {
  const row = db.prepare("SELECT * FROM tenant LIMIT 1").get() as
    | TenantRow
    | undefined;
  return row ? mapTenant(row) : null;
}

/**
 * VS-0 onboarding: create household tenant, first member, and primary peer.
 * Single-tenant local install for now (multi-tenant SaaS schema-ready).
 */
export function createTenant(
  db: Database.Database,
  input: {
    householdName: string;
    holderDisplayName: string;
    scope?: TenantScope;
  },
): { tenant: Tenant; member: Member; siteId: string } {
  const existing = getTenant(db);
  if (existing) {
    throw new Error("tenant already exists for this install");
  }

  const siteId = getOrCreateSiteId(db);
  const now = new Date().toISOString();
  const tenantId = randomUUID();
  const memberId = randomUUID();

  db.prepare(
    `INSERT INTO tenant (id, name, scope, billing_plan, ledger_primary_site_id, created_at, updated_at)
     VALUES (?, ?, ?, 'free', ?, ?, ?)`,
  ).run(
    tenantId,
    input.householdName,
    input.scope ?? "individual",
    siteId,
    now,
    now,
  );

  db.prepare(
    `INSERT INTO member (id, tenant_id, display_name, kind, auth_level, created_at)
     VALUES (?, ?, ?, 'account_holder', 'full', ?)`,
  ).run(memberId, tenantId, input.holderDisplayName, now);

  registerPeer(db, {
    siteId,
    tenantId,
    displayName: input.holderDisplayName,
    role: "primary",
  });

  const tenant = getTenant(db);
  if (!tenant) throw new Error("failed to load tenant after create");

  return {
    tenant,
    member: {
      id: memberId,
      tenantId,
      displayName: input.holderDisplayName,
      kind: "account_holder",
      authLevel: "full",
      createdAt: now,
    },
    siteId,
  };
}

export function isOnboarded(db: Database.Database): boolean {
  return getTenant(db) !== null;
}

export function bootstrapTenantCheck(dataDir?: string): {
  onboarded: boolean;
  siteId: string;
} {
  const db = openDatabase(dataDir);
  try {
    return {
      onboarded: isOnboarded(db),
      siteId: getOrCreateSiteId(db),
    };
  } finally {
    db.close();
  }
}
