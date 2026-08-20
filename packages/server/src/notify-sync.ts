/**
 * Server-side notification sync — refresh + optional push fan-out.
 */
import {
  countUnreadNotifications,
  countPendingTransferProposals,
  deliverFcmForNotification,
  getFcm,
  listNotifications,
  openDatabase,
  refreshNotifications,
} from "@attache/core";
import { setNavUnreadCount, setTransferPendingCount } from "./views.js";
import { deliverPushForNotification, isPushConfigured } from "./push.js";

type AttacheDb = ReturnType<typeof openDatabase>;

export function syncNotificationsSync(db: AttacheDb): void {
  const result = refreshNotifications(db);
  setNavUnreadCount(countUnreadNotifications(db));
  setTransferPendingCount(countPendingTransferProposals(db));
  if (result.created <= 0) return;
  const fresh = listNotifications(db, { unreadOnly: true, limit: result.created });
  if (isPushConfigured()) {
    void Promise.all(fresh.map((n) => deliverPushForNotification(db, n)));
  }
  try {
    const fcm = getFcm();
    if (fcm) {
      void Promise.all(fresh.map((n) => deliverFcmForNotification(db, n, fcm)));
    }
  } catch {
    // ATTACHE_FCM=live without a server key — skip fan-out; tokens stay stored.
  }
}
