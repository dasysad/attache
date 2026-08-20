/**
 * Live FCM HTTP adapter (BL-6 P0).
 *
 * WHAT: POST to FCM with a server key (legacy `fcm/send`).
 * WHY: companion dogfood without firebase-admin. New Firebase projects may
 *      reject this API — HTTP v1 / service-account is a follow-on.
 * HOW: ATTACHE_FCM=live + ATTACHE_FCM_SERVER_KEY; optional ATTACHE_FCM_ENDPOINT
 *      override for a local mock.
 */
import type { FcmPayload, FcmPort, FcmSendResult } from "./port.js";

const DEFAULT_ENDPOINT = "https://fcm.googleapis.com/fcm/send";

export class LiveFcmAdapter implements FcmPort {
  readonly mode = "live" as const;

  constructor(
    private readonly serverKey: string,
    private readonly endpoint: string = DEFAULT_ENDPOINT,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(token: string, payload: FcmPayload): Promise<FcmSendResult> {
    if (!token.trim()) return { ok: false, error: "empty FCM token" };
    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `key=${this.serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          notification: { title: payload.title, body: payload.body },
          data: {
            notificationId: payload.notificationId,
            url: payload.actionUrl ?? "/app/notifications",
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          error: `FCM HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
        };
      }
      const json = (await res.json().catch(() => ({}))) as {
        message_id?: number | string;
      };
      return { ok: true, messageId: String(json.message_id ?? "fcm") };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "FCM send failed",
      };
    }
  }
}
