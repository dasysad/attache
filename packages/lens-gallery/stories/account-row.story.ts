import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-account-row";
import "@attache/ui/att-list";

export const story: Story = {
  id: "primitives-account-row",
  group: "Primitives",
  title: "Account row",
  blurb: "Funding accounts with balance and sync provenance.",
  render: () => html`
    ${section("Sync states", html`
      <div style="max-width:480px;display:flex;flex-direction:column;gap:var(--att-space-2)">
        <att-account-row
          name="Checking"
          mask="···4821"
          institution="Chase"
          kind="checking"
          .balance=${3412.18}
          syncStatus="fresh"
          syncLabel="2h ago via Plaid"
          primary
        ></att-account-row>
        <att-account-row
          name="Savings"
          mask="···9103"
          institution="Chase"
          .balance=${12840}
          syncStatus="stale"
          syncLabel="3d ago"
        ></att-account-row>
        <att-account-row
          name="Emergency fund"
          mask="···0042"
          institution="Ally"
          .balance=${5000}
          syncStatus="error"
        ></att-account-row>
        <att-account-row
          name="Cash envelope"
          institution="Manual"
          kind="cash"
          .balance=${400}
          syncStatus="manual"
        ></att-account-row>
      </div>
    `)}
    ${section("Liabilities", html`
      <div style="max-width:480px;display:flex;flex-direction:column;gap:var(--att-space-2)">
        <att-account-row
          name="Sapphire Reserve"
          mask="···1009"
          institution="Chase"
          kind="credit"
          .balance=${2410.55}
          syncStatus="fresh"
          syncLabel="Plaid"
        ></att-account-row>
        <att-account-row
          name="Mortgage"
          institution="Manual"
          kind="loan"
          .balance=${312000}
          syncStatus="manual"
        ></att-account-row>
      </div>
    `)}
    ${section("Account picker", html`
      <div style="max-width:480px">
        <att-list heading="Funding accounts">
          <att-account-row
            name="Checking"
            mask="···4821"
            institution="Chase"
            .balance=${3412.18}
            syncStatus="fresh"
            selected
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
      </div>
    `)}
  `,
};
