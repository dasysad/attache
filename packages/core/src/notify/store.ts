import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getTenant, isOnboarded } from "../tenant.js";
import type {
  ListNotificationsOptions,
  Notification,
  PushSubscriptionInput,
  PushSubscriptionRecord,
  UpsertNotificationInput,
} from "./types.js";

function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    memberId: row.member_id ? String(row.member_id) : null,
    severity: row.severity as Notification["severity"],
    kind: row.kind as Notification["kind"],
    dedupeKey: String(row.dedupe_key),
    title: String(row.title),
    body: String(row.body),
    actionUrl: row.action_url ? String(row.action_url) : null,
    readAt: row.read_at ? String(row.read_at) : null,
    channelsDelivered: JSON.parse(String(row.channels_delivered ?? "[]")) as string[],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function requireTenant(db: Database.Database) {
  if (!isOnboarded(db)) throw new Error("not onboarded");
  const tenant = getTenant(db);
  if (!tenant) throw new Error("tenant not found");
  return tenant;
}

/**
 * Upsert by dedupe key — refreshes title/body and clears read when content changes.
 * Returns whether a new row was inserted (vs updated).
 */
export function upsertNotification(
  db: Database.Database,
  input: UpsertNotificationInput,
): { notification: Notification; created: boolean } {
  const tenant = requireTenant(db);
  const now = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT id, title, body, severity, read_at FROM notification
       WHERE tenant_id = ? AND dedupe_key = ?`,
    )
    .get(tenant.id, input.dedupeKey) as
    | {
        id: string;
        title: string;
        body: string;
        severity: string;
        read_at: string | null;
      }
    | undefined;

  if (existing) {
    const changed =
      existing.title !== input.title ||
      existing.body !== input.body ||
      existing.severity !== input.severity;
    db.prepare(
      `UPDATE notification
       SET severity = ?, kind = ?, title = ?, body = ?, action_url = ?, member_id = ?,
           read_at = CASE WHEN ? THEN NULL ELSE read_at END,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      input.severity,
      input.kind,
      input.title,
      input.body,
      input.actionUrl ?? null,
      input.memberId ?? null,
      changed ? 1 : 0,
      now,
      existing.id,
    );
    const notification = getNotification(db, existing.id)!;
    return { notification, created: false };
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO notification (
      id, tenant_id, member_id, severity, kind, dedupe_key, title, body,
      action_url, read_at, channels_delivered, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?)`,
  ).run(
    id,
    tenant.id,
    input.memberId ?? null,
    input.severity,
    input.kind,
    input.dedupeKey,
    input.title,
    input.body,
    input.actionUrl ?? null,
    now,
    now,
  );
  return { notification: getNotification(db, id)!, created: true };
}

/** Remove stale auto-generated alerts whose dedupe keys are no longer active. */
export function clearNotificationsByPrefix(
  db: Database.Database,
  prefix: string,
  keepKeys: Set<string>,
): number {
  const tenant = requireTenant(db);
  const rows = db
    .prepare(
      `SELECT id, dedupe_key FROM notification
       WHERE tenant_id = ? AND dedupe_key LIKE ?`,
    )
    .all(tenant.id, `${prefix}%`) as Array<{ id: string; dedupe_key: string }>;

  let removed = 0;
  for (const row of rows) {
    if (!keepKeys.has(row.dedupe_key)) {
      db.prepare("DELETE FROM notification WHERE id = ?").run(row.id);
      removed += 1;
    }
  }
  return removed;
}

export function getNotification(
  db: Database.Database,
  id: string,
): Notification | null {
  const row = db.prepare("SELECT * FROM notification WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToNotification(row) : null;
}

export function listNotifications(
  db: Database.Database,
  options: ListNotificationsOptions = {},
): Notification[] {
  const tenant = requireTenant(db);
  const clauses = ["tenant_id = ?"];
  const params: unknown[] = [tenant.id];

  if (options.since) {
    clauses.push("created_at > ?");
    params.push(options.since);
  }
  if (options.unreadOnly) {
    clauses.push("read_at IS NULL");
  }

  const limit = options.limit ?? 100;
  const sql = `SELECT * FROM notification WHERE ${clauses.join(" AND ")}
    ORDER BY read_at IS NOT NULL, created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToNotification);
}

export function countUnreadNotifications(db: Database.Database): number {
  const tenant = requireTenant(db);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM notification
       WHERE tenant_id = ? AND read_at IS NULL`,
    )
    .get(tenant.id) as { c: number };
  return row.c;
}

export function markNotificationRead(
  db: Database.Database,
  id: string,
): Notification | null {
  const tenant = requireTenant(db);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE notification SET read_at = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ? AND read_at IS NULL`,
    )
    .run(now, now, id, tenant.id);
  if (!result.changes) return getNotification(db, id);
  return getNotification(db, id);
}

export function markAllNotificationsRead(db: Database.Database): number {
  const tenant = requireTenant(db);
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE notification SET read_at = ?, updated_at = ?
       WHERE tenant_id = ? AND read_at IS NULL`,
    )
    .run(now, now, tenant.id);
  return result.changes;
}

export function appendChannelDelivered(
  db: Database.Database,
  id: string,
  channel: string,
): void {
  const n = getNotification(db, id);
  if (!n || n.channelsDelivered.includes(channel)) return;
  const channels = [...n.channelsDelivered, channel];
  db.prepare(
    `UPDATE notification SET channels_delivered = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify(channels), new Date().toISOString(), id);
}

export function savePushSubscription(
  db: Database.Database,
  input: PushSubscriptionInput,
): PushSubscriptionRecord {
  const tenant = requireTenant(db);
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id FROM push_subscription WHERE endpoint = ?")
    .get(input.endpoint) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE push_subscription SET keys_json = ?, user_agent = ?, tenant_id = ? WHERE id = ?`,
    ).run(
      JSON.stringify(input.keys),
      input.userAgent ?? null,
      tenant.id,
      existing.id,
    );
    return getPushSubscription(db, existing.id)!;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO push_subscription (id, tenant_id, endpoint, keys_json, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenant.id,
    input.endpoint,
    JSON.stringify(input.keys),
    input.userAgent ?? null,
    now,
  );
  return getPushSubscription(db, id)!;
}

export function listPushSubscriptions(db: Database.Database): PushSubscriptionRecord[] {
  const tenant = requireTenant(db);
  const rows = db
    .prepare("SELECT * FROM push_subscription WHERE tenant_id = ?")
    .all(tenant.id) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    endpoint: String(row.endpoint),
    keysJson: String(row.keys_json),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  }));
}

function getPushSubscription(
  db: Database.Database,
  id: string,
): PushSubscriptionRecord | null {
  const row = db.prepare("SELECT * FROM push_subscription WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    endpoint: String(row.endpoint),
    keysJson: String(row.keys_json),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    createdAt: String(row.created_at),
  };
}
