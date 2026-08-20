import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-position-row";
import "@attache/ui/att-list";

export const story: Story = {
  id: "primitives-position-row",
  group: "Primitives",
  title: "Position row",
  blurb: "Read-only SnapTrade holding — symbol, units, market value. No lots or trades.",
  render: () => html`
    ${section("Holdings", html`
      <div style="max-width:480px">
        <att-list heading="Brokerage">
          <att-position-row symbol="VTI" account="Individual Brokerage" .units=${45.2} .price=${265.1} .marketValue=${11982.52}></att-position-row>
          <att-position-row symbol="VXUS" account="Roth IRA" .units=${120} .price=${62.4} .marketValue=${7488}></att-position-row>
        </att-list>
      </div>
    `)}
  `,
};
