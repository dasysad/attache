/**
 * Recurring income streams (UI P4+).
 *
 * What: manual payroll / benefit / other inflows with cadence + next date.
 * Why: runway and cashflow need inflows; not payroll OCR and not ACH.
 * How: thin `income_stream` table; expand like obligations for forecast.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ObligationCadence } from "./domain.js";
import { getTenant, isOnboarded } from "./tenant.js";
import { getMember } from "./member.js";

export type IncomeCadence = ObligationCadence;

export interface IncomeStream {
  id: string;
  tenantId: string;
  label: string;
  amountUsd: number;
  cadence: IncomeCadence;
  nextDate: string;
  memberId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeOccurrence {
  incomeStreamId: string;
  label: string;
  date: string;
  amountUsd: number;
}

interface Row {
  id: string;
  tenant_id: string;
  label: string;
  amount_usd: number;
  cadence: string;
  next_date: string;
  member_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const CADENCES: readonly IncomeCadence[] = ["once", "monthly", "yearly"];
const MS_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireTenantId(db: Database.Database): string {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  return getTenant(db)!.id;
}

function parseCadence(raw: string): IncomeCadence {
  if (!(CADENCES as readonly string[]).includes(raw)) {
    throw new Error("cadence must be once|monthly|yearly");
  }
  return raw as IncomeCadence;
}

function mapRow(row: Row): IncomeStream {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    label: row.label,
    amountUsd: row.amount_usd,
    cadence: parseCadence(row.cadence),
    nextDate: row.next_date,
    memberId: row.member_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function listIncomeStreams(db: Database.Database): IncomeStream[] {
  if (!getTenant(db)) return [];
  const tenantId = getTenant(db)!.id;
  const rows = db
    .prepare(
      `SELECT * FROM income_stream WHERE tenant_id = ? ORDER BY next_date, label`,
    )
    .all(tenantId) as Row[];
  return rows.map(mapRow);
}

export function getIncomeStream(
  db: Database.Database,
  id: string,
): IncomeStream | null {
  const tenantId = requireTenantId(db);
  const row = db
    .prepare(`SELECT * FROM income_stream WHERE id = ? AND tenant_id = ?`)
    .get(id, tenantId) as Row | undefined;
  return row ? mapRow(row) : null;
}

export function createIncomeStream(
  db: Database.Database,
  input: {
    label: string;
    amountUsd: number;
    cadence?: string;
    nextDate: string;
    memberId?: string | null;
    notes?: string | null;
  },
): IncomeStream {
  const tenantId = requireTenantId(db);
  const label = input.label.trim();
  if (!label) throw new Error("label required");
  if (!Number.isFinite(input.amountUsd) || input.amountUsd <= 0) {
    throw new Error("amount must be positive");
  }
  if (!ISO_DATE.test(input.nextDate)) {
    throw new Error("nextDate must be YYYY-MM-DD");
  }
  const cadence = parseCadence(input.cadence ?? "monthly");
  const memberId = input.memberId?.trim() || null;
  if (memberId && !getMember(db, memberId)) {
    throw new Error("member not found");
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO income_stream
     (id, tenant_id, label, amount_usd, cadence, next_date, member_id, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    label,
    input.amountUsd,
    cadence,
    input.nextDate,
    memberId,
    input.notes?.trim() || null,
    now,
    now,
  );
  return getIncomeStream(db, id)!;
}

export function deleteIncomeStream(db: Database.Database, id: string): void {
  const tenantId = requireTenantId(db);
  const result = db
    .prepare(`DELETE FROM income_stream WHERE id = ? AND tenant_id = ?`)
    .run(id, tenantId);
  if (result.changes === 0) throw new Error("income stream not found");
}

/**
 * Expand income into occurrences in [from, to] inclusive (same rules as obligations).
 */
export function expandIncomeStream(
  stream: IncomeStream,
  from: Date,
  to: Date,
): IncomeOccurrence[] {
  const out: IncomeOccurrence[] = [];
  const anchor = parseIsoDate(stream.nextDate);

  const push = (date: Date) => {
    if (date < from || date > to) return;
    out.push({
      incomeStreamId: stream.id,
      label: stream.label,
      date: formatIsoDate(date),
      amountUsd: stream.amountUsd,
    });
  };

  if (stream.cadence === "once") {
    push(anchor);
    return out;
  }

  if (stream.cadence === "monthly") {
    let cursor = new Date(anchor);
    while (cursor < from) {
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
      );
    }
    while (cursor <= to) {
      push(cursor);
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate()),
      );
    }
    return out;
  }

  let cursor = new Date(anchor);
  while (cursor < from) {
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear() + 1, cursor.getUTCMonth(), cursor.getUTCDate()),
    );
  }
  while (cursor <= to) {
    push(cursor);
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear() + 1, cursor.getUTCMonth(), cursor.getUTCDate()),
    );
  }
  return out;
}

/** Sum income occurrences in a closed UTC date range. */
export function sumIncomeInRange(
  streams: IncomeStream[],
  fromDate: string,
  toDate: string,
): number {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  let total = 0;
  for (const s of streams) {
    for (const occ of expandIncomeStream(s, from, to)) {
      total += occ.amountUsd;
    }
  }
  return total;
}

/** @internal test helper — day math unused outside expand. */
export function _incomeMsDay(): number {
  return MS_DAY;
}
