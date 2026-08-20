/**
 * LedgerPort factory (ADR-001 P1).
 *
 * WHAT: default SQLite; ATTACHE_LEDGER=tigerbeetle → live Node client.
 * WHY: tests inject FakeTigerBeetleClient via setLedgerForTests; production
 *      never silently swaps backends.
 */
import type { LedgerPort } from "./port.js";
import { ledgerBackendFromEnv, tigerbeetleConfigFromEnv } from "./config.js";
import { LiveTigerBeetleClient } from "./live-client.js";
import { SqliteLedgerAdapter } from "./sqlite-adapter.js";
import { TigerBeetleLedgerAdapter } from "./tb-adapter.js";

let defaultLedger: LedgerPort | null = null;
let liveClient: LiveTigerBeetleClient | null = null;

export function createLedgerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LedgerPort {
  const backend = ledgerBackendFromEnv(env);
  if (backend === "sqlite") return new SqliteLedgerAdapter();
  const cfg = tigerbeetleConfigFromEnv(env);
  liveClient = new LiveTigerBeetleClient({
    clusterId: cfg.clusterId,
    replicaAddresses: [cfg.address],
  });
  return new TigerBeetleLedgerAdapter(liveClient);
}

export function getLedger(): LedgerPort {
  if (!defaultLedger) defaultLedger = createLedgerFromEnv();
  return defaultLedger;
}

export function setLedgerForTests(ledger: LedgerPort | null): void {
  defaultLedger = ledger;
}

export function destroyLiveLedgerClient(): void {
  liveClient?.destroy();
  liveClient = null;
  defaultLedger = null;
}
