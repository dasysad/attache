/**
 * FcmPort factory (BL-6).
 *
 * WHAT: off → null; sandbox → fake; live → HTTP with server key.
 * WHY: tests inject FakeFcmAdapter via setFcmForTests; production never
 *      silently enables Google push.
 */
import { fcmBackendFromEnv, fcmServerKeyFromEnv } from "./config.js";
import { FakeFcmAdapter } from "./fake-adapter.js";
import { LiveFcmAdapter } from "./live-adapter.js";
import type { FcmPort } from "./port.js";

let defaultFcm: FcmPort | null | undefined;

export function createFcmAdapter(
  env: NodeJS.ProcessEnv = process.env,
): FcmPort | null {
  const backend = fcmBackendFromEnv(env);
  if (backend === "off") return null;
  if (backend === "sandbox") return new FakeFcmAdapter();
  const key = fcmServerKeyFromEnv(env);
  if (!key) {
    throw new Error("ATTACHE_FCM=live requires ATTACHE_FCM_SERVER_KEY");
  }
  const endpoint = env.ATTACHE_FCM_ENDPOINT?.trim() || undefined;
  return new LiveFcmAdapter(key, endpoint);
}

export function getFcm(): FcmPort | null {
  if (defaultFcm === undefined) defaultFcm = createFcmAdapter();
  return defaultFcm;
}

export function setFcmForTests(fcm: FcmPort | null | undefined): void {
  defaultFcm = fcm;
}
