import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-transaction-row";
import "@attache/ui/att-list";

export const story: Story = {
  id: "primitives-transaction-row",
  group: "Primitives",
  title: "Transaction row",
  blurb: "Plaid/manual bank lines — spend, deposit, pending.",
  render: () => html`
    ${section("Single rows", html`
      <div style="max-width:520px;display:flex;flex-direction:column;gap:var(--att-space-2)">
        <att-transaction-row
          payee="Whole Foods Market"
          date="2026-06-20"
          .amount=${-142.87}
          category="Groceries"
          account="Checking ···4821"
        ></att-transaction-row>
        <att-transaction-row
          payee="Acme Corp Payroll"
          date="2026-06-15"
          .amount=${4250}
          category="Income"
          account="Checking ···4821"
          selected
        ></att-transaction-row>
        <att-transaction-row
          payee="Uber"
          date="2026-06-21"
          .amount=${-24.5}
          category="Transport"
          pending
        ></att-transaction-row>
        <att-transaction-row
          payee="Unknown merchant"
          date="2026-06-22"
          .amount=${-12.00}
          account="Checking ···4821"
        ></att-transaction-row>
      </div>
    `)}
    ${section("In a list", html`
      <div style="max-width:520px">
        <att-list heading="Recent transactions">
          <att-transaction-row
            payee="Netflix"
            date="2026-06-18"
            .amount=${-15.99}
            category="Subscription"
          ></att-transaction-row>
          <att-transaction-row
            payee="Target"
            date="2026-06-17"
            .amount=${-67.34}
            category="Shopping"
          ></att-transaction-row>
          <att-transaction-row
            payee="Interest payment"
            date="2026-06-01"
            .amount=${0.42}
            category="Interest"
          ></att-transaction-row>
        </att-list>
      </div>
    `)}
  `,
};
