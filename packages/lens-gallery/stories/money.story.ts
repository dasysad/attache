import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-money";

export const story: Story = {
  id: "primitives-money",
  group: "Primitives",
  title: "Money",
  blurb: "Signed USD display — inflow/outflow coloring, accounting mode.",
  render: () => html`
    ${section("Sign modes", html`
      <div style="display:flex;flex-direction:column;gap:var(--att-space-3);font-family:var(--att-font-mono)">
        <att-money .amount=${3412.18} sign="never"></att-money>
        <att-money .amount=${-87.42}></att-money>
        <att-money .amount=${1250} sign="always"></att-money>
        <att-money .amount=${-42.5} sign="accounting"></att-money>
      </div>
    `)}
    ${section("Tones & sizes", html`
      <div style="display:flex;flex-wrap:wrap;gap:var(--att-space-6);align-items:baseline">
        <att-money .amount=${500} tone="inflow" size="lg"></att-money>
        <att-money .amount=${-129.99} tone="outflow"></att-money>
        <att-money .amount=${-45} tone="pending"></att-money>
        <att-money .amount=${199} tone="muted" size="sm"></att-money>
      </div>
    `)}
    ${section("Cents input", html`
      <att-money .amount=${341218} cents></att-money>
    `)}
  `,
};
