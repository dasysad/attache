import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-stat";

export const story: Story = {
  id: "patterns-net-worth",
  group: "Patterns",
  title: "Net worth",
  blurb: "Assets minus liabilities — honest when debt is missing or net is negative.",
  render: () => html`
    ${section("With liabilities", html`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--att-space-3);max-width:720px">
        <att-stat label="Net worth" value="$2,500.00" helper="Assets − credit/loan"></att-stat>
        <att-stat label="Liquid" value="$1,500.00" helper="Runway funds"></att-stat>
        <att-stat label="Invested" value="$2,000.00" helper="Brokerage"></att-stat>
        <att-stat label="Liabilities" value="$1,000.00" helper="Credit + loans"></att-stat>
      </div>
    `)}
    ${section("Only debt (negative)", html`
      <div style="max-width:240px">
        <att-stat label="Net worth" value="$-400.00" tone="bad" helper="Only a credit card on file"></att-stat>
      </div>
    `)}
    ${section("No accounts (negative)", html`
      <p style="margin:0;color:var(--att-color-text-muted)">No accounts yet — net worth is not a chart until there is something to own or owe.</p>
    `)}
  `,
};
