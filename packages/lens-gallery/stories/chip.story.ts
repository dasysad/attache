import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-chip";

const row = "display:flex;gap:var(--att-space-3);flex-wrap:wrap";

export const story: Story = {
  id: "primitives-chip",
  group: "Primitives",
  title: "Chip",
  blurb: "Categories, sync state, subscription tags.",
  render: () => html`
    ${section("Tones", html`
      <div style=${row}>
        <att-chip tone="neutral">Utilities</att-chip>
        <att-chip tone="success">Synced</att-chip>
        <att-chip tone="warning">Due soon</att-chip>
        <att-chip tone="error">Over budget</att-chip>
        <att-chip tone="info">Plaid</att-chip>
      </div>
    `)}
  `,
};
