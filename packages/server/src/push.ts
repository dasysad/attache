/**
 * Web push delivery — optional VAPID (VS-6).
 * What: sends browser push when new notifications are created.
 * Why: ADR-005 primary human channel includes web push; skipped without keys.
 */
import webpush from "web-push";
import {
  appendChannelDelivered,
  listPushSubscriptions,
  openDatabase,
  type Notification,
} from "@attache/core";

type AttacheDb = ReturnType<typeof openDatabase>;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.ATTACHE_VAPID_PUBLIC_KEY &&
      process.env.ATTACHE_VAPID_PRIVATE_KEY,
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.ATTACHE_VAPID_PUBLIC_KEY ?? null;
}

function configureWebPush(): boolean {
  const publicKey = process.env.ATTACHE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.ATTACHE_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.ATTACHE_VAPID_SUBJECT ?? "mailto:alerts@localhost",
    publicKey,
    privateKey,
  );
  return true;
}

export async function deliverPushForNotification(
  db: AttacheDb,
  notification: Notification,
): Promise<number> {
  if (!configureWebPush()) return 0;
  const subs = listPushSubscriptions(db);
  if (!subs.length) return 0;

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.actionUrl ?? "/app/notifications",
    id: notification.id,
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      const keys = JSON.parse(sub.keysJson) as { p256dh: string; auth: string };
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys,
        },
        payload,
      );
      sent += 1;
    } catch (err) {
      console.error("push delivery failed", sub.endpoint, err);
    }
  }

  if (sent > 0) {
    appendChannelDelivered(db, notification.id, "web_push");
  }
  return sent;
}
