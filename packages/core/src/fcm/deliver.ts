/**
 * Fan-out household notifications to registered Android devices (BL-6).
 *
 * What: iterate push_device tokens and call FcmPort.send.
 * Why: notify-sync already fans web push; FCM is the mobile sibling.
 * How: one failed token does not abort the rest; mark channel `fcm` if any ok.
 */
import type Database from "better-sqlite3";
import { appendChannelDelivered } from "../notify/store.js";
import type { Notification } from "../notify/types.js";
import { listPushDevices } from "../notify/device.js";
import { getFcm } from "./create-adapter.js";
import type { FcmPort } from "./port.js";

export async function deliverFcmForNotification(
  db: Database.Database,
  notification: Notification,
  adapter: FcmPort | null = getFcm(),
): Promise<number> {
  if (!adapter) return 0;
  const devices = listPushDevices(db);
  if (!devices.length) return 0;

  let sent = 0;
  for (const device of devices) {
    const result = await adapter.send(device.fcmToken, {
      title: notification.title,
      body: notification.body,
      notificationId: notification.id,
      actionUrl: notification.actionUrl,
    });
    if (result.ok) sent += 1;
  }
  if (sent > 0) {
    appendChannelDelivered(db, notification.id, "fcm");
  }
  return sent;
}
