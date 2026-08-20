import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { VaultPort } from "../vault/local-vault.js";
import { getTenant } from "../tenant.js";
import { upsertSnapTradeFundingAccount } from "../account.js";
import type { SnapTradeIngestPort } from "./port.js";
import {
  createSnapTradeConnection,
  getSnapTradeConnection,
  listSnapTradeConnections,
  markSnapTradeConnectionError,
  replaceSnapTradePositions,
  snaptradeVaultRef,
  touchSnapTradeSync,
} from "./store.js";

export interface SnapTradeSyncResult {
  connectionId: string;
  accountsUpdated: number;
  positionCount: number;
  error?: string;
}

/**
 * Connect sandbox SnapTrade user — no portal, for local dogfood.
 */
export async function connectSandboxSnapTrade(
  db: Database.Database,
  adapter: SnapTradeIngestPort,
  vault: VaultPort,
): Promise<{ connectionId: string; sync: SnapTradeSyncResult; portalUrl: string | null }> {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");

  const externalUserId = `sandbox_${tenant.id.slice(0, 8)}`;
  const ensured = await adapter.ensureUser({ externalUserId });
  const vaultRef = snaptradeVaultRef(ensured.externalUserId);
  vault.set(vaultRef, ensured.userSecret);

  const connection = createSnapTradeConnection(db, {
    externalUserId: ensured.externalUserId,
    label: "Brokerage (sandbox)",
    vaultCredentialRef: vaultRef,
    brokerageName: "Fidelity (sandbox)",
  });

  const sync = await syncSnapTradeConnection(db, connection.id, adapter, vault);
  return { connectionId: connection.id, sync, portalUrl: ensured.portalUrl };
}

/**
 * Live connect: register/login SnapTrade user; return portal URL for Connection Portal.
 * Caller opens portal in browser; then `snaptrade sync` after user finishes linking.
 */
export async function connectLiveSnapTrade(
  db: Database.Database,
  adapter: SnapTradeIngestPort,
  vault: VaultPort,
): Promise<{ connectionId: string; portalUrl: string | null }> {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");

  const externalUserId = `attache_${tenant.id.replace(/-/g, "").slice(0, 24)}`;
  const vaultRef = snaptradeVaultRef(externalUserId);
  const existingSecret = vault.get(vaultRef);

  const ensured = await adapter.ensureUser({
    externalUserId,
    existingUserSecret: existingSecret,
  });
  vault.set(vaultRef, ensured.userSecret);

  const connection = createSnapTradeConnection(db, {
    externalUserId: ensured.externalUserId,
    label: "Brokerage",
    vaultCredentialRef: vaultRef,
  });

  return { connectionId: connection.id, portalUrl: ensured.portalUrl };
}

export async function syncAllSnapTradeConnections(
  db: Database.Database,
  adapter: SnapTradeIngestPort,
  vault: VaultPort,
): Promise<SnapTradeSyncResult[]> {
  const connections = listSnapTradeConnections(db).filter(
    (c) => c.status === "active" || c.status === "error",
  );
  const results: SnapTradeSyncResult[] = [];
  for (const c of connections) {
    try {
      results.push(await syncSnapTradeConnection(db, c.id, adapter, vault));
    } catch (e) {
      results.push({
        connectionId: c.id,
        accountsUpdated: 0,
        positionCount: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export async function syncSnapTradeConnection(
  db: Database.Database,
  connectionId: string,
  adapter: SnapTradeIngestPort,
  vault: VaultPort,
): Promise<SnapTradeSyncResult> {
  const connection = getSnapTradeConnection(db, connectionId);
  if (!connection) throw new Error(`snaptrade connection not found: ${connectionId}`);

  const userSecret = vault.get(connection.vaultCredentialRef);
  if (!userSecret) {
    markSnapTradeConnectionError(db, connectionId, "Vault credential missing");
    throw new Error(`vault credential missing: ${connection.vaultCredentialRef}`);
  }

  let snapshot;
  try {
    snapshot = await adapter.fetchSnapshot(connection, userSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    markSnapTradeConnectionError(db, connectionId, message);
    throw e;
  }

  let accountsUpdated = 0;
  for (const acct of snapshot.accounts) {
    upsertSnapTradeFundingAccount(db, {
      connectionId: connection.id,
      account: acct,
    });
    accountsUpdated += 1;
  }

  replaceSnapTradePositions(db, connection.id, snapshot.positions);

  touchSnapTradeSync(db, connectionId, snapshot.brokerageName);

  return {
    connectionId,
    accountsUpdated,
    positionCount: snapshot.positions.length,
  };
}

/** Stable sandbox user id helper for tests. */
export function newSandboxExternalUserId(): string {
  return `sandbox_${randomUUID().slice(0, 8)}`;
}
