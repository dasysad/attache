import { html } from "lit";
import { section, tokenRow, type Story } from "@celestial/lens";

const pulse = (duration: string) =>
  html`<div style="width:48px;height:12px;border-radius:999px;background:var(--att-color-primary);animation:att-pulse var(${duration}) infinite alternate"></div>`;

export const story: Story = {
  id: "tokens-motion",
  group: "Tokens",
  title: "Motion",
  blurb: "Short easing only — finance UI should not bounce.",
  render: () => html`
    <style>
      @keyframes att-pulse { from { opacity: 0.35; } to { opacity: 1; } }
    </style>
    ${section("Durations", html`
      ${tokenRow("--att-motion-fast", pulse("--att-motion-fast"))}
      ${tokenRow("--att-motion-normal", pulse("--att-motion-normal"))}
    `)}
  `,
};
