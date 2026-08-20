/**
 * Agent-readable ledger backend status (BL-11).
 *
 * WHAT: which adapter, replica address, and a bounded ping when TB is selected.
 * WHY: `attache ledger status` / MCP `ledger_status` must fail loudly if the
 *      replica is down — not hang the agent.
 */
import type { TigerBeetleClient } from "./client.js";
import { ledgerBackendFromEnv, tigerbeetleConfigFromEnv } from "./config.js";
import { LiveTigerBeetleClient } from "./live-client.js";

export interface LedgerStatus {
  backend: "sqlite" | "tigerbeetle";
  replicaRequired: boolean;
  replicaAddress: string | null;
  clusterId: string | null;
  reachable: boolean | null;
  error: string | null;
}

const PING_MS = 2000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`TigerBeetle ping timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function pingTigerBeetle(client: TigerBeetleClient): Promise<void> {
  await client.lookupAccounts([1n]);
}

export async function ledgerStatus(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    ping?: (client: TigerBeetleClient) => Promise<void>;
    client?: TigerBeetleClient;
  } = {},
): Promise<LedgerStatus> {
  const backend = ledgerBackendFromEnv(env);
  if (backend === "sqlite") {
    return {
      backend,
      replicaRequired: false,
      replicaAddress: null,
      clusterId: null,
      reachable: null,
      error: null,
    };
  }

  const cfg = tigerbeetleConfigFromEnv(env);
  const base: LedgerStatus = {
    backend,
    replicaRequired: true,
    replicaAddress: cfg.address,
    clusterId: cfg.clusterId.toString(),
    reachable: false,
    error: null,
  };

  const owned = !options.client;
  const client =
    options.client ??
    new LiveTigerBeetleClient({
      clusterId: cfg.clusterId,
      replicaAddresses: [cfg.address],
    });
  const doPing = options.ping ?? pingTigerBeetle;
  try {
    await withTimeout(doPing(client), PING_MS);
    return { ...base, reachable: true };
  } catch (e) {
    return {
      ...base,
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (owned && client.destroy) client.destroy();
  }
}
