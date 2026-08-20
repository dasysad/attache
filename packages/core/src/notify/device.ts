/**
 * Android FCM device registry (BL-6 / VS-10 P0).
 *
 * What: persist FCM tokens the companion app posts to POST /devices/register.
 * Why: ADR-005 mobile reader needs a local API before any Kotlin app exists.
 * How: upsert on (tenant, fcm_token); P0 platform is android only.
 * Honesty: register ≠ delivery. Delivery needs ATTACHE_FCM=sandbox|live.
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getTenant, isOnboarded } from "../tenant.js";

export type PushDevicePlatform = "android";

export interface PushDevice {
  id: string;
  tenantId: string;
  platform: PushDevicePlatform;
  fcmToken: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterPushDeviceInput {
  fcmToken: string;
  platform?: string;
  label?: string;
}

interface DeviceRow {
  id: string;
  tenant_id: string;
  platform: string;
  fcm_token: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

function requireTenant(db: Database.Database) {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  const tenant = getTenant(db);
  if (!tenant) throw new Error("tenant not found");
  return tenant;
}

function mapRow(row: DeviceRow): PushDevice {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    platform: row.platform as PushDevicePlatform,
    fcmToken: row.fcm_token,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Spec v1 is Android-only; iOS/web tokens belong on other channels. */
export function parsePushDevicePlatform(raw: string | undefined): PushDevicePlatform {
  const value = (raw ?? "android").trim().toLowerCase();
  if (value === "android") return "android";
  throw new Error(
    `unsupported push platform "${raw ?? ""}"; P0 registers android FCM tokens only`,
  );
}

/**
 * Upsert a companion FCM token.
 * How: same token + tenant updates label/updated_at (WorkManager refresh).
 */
export function registerPushDevice(
  db: Database.Database,
  input: RegisterPushDeviceInput,
): PushDevice {
  const tenant = requireTenant(db);
  const token = input.fcmToken.trim();
  if (!token) throw new Error("fcm_token is required");
  const platform = parsePushDevicePlatform(input.platform);
  const label = input.label?.trim() || null;
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      `SELECT * FROM push_device WHERE tenant_id = ? AND fcm_token = ?`,
    )
    .get(tenant.id, token) as DeviceRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE push_device SET platform = ?, label = ?, updated_at = ? WHERE id = ?`,
    ).run(platform, label, now, existing.id);
    return getPushDevice(db, existing.id)!;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO push_device
      (id, tenant_id, platform, fcm_token, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, tenant.id, platform, token, label, now, now);
  return getPushDevice(db, id)!;
}

export function listPushDevices(db: Database.Database): PushDevice[] {
  const tenant = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT * FROM push_device WHERE tenant_id = ? ORDER BY created_at ASC`,
    )
    .all(tenant.id) as DeviceRow[];
  return rows.map(mapRow);
}

export function getPushDevice(
  db: Database.Database,
  id: string,
): PushDevice | null {
  const row = db
    .prepare(`SELECT * FROM push_device WHERE id = ?`)
    .get(id) as DeviceRow | undefined;
  return row ? mapRow(row) : null;
}

/** Remove a token (app uninstall / user unlink). Does not revoke FCM server-side. */
export function unlinkPushDevice(
  db: Database.Database,
  id: string,
): PushDevice | null {
  requireTenant(db);
  const existing = getPushDevice(db, id);
  if (!existing) return null;
  db.prepare(`DELETE FROM push_device WHERE id = ?`).run(id);
  return existing;
}
