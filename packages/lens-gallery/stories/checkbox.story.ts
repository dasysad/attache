import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-checkbox";

const stack = "display:flex;flex-direction:column;gap:var(--att-space-4)";

export const story: Story = {
  id: "primitives-checkbox",
  group: "Primitives",
  title: "Checkbox",
  blurb: "Consent, filters, multi-select obligations.",
  render: () => html`
    ${section("States", html`
      <div style=${stack}>
        <att-checkbox label="I understand Plaid is billed at cost"></att-checkbox>
        <att-checkbox label="Checked" checked></att-checkbox>
        <att-checkbox label="Disabled" disabled></att-checkbox>
      </div>
    `)}
  `,
};
