import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-obligation-row";
import "@attache/ui/att-list";

export const story: Story = {
  id: "primitives-obligation-row",
  group: "Primitives",
  title: "Obligation row",
  blurb: "Bills and recurring payments with forecast status.",
  render: () => html`
    ${section("Status variants", html`
      <div style="max-width:520px;display:flex;flex-direction:column;gap:var(--att-space-2)">
        <att-obligation-row
          payee="Pacific Gas & Electric"
          dueDate="2026-06-28"
          .amount=${142}
          status="upcoming"
          cadence="Monthly"
          provenance="document"
        ></att-obligation-row>
        <att-obligation-row
          payee="Mortgage — Chase"
          dueDate="2026-06-24"
          .amount=${2184.5}
          status="due_soon"
          cadence="Monthly"
          autopay
          provenance="rule"
        ></att-obligation-row>
        <att-obligation-row
          payee="City Water"
          dueDate="2026-06-18"
          .amount=${78.2}
          status="overdue"
          provenance="email"
        ></att-obligation-row>
        <att-obligation-row
          payee="Spotify"
          dueDate="2026-06-10"
          .amount=${11.99}
          status="paid"
          cadence="Monthly"
        ></att-obligation-row>
      </div>
    `)}
    ${section("Upcoming bills list", html`
      <div style="max-width:520px">
        <att-list heading="Next 14 days">
          <att-obligation-row
            payee="Auto insurance"
            dueDate="2026-06-25"
            .amount=${186}
            status="scheduled"
            provenance="native"
          ></att-obligation-row>
          <att-obligation-row
            payee="Internet — Comcast"
            dueDate="2026-06-27"
            .amount=${89.99}
            status="upcoming"
            autopay
            provenance="plaid"
          ></att-obligation-row>
        </att-list>
      </div>
    `)}
  `,
};
