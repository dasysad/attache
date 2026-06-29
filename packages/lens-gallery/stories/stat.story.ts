import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-stat";

export const story: Story = {
  id: "primitives-stat",
  group: "Primitives",
  title: "Stat",
  blurb: "Runway and dashboard KPI tiles.",
  render: () => html`
    ${section("Runway forecast", html`
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--att-space-4);max-width:720px">
        <att-stat
          label="Runway"
          value="34"
          unit="days"
          helper="Bills covered through Jul 26"
          tone="good"
        ></att-stat>
        <att-stat
          label="Liquid balance"
          value="$16,252"
          helper="Checking + savings"
        ></att-stat>
        <att-stat
          label="Due in 7d"
          value="$2,384"
          helper="3 obligations"
          tone="warn"
        ></att-stat>
        <att-stat
          label="Overdue"
          value="$78"
          helper="1 bill — City Water"
          tone="bad"
        ></att-stat>
      </div>
    `)}
  `,
};
