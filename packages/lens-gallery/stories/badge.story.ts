import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-badge";

const row = "display:flex;gap:var(--att-space-6);align-items:center";

export const story: Story = {
  id: "primitives-badge",
  group: "Primitives",
  title: "Badge",
  blurb: "Notification counts and HITL queue severity.",
  render: () => html`
    ${section("Severity", html`
      <div style=${row}>
        <att-badge severity="info">3</att-badge>
        <att-badge severity="warning">1</att-badge>
        <att-badge severity="action">!</att-badge>
        <att-badge severity="error">2</att-badge>
      </div>
    `)}
  `,
};
