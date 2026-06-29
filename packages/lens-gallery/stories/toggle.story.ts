import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-toggle";

const stack = "display:flex;flex-direction:column;gap:var(--att-space-5)";

export const story: Story = {
  id: "primitives-toggle",
  group: "Primitives",
  title: "Toggle",
  blurb: "Platform subscription, cloud backup, notification channels.",
  render: () => html`
    ${section("Settings", html`
      <div style=${stack}>
        <att-toggle label="Attache platform ($4.99/mo)"></att-toggle>
        <att-toggle label="Cloud backup" checked></att-toggle>
        <att-toggle label="Disabled" disabled></att-toggle>
      </div>
    `)}
  `,
};
