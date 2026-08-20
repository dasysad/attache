import type Database from "better-sqlite3";
import type { VaultPort } from "../vault/local-vault.js";
import {
  getSnapTradeConnection,
  listAccountsForSnapTradeConnection,
} from "./store.js";

export interface UnlinkSnapTradeResult {
  connectionId: string;
  label: string;
  accountsRemoved: number;
  vaultCleared: boolean;
}

/**
 * Disconnect SnapTrade: vault secret + linked brokerage funding accounts + row.
 * Blocks when pending transfer proposals reference those accounts.
 */
export function unlinkSnapTradeConnection(
  db: Database.Database,
  connectionId: string,
  vault: VaultPort,
): UnlinkSnapTradeResult {
  const connection = getSnapTradeConnection(db, connectionId);
  if (!connection) throw new Error("snaptrade connection not found");

  const accounts = listAccountsForSnapTradeConnection(db, connectionId);
  const accountIds = accounts.map((a) => a.id);

  if (accountIds.length) {
    const placeholders = accountIds.map(() => "?").join(",");
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS c FROM transfer_proposal
         WHERE status = 'pending'
           AND (from_account_id IN (${placeholders})
                OR to_account_id IN (${placeholders}))`,
      )
      .get(...accountIds, ...accountIds) as { c: number };
    if (pending.c > 0) {
      throw new Error(
        "cannot unlink — pending transfer proposals reference linked accounts (approve or reject first)",
      );
    }
  }

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM snaptrade_position WHERE connection_id = ?`).run(
      connectionId,
    );
    for (const accountId of accountIds) {
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
    db.prepare(`DELETE FROM snaptrade_connection WHERE id = ?`).run(connectionId);
  });
  run();

  let vaultCleared = false;
  try {
    vault.delete(connection.vaultCredentialRef);
    vaultCleared = true;
  } catch {
    /* missing ok */
  }

  return {
    connectionId: connection.id,
    label: connection.label,
    accountsRemoved: accountIds.length,
    vaultCleared,
  };
}
