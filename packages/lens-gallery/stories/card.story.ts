import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-card";

const muted = "margin:0;color:var(--att-color-text-muted);font-size:var(--att-type-body-size)";

export const story: Story = {
  id: "primitives-card",
  group: "Primitives",
  title: "Card",
  blurb: "Obligation groups, account summaries, settings sections.",
  render: () => html`
    ${section("With header", html`
      <div style="max-width:400px">
        <att-card heading="Checking ···4821" eyebrow="Funding account">
          <p style=${muted}>Available $3,412.18 · synced 2h ago via Plaid</p>
          <span slot="footer">Ledger primary on this device</span>
        </att-card>
      </div>
    `)}
    ${section("Content only", html`
      <div style="max-width:400px">
        <att-card>
          <p style="margin:0;color:var(--att-color-text)">Minimal card for inline metrics.</p>
        </att-card>
      </div>
    `)}
  `,
};
