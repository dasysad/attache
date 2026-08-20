import { Snaptrade, SnaptradeAuth } from "snaptrade-typescript-sdk";
import type { SnapTradeConnection } from "../domain.js";
import { loadSnapTradeConfig } from "./config.js";
import type {
  SnapTradeIngestPort,
  SnapTradeLinkedAccount,
  SnapTradePosition,
  SnapTradeSyncSnapshot,
} from "./port.js";

type CommercialSnaptrade = Snaptrade<ReturnType<typeof SnaptradeAuth.commercialApiKey>>;

/**
 * Live SnapTrade adapter — Connection Portal + account balances (BL-5).
 *
 * WHAT: commercial API key mode (userId + userSecret per household).
 * HOW: registerSnapTradeUser once; loginSnapTradeUser for portal URL; list accounts.
 * WHY: premium read-only brokerage ingest (ADR-004 / ADR-006).
 */
export class LiveSnapTradeAdapter implements SnapTradeIngestPort {
  readonly mode = "live" as const;
  private client: CommercialSnaptrade | null = null;

  private getClient(): CommercialSnaptrade {
    if (!this.client) {
      const cfg = loadSnapTradeConfig();
      this.client = new Snaptrade({
        auth: SnaptradeAuth.commercialApiKey({
          clientId: cfg.clientId,
          consumerKey: cfg.consumerKey,
        }),
      });
    }
    return this.client;
  }

  async ensureUser(input: {
    externalUserId: string;
    existingUserSecret?: string | null;
  }): Promise<{
    externalUserId: string;
    userSecret: string;
    portalUrl: string | null;
  }> {
    const client = this.getClient();
    let userSecret = input.existingUserSecret ?? null;
    if (!userSecret) {
      try {
        const registered = await client.authentication.registerSnapTradeUser({
          userId: input.externalUserId,
        });
        userSecret = registered.data.userSecret ?? null;
      } catch (e) {
        throw new Error(
          `SnapTrade register failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (!userSecret) throw new Error("SnapTrade userSecret missing");

    const login = await client.authentication.loginSnapTradeUser({
      userId: input.externalUserId,
      userSecret,
    });
    const portalUrl =
      typeof login.data === "object" && login.data && "redirectURI" in login.data
        ? String((login.data as { redirectURI?: string }).redirectURI ?? "")
        : null;

    return {
      externalUserId: input.externalUserId,
      userSecret,
      portalUrl: portalUrl || null,
    };
  }

  async fetchSnapshot(
    connection: SnapTradeConnection,
    userSecret: string,
  ): Promise<SnapTradeSyncSnapshot> {
    const client = this.getClient();
    const accountsRes = await client.accountInformation.listUserAccounts({
      userId: connection.externalUserId,
      userSecret,
    });
    const rawAccounts = accountsRes.data ?? [];
    const accounts: SnapTradeLinkedAccount[] = [];
    const positions: SnapTradePosition[] = [];
    let brokerageName = connection.brokerageName ?? "Brokerage";

    for (const acct of rawAccounts) {
      const id = acct.id;
      if (!id) continue;
      const name = acct.name ?? acct.number ?? "Brokerage account";
      const institution =
        (acct as { institution_name?: string }).institution_name ?? brokerageName;
      brokerageName = institution;

      let balanceUsd = 0;
      try {
        const bal = await client.accountInformation.getUserAccountBalance({
          accountId: id,
          userId: connection.externalUserId,
          userSecret,
        });
        const rows = Array.isArray(bal.data) ? bal.data : [];
        for (const row of rows) {
          const cash = Number(
            (row as { cash?: number | string }).cash ??
              (row as { total?: { amount?: number } }).total?.amount ??
              0,
          );
          if (Number.isFinite(cash)) balanceUsd += cash;
        }
      } catch {
        /* balance optional */
      }

      try {
        const pos = await client.accountInformation.getAllAccountPositions({
          accountId: id,
          userId: connection.externalUserId,
          userSecret,
        });
        const results = (pos.data as { results?: unknown[] } | undefined)?.results;
        const rows = Array.isArray(results)
          ? results
          : Array.isArray(pos.data)
            ? pos.data
            : [];
        for (const p of rows) {
          const row = p as Record<string, unknown>;
          const instrument = row.instrument as
            | { symbol?: string; raw_symbol?: string }
            | undefined;
          const symbol =
            instrument?.raw_symbol ??
            instrument?.symbol ??
            (row.symbol as { raw_symbol?: string; symbol?: string } | undefined)
              ?.raw_symbol ??
            "UNKNOWN";
          const units = Number(row.units ?? 0);
          const price = Number(row.price ?? row.average_purchase_price ?? 0);
          const marketValue = Number.isFinite(units * price) ? units * price : 0;
          balanceUsd += marketValue;
          positions.push({
            symbol: String(symbol),
            units,
            priceUsd: price,
            marketValueUsd: marketValue,
            snaptradeAccountId: id,
          });
        }
      } catch {
        /* positions optional */
      }

      accounts.push({
        snaptradeAccountId: id,
        name: String(name),
        number: acct.number ?? null,
        balanceUsd,
        brokerageName: institution,
      });
    }

    return { accounts, positions, brokerageName };
  }
}
