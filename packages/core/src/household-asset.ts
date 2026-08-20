/**
 * Thin household asset register (ADR-015 P4).
 *
 * What: home / vehicle rows with an optional estimate. No documents, no VIN
 *       vault, no photo album.
 * Why: property tax and auto policy mail are hints that improve net-worth
 *      later — only after HITL confirm. Discover must not insert rows.
 * Honesty: null estimatedUsd is unvalued and is *not* added into net worth as $0.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getTenant } from "./tenant.js";
import {
  inferAssetHint,
  parseHouseholdAssetKind,
  type HouseholdAssetKind,
} from "./ingest/asset-hint.js";
import {
  getIngestedEventById,
  markEventPromoted,
  parseBillPayload,
} from "./ingest/event.js";
import { isPhiHaystack } from "./imap/filter.js";

export type { HouseholdAssetKind } from "./ingest/asset-hint.js";
export { HOUSEHOLD_ASSET_KINDS, parseHouseholdAssetKind } from "./ingest/asset-hint.js";

export interface HouseholdAsset {
  id: string;
  tenantId: string;
  kind: HouseholdAssetKind;
  label: string;
  notes: string | null;
  estimatedUsd: number | null;
  ingestedEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssetRow {
  id: string;
  tenant_id: string;
  kind: string;
  label: string;
  notes: string | null;
  estimated_usd: number | null;
  ingested_event_id: string | null;
  created_at: string;
  updated_at: string;
}

function requireTenant(db: Database.Database): string {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return tenant.id;
}

function mapRow(row: AssetRow): HouseholdAsset {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind: parseHouseholdAssetKind(row.kind),
    label: row.label,
    notes: row.notes,
    estimatedUsd: row.estimated_usd,
    ingestedEventId: row.ingested_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listHouseholdAssets(db: Database.Database): HouseholdAsset[] {
  const tenantId = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM household_asset WHERE tenant_id = ? ORDER BY kind, label`,
    )
    .all(tenantId) as AssetRow[];
  return rows.map(mapRow);
}

export function getHouseholdAssetByEventId(
  db: Database.Database,
  eventId: string,
): HouseholdAsset | null {
  const tenantId = requireTenant(db);
  const row = db
    .prepare(
      `SELECT * FROM household_asset WHERE tenant_id = ? AND ingested_event_id = ?`,
    )
    .get(tenantId, eventId) as AssetRow | undefined;
  return row ? mapRow(row) : null;
}

function assertEstimate(estimatedUsd: number | null | undefined): number | null {
  if (estimatedUsd === undefined || estimatedUsd === null) return null;
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new Error("estimate must be a non-negative number, or omit it");
  }
  return estimatedUsd;
}

/**
 * Manual path — same table as confirm. Estimate is optional; never invent one.
 */
export function createHouseholdAsset(
  db: Database.Database,
  input: {
    kind: HouseholdAssetKind | string;
    label: string;
    notes?: string;
    estimatedUsd?: number | null;
  },
): HouseholdAsset {
  const tenantId = requireTenant(db);
  const label = input.label.trim();
  if (!label) throw new Error("asset label required");
  const kind = parseHouseholdAssetKind(String(input.kind));
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO household_asset
      (id, tenant_id, kind, label, notes, estimated_usd, ingested_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    tenantId,
    kind,
    label,
    input.notes?.trim() || null,
    assertEstimate(input.estimatedUsd),
    now,
    now,
  );
  return listHouseholdAssets(db).find((a) => a.id === id)!;
}

export function deleteHouseholdAsset(db: Database.Database, id: string): void {
  const tenantId = requireTenant(db);
  const info = db
    .prepare(`DELETE FROM household_asset WHERE id = ? AND tenant_id = ?`)
    .run(id, tenantId);
  if (info.changes === 0) throw new Error("asset not found");
}

/**
 * HITL: promote a discover asset hint into household_asset.
 * Does not create a funding account. Does not store the source document.
 *
 * Bills with an amount stay in the queue so `confirmBillIngest` still works.
 * Asset-only notices (no bill amount) are marked promoted so they leave discover.
 */
export function confirmAssetHint(
  db: Database.Database,
  eventId: string,
  overrides?: { label?: string; estimatedUsd?: number | null; notes?: string },
): HouseholdAsset {
  const existing = getHouseholdAssetByEventId(db, eventId);
  if (existing) throw new Error("asset hint already confirmed for this event");

  const event = getIngestedEventById(db, eventId);
  if (!event) throw new Error("ingest event not found");
  if (event.kind === "statement") {
    throw new Error("statement is a connect hint — cannot confirm as an asset");
  }

  const payload = parseBillPayload(event);
  const blob = `${payload.payee} ${payload.filename} ${payload.rawText ?? ""}`;
  if (isPhiHaystack(blob)) {
    throw new Error("PHI-looking mail stays unpromoted");
  }

  const hint = inferAssetHint({
    payee: payload.payee,
    filename: payload.filename,
    rawText: payload.rawText,
  });
  if (!hint) {
    throw new Error("no home/vehicle hint on this event — use assets create");
  }

  const tenantId = requireTenant(db);
  const now = new Date().toISOString();
  const id = randomUUID();
  const label = overrides?.label?.trim() || hint.label;
  db.prepare(
    `INSERT INTO household_asset
      (id, tenant_id, kind, label, notes, estimated_usd, ingested_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    hint.kind,
    label,
    overrides?.notes?.trim() || null,
    assertEstimate(overrides?.estimatedUsd),
    eventId,
    now,
    now,
  );

  const isBill =
    Number.isFinite(payload.amountUsd) &&
    payload.amountUsd > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate);
  if (!isBill) markEventPromoted(db, eventId);

  return getHouseholdAssetByEventId(db, eventId)!;
}
