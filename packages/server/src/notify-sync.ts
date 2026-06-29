/**
 * Server-side notification sync — refresh + optional push fan-out.
 */
import {
  countUnreadNotifications,
  countPendingTransferProposals,
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
  if (result.created > 0 && isPushConfigured()) {
    const fresh = listNotifications(db, { unreadOnly: true, limit: result.created });
    void Promise.all(fresh.map((n) => deliverPushForNotification(db, n)));
  }
}
