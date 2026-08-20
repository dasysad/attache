import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  Obligation,
  ObligationCadence,
  ObligationDisplayStatus,
  Provenance,
} from "./domain.js";
import { getTenant } from "./tenant.js";

const MS_DAY = 86_400_000;

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

const CADENCES: readonly ObligationCadence[] = ["once", "monthly", "yearly"];

/** SQLite will store any string; reject junk at the domain boundary. */
function isObligationCadence(value: string): value is ObligationCadence {
  return (CADENCES as readonly string[]).includes(value);
}

/** UI status for a single obligation row (manage page + dashboard). */
export function obligationDisplayStatus(
  ob: Obligation,
  today: Date = startOfTodayUtc(),
): ObligationDisplayStatus {
  if (ob.paidAt) return "paid";
  const due = parseIsoDate(ob.dueDate);
  const delta = daysBetween(today, due);
  if (delta < 0) return "overdue";
  if (delta <= 3) return "due_soon";
  if (ob.autopay && delta <= 14) return "scheduled";
  return "upcoming";
}

interface ObligationRow {
  id: string;
  tenant_id: string;
  payee: string;
  amount_usd: number;
  cadence: ObligationCadence;
  due_date: string;
  autopay: number;
  paid_at: string | null;
  provenance: Provenance;
  notes: string | null;
  ingested_event_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ObligationRow): Obligation {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    payee: row.payee,
    amountUsd: row.amount_usd,
    cadence: row.cadence,
    dueDate: row.due_date,
    autopay: row.autopay === 1,
    paidAt: row.paid_at,
    provenance: row.provenance,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** VS-4: obligation promoted from ingested bill (document/email provenance). */
export function createObligationFromIngest(
  db: Database.Database,
  input: {
    payee: string;
    amountUsd: number;
    dueDate: string;
    cadence?: ObligationCadence;
    autopay?: boolean;
    provenance: Extract<Provenance, "document" | "email">;
    ingestedEventId: string;
    notes?: string;
  },
): Obligation {
  const tenantId = requireTenant(db);
  if (!input.payee.trim()) throw new Error("payee required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    throw new Error("dueDate must be YYYY-MM-DD");
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("amount must be positive");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO obligation
     (id, tenant_id, payee, amount_usd, cadence, due_date, autopay, paid_at,
      provenance, notes, ingested_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.payee.trim(),
    input.amountUsd,
    input.cadence ?? "once",
    input.dueDate,
    input.autopay ? 1 : 0,
    input.provenance,
    input.notes?.trim() || null,
    input.ingestedEventId,
    now,
    now,
  );

  const row = db
    .prepare("SELECT * FROM obligation WHERE id = ?")
    .get(id) as ObligationRow;
  return mapRow(row);
}

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

export function listObligations(db: Database.Database): Obligation[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM obligation WHERE tenant_id = ? ORDER BY paid_at IS NULL DESC, due_date ASC`,
    )
    .all(tenantId) as ObligationRow[];
  return rows.map(mapRow);
}

export function getObligation(
  db: Database.Database,
  obligationId: string,
): Obligation | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(`SELECT * FROM obligation WHERE id = ? AND tenant_id = ?`)
    .get(obligationId, tenantId) as ObligationRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * Create a native (typed) obligation — CLI/MCP/web share this.
 * How: validate payee/amount/due/cadence, insert with provenance `native`.
 * Why: ingest uses `createObligationFromIngest` instead so HITL bills keep
 * email provenance. This path is onboard-gap fill, not Gmail confirm.
 */
export function createObligation(
  db: Database.Database,
  input: {
    payee: string;
    amountUsd: number;
    dueDate: string;
    cadence?: ObligationCadence;
    autopay?: boolean;
    notes?: string;
  },
): Obligation {
  const tenantId = requireTenant(db);
  if (!input.payee.trim()) throw new Error("payee required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
    throw new Error("dueDate must be YYYY-MM-DD");
  }
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("amount must be positive");
  }
  const cadence = input.cadence ?? "once";
  if (!isObligationCadence(cadence)) {
    throw new Error("cadence must be once|monthly|yearly");
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO obligation
     (id, tenant_id, payee, amount_usd, cadence, due_date, autopay, paid_at, provenance, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'native', ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.payee.trim(),
    input.amountUsd,
    cadence,
    input.dueDate,
    input.autopay ? 1 : 0,
    input.notes?.trim() || null,
    now,
    now,
  );

  const row = db
    .prepare("SELECT * FROM obligation WHERE id = ?")
    .get(id) as ObligationRow;
  return mapRow(row);
}

export function updateObligation(
  db: Database.Database,
  obligationId: string,
  input: {
    payee?: string;
    amountUsd?: number;
    dueDate?: string;
    cadence?: ObligationCadence;
    autopay?: boolean;
    notes?: string;
  },
): Obligation {
  const existing = getObligation(db, obligationId);
  if (!existing) throw new Error("obligation not found");
  if (existing.paidAt) throw new Error("cannot edit paid obligation");

  const payee = input.payee !== undefined ? input.payee.trim() : existing.payee;
  if (!payee) throw new Error("payee required");
  const dueDate = input.dueDate ?? existing.dueDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new Error("dueDate must be YYYY-MM-DD");
  }
  const amountUsd = input.amountUsd ?? existing.amountUsd;
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error("amount must be positive");
  }
  const cadence = input.cadence ?? existing.cadence;
  if (!isObligationCadence(cadence)) {
    throw new Error("cadence must be once|monthly|yearly");
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE obligation SET
       payee = ?, amount_usd = ?, due_date = ?, cadence = ?,
       autopay = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    payee,
    amountUsd,
    dueDate,
    cadence,
    input.autopay !== undefined ? (input.autopay ? 1 : 0) : (existing.autopay ? 1 : 0),
    input.notes !== undefined ? input.notes.trim() || null : existing.notes,
    now,
    obligationId,
  );
  return getObligation(db, obligationId)!;
}

export function deleteObligation(db: Database.Database, obligationId: string): void {
  const tenantId = requireTenant(db);
  const result = db
    .prepare(`DELETE FROM obligation WHERE id = ? AND tenant_id = ?`)
    .run(obligationId, tenantId);
  if (result.changes === 0) throw new Error("obligation not found");
}

/**
 * Stamp paid_at. Does not ACH or post the ledger — honesty: paid ≠ transferred.
 * Unknown id and already-paid share one error so clients cannot probe ids.
 */
export function markObligationPaid(
  db: Database.Database,
  obligationId: string,
): Obligation {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE obligation SET paid_at = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND paid_at IS NULL`,
    )
    .run(now, now, obligationId, tenantId);
  if (result.changes === 0) {
    throw new Error("obligation not found or already paid");
  }
  const row = db
    .prepare("SELECT * FROM obligation WHERE id = ?")
    .get(obligationId) as ObligationRow;
  return mapRow(row);
}
