import { html } from "lit";
import { section, tokenRow, type Story } from "@celestial/lens";

const STEPS = [
  "--att-space-1", "--att-space-2", "--att-space-3", "--att-space-4", "--att-space-5",
  "--att-space-6", "--att-space-8", "--att-space-10", "--att-space-12", "--att-space-16",
];
const RADII = ["--att-radius-sm", "--att-radius-md", "--att-radius-lg"];

const bar = (v: string) =>
  html`<div style="height:12px;width:var(${v});background:var(--att-color-primary);border-radius:2px"></div>`;

const radiusBox = (v: string) =>
  html`<div style="width:64px;height:48px;background:var(--att-color-surface-raised);border:1px solid var(--att-color-outline);border-radius:var(${v})"></div>`;

export const story: Story = {
  id: "tokens-spacing",
  group: "Tokens",
  title: "Spacing & radius",
  blurb: "4px rhythm; rounded corners for approachable household UI.",
  render: () => html`
    ${section("Spacing scale", html`${STEPS.map((v) => tokenRow(v, bar(v)))}`)}
    ${section("Border radius", html`${RADII.map((v) => tokenRow(v, radiusBox(v)))}`)}
  `,
};
