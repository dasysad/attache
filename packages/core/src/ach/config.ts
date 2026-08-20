/**
 * ACH rail selection (ADR-013).
 *
 * WHAT: ATTACHE_ACH=off (default) | sandbox | plaid.
 * WHY: default off keeps slice-5 honesty; agents must opt in so we never
 *      silently submit a rail.
 */
export type AchBackend = "off" | "sandbox" | "plaid";

export function achBackendFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AchBackend {
  const raw = env.ATTACHE_ACH?.trim().toLowerCase();
  if (!raw || raw === "off" || raw === "false" || raw === "0") return "off";
  if (raw === "sandbox") return "sandbox";
  if (raw === "plaid" || raw === "live") return "plaid";
  throw new Error(
    `Unknown ATTACHE_ACH=${raw}; use off (default), sandbox, or plaid`,
  );
}

export function isAchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return achBackendFromEnv(env) !== "off";
}
