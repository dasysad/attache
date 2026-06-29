import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-input";

const stack = "display:flex;flex-direction:column;gap:var(--att-space-6);max-width:360px";

export const story: Story = {
  id: "primitives-input",
  group: "Primitives",
  title: "Input",
  blurb: "Household name, amounts, search — with optional hints.",
  render: () => html`
    ${section("Fields", html`
      <div style=${stack}>
        <att-input label="Household name" placeholder="Klaus Household"></att-input>
        <att-input label="Monthly rent" placeholder="2400" inputmode="decimal" hint="Used for solvency forecast"></att-input>
        <att-input label="Disabled" value="Read-only" disabled></att-input>
      </div>
    `)}
  `,
};
