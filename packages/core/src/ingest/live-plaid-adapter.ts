import {
  CountryCode,
  PlaidApi,
  Products,
  type AccountBase,
  type Transaction,
} from "plaid";
import type { PlaidIngestPort, PlaidSyncSnapshot } from "../ingest/plaid-port.js";
import type { PlaidLinkedAccount } from "../ingest/plaid-port.js";
import { createPlaidConfiguration, loadPlaidConfig } from "../plaid/config.js";
import { mapPlaidApiError } from "../plaid/errors.js";

/**
 * Live Plaid adapter — real Link + API (v1 hardening slice 3).
 *
 * WHAT: implements PlaidIngestPort against Plaid REST via the official SDK.
 * HOW: access tokens live in vault; this adapter never persists them in SQLite.
 * WHY: sandbox FakePlaidAdapter was dogfood; production keys unlock real bank data.
 */

export interface LinkTokenResult {
  linkToken: string;
  expiration: string;
}

export interface ExchangeTokenResult {
  accessToken: string;
  externalItemId: string;
  institutionName: string;
}

export class LivePlaidAdapter implements PlaidIngestPort {
  readonly mode = "live" as const;
  private readonly client: PlaidApi;

  constructor(client?: PlaidApi) {
    this.client = client ?? new PlaidApi(createPlaidConfiguration(loadPlaidConfig()));
  }

  async createLinkToken(
    clientUserId: string,
    redirectUri?: string,
  ): Promise<LinkTokenResult> {
    try {
      const res = await this.client.linkTokenCreate({
        user: { client_user_id: clientUserId },
        client_name: "Attache",
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: "en",
        ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      });
      return {
        linkToken: res.data.link_token,
        expiration: res.data.expiration,
      };
    } catch (e) {
      throw mapPlaidApiError(e);
    }
  }

  async exchangePublicToken(publicToken: string): Promise<ExchangeTokenResult> {
    try {
      const exchange = await this.client.itemPublicTokenExchange({
        public_token: publicToken,
      });
      const accessToken = exchange.data.access_token;
      const externalItemId = exchange.data.item_id;
      const item = await this.client.itemGet({ access_token: accessToken });
      const institutionId = item.data.item.institution_id;
      let institutionName = "Linked institution";
      if (institutionId) {
        const inst = await this.client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = inst.data.institution.name;
      }
      return { accessToken, externalItemId, institutionName };
    } catch (e) {
      throw mapPlaidApiError(e);
    }
  }

  async institutionName(accessToken: string): Promise<string> {
    try {
      const item = await this.client.itemGet({ access_token: accessToken });
      const institutionId = item.data.item.institution_id;
      if (!institutionId) return "Linked institution";
      const inst = await this.client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      return inst.data.institution.name;
    } catch (e) {
      throw mapPlaidApiError(e);
    }
  }

  async fetchSnapshot(accessToken: string): Promise<PlaidSyncSnapshot> {
    try {
      const accountsRes = await this.client.accountsGet({ access_token: accessToken });
      const accounts = accountsRes.data.accounts.map(mapAccount);

      const end = new Date();
      const start = new Date();
      start.setUTCDate(end.getUTCDate() - 30);

      const txRes = await this.client.transactionsGet({
        access_token: accessToken,
        start_date: isoDate(start),
        end_date: isoDate(end),
      });

      const transactions = txRes.data.transactions.map(mapTransaction);
      const balances = accounts.map((a) => ({
        plaidAccountId: a.plaidAccountId,
        balanceUsd: a.balanceUsd,
      }));

      return { accounts, transactions, balances };
    } catch (e) {
      throw mapPlaidApiError(e);
    }
  }
}

function mapAccount(acct: AccountBase): PlaidLinkedAccount {
  const kind =
    acct.subtype === "savings" ? "savings" : acct.subtype === "checking" ? "checking" : "other";
  const balanceUsd = acct.balances.current ?? acct.balances.available ?? 0;
  return {
    plaidAccountId: acct.account_id,
    name: acct.name,
    officialName: acct.official_name,
    mask: acct.mask,
    kind,
    balanceUsd,
  };
}

/**
 * Plaid: positive amount = money out of account. Attache convention: expenses negative.
 */
function mapTransaction(tx: Transaction) {
  return {
    plaidAccountId: tx.account_id,
    transactionId: tx.transaction_id,
    payee: tx.merchant_name ?? tx.name,
    amountUsd: -tx.amount,
    date: tx.date,
    pending: tx.pending,
    category: tx.personal_finance_category?.primary ?? tx.category?.[0],
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
