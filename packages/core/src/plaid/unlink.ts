import type Database from "better-sqlite3";
import type { VaultPort } from "../vault/local-vault.js";
import { getPlaidItem, listAccountsForPlaidItem } from "./store.js";

export interface UnlinkPlaidResult {
  itemId: string;
  institutionName: string;
  accountsRemoved: number;
  transactionsRemoved: number;
  vaultCleared: boolean;
}

/**
 * Disconnect a Plaid item and remove its linked funding accounts.
 *
 * What: vault secret + bank txs + funding accounts + plaid_item row.
 * Why: households must be able to revoke a bank link without orphaning secrets.
 * How: refuse when pending transfer proposals reference linked accounts; detach
 *      ledger_account.funding_account_id so journal history survives; cascade
 *      delete bank_transaction rows then funding_account; delete vault credential.
 */
export function unlinkPlaidItem(
  db: Database.Database,
  itemId: string,
  vault: VaultPort,
): UnlinkPlaidResult {
  const item = getPlaidItem(db, itemId);
  if (!item) throw new Error("plaid item not found");

  const accounts = listAccountsForPlaidItem(db, itemId);
  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length) {
    const placeholders = accountIds.map(() => "?").join(",");
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transfer_proposal
         WHERE status IN ('pending', 'ach_pending')
           AND (from_account_id IN (${placeholders})
                OR to_account_id IN (${placeholders}))`,
      )
      .get(...accountIds, ...accountIds) as { c: number };
    if (pending.c > 0) {
      throw new Error(
        "cannot unlink — pending transfer proposals (or in-flight ACH) reference linked accounts",
      );
    }
  }

  let transactionsRemoved = 0;

  const run = db.transaction(() => {
    for (const accountId of accountIds) {
      const tx = db
        .prepare(`SELECT COUNT(*) AS c FROM bank_transaction WHERE funding_account_id = ?`)
        .get(accountId) as { c: number };
      transactionsRemoved += tx.c;

      db.prepare(`DELETE FROM bank_transaction WHERE funding_account_id = ?`).run(
        accountId,
      );
      db.prepare(
        `UPDATE ingested_event SET funding_account_id = NULL WHERE funding_account_id = ?`,
      ).run(accountId);
      db.prepare(
        `UPDATE ledger_account SET funding_account_id = NULL WHERE funding_account_id = ?`,
      ).run(accountId);
      db.prepare(`DELETE FROM funding_account WHERE id = ?`).run(accountId);
    }

    db.prepare(`DELETE FROM plaid_item WHERE id = ?`).run(itemId);
  });

  run();

  let vaultCleared = false;
  try {
    vault.delete(item.vaultCredentialRef);
    vaultCleared = true;
  } catch {
    /* missing secret is fine — item already gone from SQLite */
  }

  return {
    itemId: item.id,
    institutionName: item.institutionName,
    accountsRemoved: accountIds.length,
    transactionsRemoved,
    vaultCleared,
  };
}
