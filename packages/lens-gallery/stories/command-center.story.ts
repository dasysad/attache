import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-stat";

export const story: Story = {
  id: "patterns-command-center",
  group: "Patterns",
  title: "Command center",
  blurb: "ADR-014 Home — solvency stats, attention, grouped accounts. Not 12 Firefly widgets.",
  render: () => html`
    ${section("Attention + runway", html`
      <div style="max-width:720px;display:grid;gap:var(--att-space-4)">
        <div style="padding:var(--att-space-4);border-left:3px solid var(--att-color-action);background:var(--att-color-surface);border-radius:var(--att-radius-md)">
          <strong>Transfers need approval</strong>
          <p style="margin:var(--att-space-1) 0 0;color:var(--att-color-text-muted);font-size:var(--att-type-label-size)">1 proposal waiting — approve is not always a bank move.</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--att-space-3)">
          <att-stat label="Runway" value="34" unit="days" tone="good"></att-stat>
          <att-stat label="Liquid" value="$3,412" helper="checking"></att-stat>
          <att-stat label="Brokerage" value="$60,470" helper="excluded from runway"></att-stat>
        </div>
      </div>
    `)}
    ${section("Error / empty", html`
      <div style="max-width:720px;display:grid;gap:var(--att-space-3)">
        <att-stat label="Net worth" value="$-400.00" tone="bad" helper="Only a credit card on file"></att-stat>
        <p style="margin:0;color:var(--att-color-text-muted);font-size:var(--att-type-body-size)">No posted transactions in this window — we do not invent a Sankey.</p>
      </div>
    `)}
  `,
};
