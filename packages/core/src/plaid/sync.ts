import type Database from "better-sqlite3";
import {
  markEventPromoted,
  upsertIngestedEvent,
} from "../ingest/event.js";
import type { PlaidIngestPort } from "../ingest/plaid-port.js";
import { findAccountByPlaidId, upsertPlaidFundingAccount } from "../account.js";
import type { VaultPort } from "../vault/local-vault.js";
import {
  createPlaidItem,
  getPlaidItem,
  listPlaidItems,
  markPlaidItemError,
  touchPlaidItemSync,
  upsertBankTransaction,
} from "./store.js";
import { PlaidError, plaidErrorHelp } from "./errors.js";
import type { LivePlaidAdapter } from "../ingest/live-plaid-adapter.js";
import { getTenant } from "../tenant.js";

export interface SyncResult {
  itemId: string;
  accountsUpdated: number;
  transactionsNew: number;
  transactionsSkipped: number;
  /** Set when this item failed; other items may still have synced. */
  error?: string;
}

/**
 * Connect sandbox Plaid item — no Link UI, for local dogfood.
 * Stores access token in vault; creates linked funding accounts; runs initial sync.
 */
export async function connectSandboxPlaid(
  db: Database.Database,
  adapter: PlaidIngestPort,
  vault: VaultPort,
): Promise<{ itemId: string; sync: SyncResult }> {
  const accessToken = `sandbox_access_${Date.now()}`;
  const institution = await adapter.institutionName(accessToken);
  const externalItemId = `sandbox_item_${Date.now()}`;
  const vaultRef = `plaid/item/${externalItemId}`;
  vault.set(vaultRef, accessToken);

  const item = createPlaidItem(db, {
    externalItemId,
    institutionName: institution,
    vaultCredentialRef: vaultRef,
  });

  const sync = await syncPlaidItem(db, item.id, adapter, vault);
  return { itemId: item.id, sync };
}

/**
 * Connect a live Plaid item from a Link public_token.
 * Agents obtain public_token via Link UI or sandbox Plaid Link tester.
 */
export async function connectLivePlaid(
  db: Database.Database,
  adapter: LivePlaidAdapter,
  vault: VaultPort,
  publicToken: string,
): Promise<{ itemId: string; sync: SyncResult }> {
  const exchanged = await adapter.exchangePublicToken(publicToken);
  const vaultRef = `plaid/item/${exchanged.externalItemId}`;
  vault.set(vaultRef, exchanged.accessToken);

  const item = createPlaidItem(db, {
    externalItemId: exchanged.externalItemId,
    institutionName: exchanged.institutionName,
    vaultCredentialRef: vaultRef,
  });

  const sync = await syncPlaidItem(db, item.id, adapter, vault);
  return { itemId: item.id, sync };
}

/** Create a Link token for the current tenant (live adapter only). */
export async function createPlaidLinkToken(
  db: Database.Database,
  adapter: LivePlaidAdapter,
  redirectUri?: string,
): Promise<{ linkToken: string; expiration: string }> {
  const tenant = getTenant(db);
  if (!tenant) throw new Error("not onboarded");
  return adapter.createLinkToken(tenant.id, redirectUri);
}

/**
 * Sync every active (or error) Plaid item. Per-item failures are captured on
 * the result row instead of aborting the whole batch — agents/UI can show which
 * links need re-auth.
 */
export async function syncAllPlaidItems(
  db: Database.Database,
  adapter: PlaidIngestPort,
  vault: VaultPort,
): Promise<SyncResult[]> {
  const items = listPlaidItems(db).filter(
    (i) => i.status === "active" || i.status === "error",
  );
  const results: SyncResult[] = [];
  for (const item of items) {
    try {
      results.push(await syncPlaidItem(db, item.id, adapter, vault));
    } catch (e) {
      results.push({
        itemId: item.id,
        accountsUpdated: 0,
        transactionsNew: 0,
        transactionsSkipped: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export async function syncPlaidItem(
  db: Database.Database,
  itemId: string,
  adapter: PlaidIngestPort,
  vault: VaultPort,
): Promise<SyncResult> {
  const item = getPlaidItem(db, itemId);
  if (!item) throw new Error(`plaid item not found: ${itemId}`);

  const accessToken = vault.get(item.vaultCredentialRef);
  if (!accessToken) {
    markPlaidItemError(db, itemId, "INVALID_ACCESS_TOKEN", "Vault credential missing");
    throw new Error(`vault credential missing: ${item.vaultCredentialRef}`);
  }

  let snapshot;
  try {
    snapshot = await adapter.fetchSnapshot(accessToken);
  } catch (e) {
    if (e instanceof PlaidError) {
      markPlaidItemError(db, itemId, e.code, e.message);
      throw new Error(plaidErrorHelp(e));
    }
    throw e;
  }
  let accountsUpdated = 0;
  let transactionsNew = 0;
  let transactionsSkipped = 0;

  for (const acct of snapshot.accounts) {
    upsertPlaidFundingAccount(db, {
      plaidItemId: item.id,
      institution: item.institutionName,
      account: acct,
    });
    accountsUpdated += 1;

    upsertIngestedEvent(db, {
      source: "plaid",
      kind: "balance",
      externalId: `balance:${acct.plaidAccountId}`,
      payload: {
        plaidAccountId: acct.plaidAccountId,
        balanceUsd: acct.balanceUsd,
      },
    });
  }

  for (const tx of snapshot.transactions) {
    const funding = findAccountByPlaidId(db, tx.plaidAccountId);
    if (!funding) continue;

    const event = upsertIngestedEvent(db, {
      source: "plaid",
      kind: "transaction",
      externalId: tx.transactionId,
      fundingAccountId: funding.id,
      payload: tx,
    });

    if (event.promotedAt) {
      transactionsSkipped += 1;
      continue;
    }

    upsertBankTransaction(db, {
      fundingAccountId: funding.id,
      ingestedEventId: event.id,
      externalId: tx.transactionId,
      payee: tx.payee,
      amountUsd: tx.amountUsd,
      postedDate: tx.date,
      pending: tx.pending,
      category: tx.category,
    });
    markEventPromoted(db, event.id);
    transactionsNew += 1;
  }

  touchPlaidItemSync(db, itemId);

  return {
    itemId,
    accountsUpdated,
    transactionsNew,
    transactionsSkipped,
  };
}

/** Resolve account display name for transaction rows. */
export function accountLabelForTransaction(
  db: Database.Database,
  fundingAccountId: string,
): string {
  const row = db
    .prepare(`SELECT name, mask FROM funding_account WHERE id = ?`)
    .get(fundingAccountId) as { name: string; mask: string | null } | undefined;
  if (!row) return "";
  return row.mask ? `${row.name} ···${row.mask}` : row.name;
}
