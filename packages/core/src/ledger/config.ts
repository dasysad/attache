/**
 * Ledger backend selection (ADR-001 P1).
 *
 * WHAT: ATTACHE_LEDGER=sqlite (default) | tigerbeetle; replica address + cluster.
 * WHY: dogfood stays zero-ops; TB is explicit so agents never silently skip it.
 */
export type LedgerBackend = "sqlite" | "tigerbeetle";

export interface TigerBeetleEnvConfig {
  address: string;
  clusterId: bigint;
}

export function ledgerBackendFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LedgerBackend {
  const raw = env.ATTACHE_LEDGER?.trim().toLowerCase();
  if (!raw || raw === "sqlite") return "sqlite";
  if (raw === "tigerbeetle" || raw === "tb") return "tigerbeetle";
  throw new Error(
    `Unknown ATTACHE_LEDGER=${raw}; use sqlite (default) or tigerbeetle`,
  );
}

export function tigerbeetleConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TigerBeetleEnvConfig {
  const address = env.ATTACHE_TB_ADDRESS?.trim() || "3000";
  const clusterRaw = env.ATTACHE_TB_CLUSTER_ID?.trim() || "0";
  let clusterId: bigint;
  try {
    clusterId = BigInt(clusterRaw);
  } catch {
    throw new Error(`ATTACHE_TB_CLUSTER_ID must be an integer, got ${clusterRaw}`);
  }
  return { address, clusterId };
}
