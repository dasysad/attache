/**
 * In-memory FCM stand-in (BL-6 P0).
 *
 * WHAT: records send() calls; never talks to Google.
 * WHY: device register + notify-sync tests without a Firebase project.
 */
import type { FcmPayload, FcmPort, FcmSendResult } from "./port.js";

export interface RecordedFcmSend {
  token: string;
  payload: FcmPayload;
}

export class FakeFcmAdapter implements FcmPort {
  readonly mode = "sandbox" as const;
  readonly sends: RecordedFcmSend[] = [];
  /** Tokens that should fail — negative tests for fan-out skip. */
  readonly failTokens = new Set<string>();

  async send(token: string, payload: FcmPayload): Promise<FcmSendResult> {
    if (!token.trim()) {
      return { ok: false, error: "empty FCM token" };
    }
    if (this.failTokens.has(token)) {
      return { ok: false, error: "sandbox FCM rejected token" };
    }
    this.sends.push({ token, payload });
    return { ok: true, messageId: `sandbox-fcm-${this.sends.length}` };
  }
}
