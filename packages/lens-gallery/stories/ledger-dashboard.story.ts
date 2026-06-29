import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-stat";
import "@attache/ui/att-list";
import "@attache/ui/att-transaction-row";
import "@attache/ui/att-obligation-row";
import "@attache/ui/att-account-row";

const grid = `
  display: grid;
  gap: var(--att-space-6);
  max-width: 960px;
`;

export const story: Story = {
  id: "patterns-ledger-dashboard",
  group: "Patterns",
  title: "Ledger dashboard",
  blurb: "VS-2 dashboard slice — runway stats, accounts, obligations, transactions.",
  render: () => html`
    ${section("Household overview", html`
      <div style=${grid}>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--att-space-4)">
          <att-stat label="Runway" value="34" unit="days" tone="good" helper="30-day solvency OK"></att-stat>
          <att-stat label="Liquid" value="$16,252" helper="2 linked accounts"></att-stat>
          <att-stat label="Due 7d" value="$2,384" tone="warn" helper="Mortgage + utilities"></att-stat>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--att-space-4)">
          <att-list heading="Funding accounts">
            <att-account-row
              name="Checking"
              mask="···4821"
              institution="Chase"
              .balance=${3412.18}
              syncStatus="fresh"
              syncLabel="via Plaid"
              primary
            ></att-account-row>
            <att-account-row
              name="Savings"
              mask="···9103"
              institution="Chase"
              .balance=${12840}
              syncStatus="fresh"
            ></att-account-row>
          </att-list>

          <att-list heading="Upcoming obligations">
            <att-obligation-row
              payee="Mortgage"
              dueDate="2026-06-24"
              .amount=${2184.5}
              status="due_soon"
              autopay
            ></att-obligation-row>
            <att-obligation-row
              payee="PG&E"
              dueDate="2026-06-28"
              .amount=${142}
              status="upcoming"
            ></att-obligation-row>
            <att-obligation-row
              payee="City Water"
              dueDate="2026-06-18"
              .amount=${78.2}
              status="overdue"
            ></att-obligation-row>
          </att-list>
        </div>

        <att-list heading="Recent transactions">
          <att-transaction-row
            payee="Whole Foods"
            date="2026-06-20"
            .amount=${-142.87}
            category="Groceries"
          ></att-transaction-row>
          <att-transaction-row
            payee="Payroll"
            date="2026-06-15"
            .amount=${4250}
            category="Income"
          ></att-transaction-row>
          <att-transaction-row
            payee="Netflix"
            date="2026-06-18"
            .amount=${-15.99}
            category="Subscription"
          ></att-transaction-row>
        </att-list>
      </div>
    `)}
  `,
};
