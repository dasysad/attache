import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  IngestedEvent,
  IngestKind,
  IngestSource,
  PlaidBalancePayload,
  PlaidTransactionPayload,
  BillExtractPayload,
} from "../domain.js";
import { getTenant } from "../tenant.js";

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

interface EventRow {
  id: string;
  tenant_id: string;
  source: IngestSource;
  kind: IngestKind;
  external_id: string | null;
  funding_account_id: string | null;
  payload_json: string;
  confidence: number;
  reviewed: number;
  promoted_at: string | null;
  ingested_at: string;
}

function mapEvent(row: EventRow): IngestedEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source,
    kind: row.kind,
    externalId: row.external_id,
    fundingAccountId: row.funding_account_id,
    payloadJson: row.payload_json,
    confidence: row.confidence,
    reviewed: row.reviewed === 1,
    promotedAt: row.promoted_at,
    ingestedAt: row.ingested_at,
  };
}

/**
 * Insert ingested event if external_id is new; return existing on conflict.
 */
export function upsertIngestedEvent(
  db: Database.Database,
  input: {
    source: IngestSource;
    kind: IngestKind;
    externalId: string;
    fundingAccountId?: string;
    payload: unknown;
    confidence?: number;
    reviewed?: boolean;
  },
): IngestedEvent {
  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT * FROM ingested_event WHERE tenant_id = ? AND source = ? AND external_id = ?`,
    )
    .get(tenantId, input.source, input.externalId) as EventRow | undefined;
  if (existing) return mapEvent(existing);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO ingested_event
     (id, tenant_id, source, kind, external_id, funding_account_id, payload_json,
      confidence, reviewed, promoted_at, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    tenantId,
    input.source,
    input.kind,
    input.externalId,
    input.fundingAccountId ?? null,
    JSON.stringify(input.payload),
    input.confidence ?? 1,
    input.reviewed === false ? 0 : 1,
    now,
  );

  return mapEvent(
    db.prepare("SELECT * FROM ingested_event WHERE id = ?").get(id) as EventRow,
  );
}

export function markEventPromoted(db: Database.Database, eventId: string): void {
  db.prepare(
    `UPDATE ingested_event SET promoted_at = ? WHERE id = ? AND promoted_at IS NULL`,
  ).run(new Date().toISOString(), eventId);
}

export function listUnpromotedEvents(
  db: Database.Database,
  source: IngestSource = "plaid",
): IngestedEvent[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM ingested_event
       WHERE tenant_id = ? AND source = ? AND promoted_at IS NULL AND reviewed = 1
       ORDER BY ingested_at ASC`,
    )
    .all(tenantId, source) as EventRow[];
  return rows.map(mapEvent);
}

/** VS-4: bills awaiting HITL confirm (document + email sources). */
export function listPendingBillEvents(db: Database.Database): IngestedEvent[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM ingested_event
       WHERE tenant_id = ? AND kind = 'bill'
         AND source IN ('document', 'email')
         AND promoted_at IS NULL
       ORDER BY ingested_at DESC`,
    )
    .all(tenantId) as EventRow[];
  return rows.map(mapEvent);
}

/**
 * Unpromoted document/email events for discovery ranking (ADR-015 P1).
 * Includes statements (connect hints) that listPendingBillEvents omits.
 */
export function listPendingDiscoverEvents(db: Database.Database): IngestedEvent[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM ingested_event
       WHERE tenant_id = ?
         AND source IN ('document', 'email')
         AND kind IN ('bill', 'statement', 'notice')
         AND promoted_at IS NULL
       ORDER BY ingested_at DESC`,
    )
    .all(tenantId) as EventRow[];
  return rows.map(mapEvent);
}

export function getIngestedEventById(
  db: Database.Database,
  eventId: string,
): IngestedEvent | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare("SELECT * FROM ingested_event WHERE id = ? AND tenant_id = ?")
    .get(eventId, tenantId) as EventRow | undefined;
  return row ? mapEvent(row) : null;
}

export function parseTransactionPayload(
  event: IngestedEvent,
): PlaidTransactionPayload {
  return JSON.parse(event.payloadJson) as PlaidTransactionPayload;
}

export function parseBalancePayload(event: IngestedEvent): PlaidBalancePayload {
  return JSON.parse(event.payloadJson) as PlaidBalancePayload;
}

export function parseBillPayload(event: IngestedEvent): BillExtractPayload {
  return JSON.parse(event.payloadJson) as BillExtractPayload;
}
