import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-obligation-timeline";
import "@attache/ui/att-wizard-steps";

export const story: Story = {
  id: "patterns-obligation-timeline",
  group: "Patterns",
  title: "Obligation timeline",
  blurb: "VS-2 — bills plotted across the forecast horizon.",
  render: () => html`
    ${section("Upcoming bills", html`
      <div style="max-width:480px">
        <att-obligation-timeline
          items-json=${JSON.stringify([
            { date: "2026-06-28", payee: "PG&E", amountUsd: 142, status: "upcoming" },
            { date: "2026-07-01", payee: "Mortgage", amountUsd: 2184.5, status: "due_soon" },
            { date: "2026-07-05", payee: "Internet", amountUsd: 89.99, status: "scheduled" },
          ])}
          horizon-days="30"
        ></att-obligation-timeline>
      </div>
    `)}
    ${section("Wizard steps", html`
      <div style="max-width:480px">
        <att-wizard-steps current="2"></att-wizard-steps>
      </div>
    `)}
  `,
};
