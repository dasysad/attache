import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-list";
import "@attache/ui/att-position-row";
import "@attache/ui/att-stat";

export const story: Story = {
  id: "patterns-investments",
  group: "Patterns",
  title: "Investments",
  blurb: "Read-only SnapTrade positions — not performance attribution.",
  render: () => html`
    ${section("Holdings", html`
      <div style="max-width:480px;display:grid;gap:var(--att-space-4)">
        <att-stat label="Brokerage equity" value="$19,470.52" helper="Read-only · excluded from runway"></att-stat>
        <att-list heading="Positions">
          <att-position-row symbol="VTI" account="Individual Brokerage" .units=${45.2} .price=${265.1} .marketValue=${11982.52}></att-position-row>
          <att-position-row symbol="VXUS" account="Roth IRA" .units=${120} .price=${62.4} .marketValue=${7488}></att-position-row>
        </att-list>
      </div>
    `)}
  `,
};
