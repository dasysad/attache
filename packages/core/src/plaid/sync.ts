import type Database from "better-sqlite3";
import {
  markEventPromoted,
  parseTransactionPayload,
  upsertIngestedEvent,
} from "../ingest/event.js";
import type { PlaidIngestPort } from "../ingest/plaid-port.js";
import { findAccountByPlaidId, upsertPlaidFundingAccount } from "../account.js";
import type { VaultPort } from "../vault/local-vault.js";
import {
  createPlaidItem,
  getPlaidItem,
  listPlaidItems,
  touchPlaidItemSync,
  upsertBankTransaction,
} from "./store.js";

export interface SyncResult {
  itemId: string;
  accountsUpdated: number;
  transactionsNew: number;
  transactionsSkipped: number;
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

/** Sync every active Plaid item for the current tenant. */
export async function syncAllPlaidItems(
  db: Database.Database,
  adapter: PlaidIngestPort,
  vault: VaultPort,
): Promise<SyncResult[]> {
  const items = listPlaidItems(db).filter((i) => i.status === "active");
  const results: SyncResult[] = [];
  for (const item of items) {
    results.push(await syncPlaidItem(db, item.id, adapter, vault));
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
    throw new Error(`vault credential missing: ${item.vaultCredentialRef}`);
  }

  const snapshot = await adapter.fetchSnapshot(accessToken);
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
