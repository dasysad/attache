import { html } from "lit";
import { grid, section, type Story } from "@celestial/lens";

function shadowPanel(shadow: string, label: string) {
  return html`
    <div style="padding:var(--att-space-6);background:var(--att-color-bg)">
      <div style="padding:var(--att-space-5);background:var(--att-color-surface);border:1px solid var(--att-color-outline);border-radius:var(--att-radius-lg);box-shadow:var(${shadow});font-size:var(--att-type-label-size);color:var(--att-color-text-muted)">${label}</div>
    </div>
  `;
}

function focusRing() {
  return html`
    <div style="padding:var(--att-space-6)">
      <button style="font:inherit;padding:var(--att-space-3) var(--att-space-5);background:var(--att-color-primary);color:#fff;border:none;border-radius:var(--att-radius-md);box-shadow:var(--att-shadow-focus)">Focus ring</button>
    </div>
  `;
}

export const story: Story = {
  id: "tokens-elevation",
  group: "Tokens",
  title: "Elevation",
  blurb: "Subtle shadows for finance clarity — not emissive bloom.",
  render: () => html`
    ${section("Shadows", grid([
      shadowPanel("--att-shadow-sm", "sm — cards"),
      shadowPanel("--att-shadow-md", "md — modals"),
    ], 280))}
    ${section("Focus", focusRing())}
  `,
};
