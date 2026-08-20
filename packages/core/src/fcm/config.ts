/**
 * FCM backend selection (BL-6).
 *
 * WHAT: ATTACHE_FCM=off (default) | sandbox | live.
 * WHY: default off keeps local-first dogfood from talking to Google; agents
 *      opt in the same way as ATTACHE_ACH.
 */
export type FcmBackend = "off" | "sandbox" | "live";

export function fcmBackendFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FcmBackend {
  const raw = env.ATTACHE_FCM?.trim().toLowerCase();
  if (!raw || raw === "off" || raw === "false" || raw === "0") return "off";
  if (raw === "sandbox") return "sandbox";
  if (raw === "live" || raw === "fcm") return "live";
  throw new Error(
    `Unknown ATTACHE_FCM=${raw}; use off (default), sandbox, or live`,
  );
}

export function isFcmEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return fcmBackendFromEnv(env) !== "off";
}

export function fcmServerKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = env.ATTACHE_FCM_SERVER_KEY?.trim();
  return key ? key : null;
}
