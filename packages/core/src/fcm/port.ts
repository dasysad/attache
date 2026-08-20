/**
 * FCM send port (BL-6 P0).
 *
 * What: one method to fan-out a household notification to a device token.
 * Why: tests inject FakeFcmAdapter; live Google HTTP is opt-in and may fail
 *      on new Firebase projects (legacy server-key API). Companion register
 *      still works with ATTACHE_FCM=off.
 */
export interface FcmPayload {
  title: string;
  body: string;
  notificationId: string;
  actionUrl: string | null;
}

export interface FcmSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export type FcmMode = "sandbox" | "live";

export interface FcmPort {
  readonly mode: FcmMode;
  send(token: string, payload: FcmPayload): Promise<FcmSendResult>;
}
