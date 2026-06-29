import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-button";

const row = "display:flex;gap:var(--att-space-4);flex-wrap:wrap;align-items:center";

export const story: Story = {
  id: "primitives-button",
  group: "Primitives",
  title: "Button",
  blurb: "Primary actions, secondary surfaces, ghost links, danger (reject transfer).",
  render: () => html`
    ${section("Variants", html`
      <div style=${row}>
        <att-button variant="primary">Connect Plaid</att-button>
        <att-button variant="secondary">Save draft</att-button>
        <att-button variant="ghost">Learn more</att-button>
        <att-button variant="danger">Reject transfer</att-button>
      </div>
    `)}
    ${section("Disabled", html`
      <div style=${row}>
        <att-button variant="primary" disabled>Connect Plaid</att-button>
        <att-button variant="secondary" disabled>Save draft</att-button>
      </div>
    `)}
  `,
};
