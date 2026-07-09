import type { PlaidIngestPort, PlaidSyncSnapshot } from "./plaid-port.js";

/**
 * Deterministic Plaid sandbox for dogfood without API keys.
 * Matches Lens gallery fixture data (Chase checking + savings).
 */
export class FakePlaidAdapter implements PlaidIngestPort {
  readonly mode = "sandbox" as const;

  async institutionName(): Promise<string> {
    return "Chase (sandbox)";
  }

  async fetchSnapshot(_accessToken: string): Promise<PlaidSyncSnapshot> {
    return {
      accounts: [
        {
          plaidAccountId: "sandbox_acct_checking_4821",
          name: "Checking",
          officialName: "Chase Total Checking",
          mask: "4821",
          kind: "checking",
          balanceUsd: 3412.18,
        },
        {
          plaidAccountId: "sandbox_acct_savings_9103",
          name: "Savings",
          officialName: "Chase Savings",
          mask: "9103",
          kind: "savings",
          balanceUsd: 12840,
        },
      ],
      balances: [
        { plaidAccountId: "sandbox_acct_checking_4821", balanceUsd: 3412.18 },
        { plaidAccountId: "sandbox_acct_savings_9103", balanceUsd: 12840 },
      ],
      transactions: [
        {
          plaidAccountId: "sandbox_acct_checking_4821",
          transactionId: "sandbox_tx_wfm_001",
          payee: "Whole Foods Market",
          amountUsd: -142.87,
          date: daysAgo(2),
          pending: false,
          category: "Groceries",
        },
        {
          plaidAccountId: "sandbox_acct_checking_4821",
          transactionId: "sandbox_tx_payroll_001",
          payee: "Acme Corp Payroll",
          amountUsd: 4250,
          date: daysAgo(7),
          pending: false,
          category: "Income",
        },
        {
          plaidAccountId: "sandbox_acct_checking_4821",
          transactionId: "sandbox_tx_netflix_001",
          payee: "Netflix",
          amountUsd: -15.99,
          date: daysAgo(4),
          pending: false,
          category: "Subscription",
        },
        {
          plaidAccountId: "sandbox_acct_checking_4821",
          transactionId: "sandbox_tx_uber_001",
          payee: "Uber",
          amountUsd: -24.5,
          date: daysAgo(1),
          pending: true,
          category: "Transport",
        },
        {
          plaidAccountId: "sandbox_acct_checking_4821",
          transactionId: "sandbox_tx_target_001",
          payee: "Target",
          amountUsd: -67.34,
          date: daysAgo(5),
          pending: false,
          category: "Shopping",
        },
      ],
    };
  }
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
