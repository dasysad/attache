/**
 * Notification model — ADR-005.
 * What: persisted household alerts for in-app, web push, and agent tools.
 * Why: solvency, obligations, and HITL ingest share one store.
 */

export type NotificationSeverity = "info" | "warning" | "action_required";

export type NotificationKind =
  | "solvency"
  | "obligation"
  | "hitl_transfer"
  | "ingestion_review"
  | "merge"
  | "system";

export interface Notification {
  id: string;
  tenantId: string;
  memberId: string | null;
  severity: NotificationSeverity;
  kind: NotificationKind;
  /** Stable key for upsert — e.g. `solvency:low_runway`. */
  dedupeKey: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: string | null;
  channelsDelivered: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNotificationInput {
  severity: NotificationSeverity;
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  body: string;
  actionUrl?: string;
  memberId?: string;
}

export interface ListNotificationsOptions {
  /** ISO timestamp — return notifications created after this instant. */
  since?: string;
  unreadOnly?: boolean;
  limit?: number;
}

export interface PushSubscriptionRecord {
  id: string;
  tenantId: string;
  endpoint: string;
  keysJson: string;
  userAgent: string | null;
  createdAt: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}
