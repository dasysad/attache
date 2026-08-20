import { html } from "lit";
import { section, tokenRow, type Story } from "@celestial/lens";

const widths = ["--att-border-thin", "--att-border-medium", "--att-border-strong"];

const sample = (width: string, style: string) =>
  html`<div style="width:160px;height:48px;background:var(--att-color-surface);border:var(${width}) ${style} var(--att-color-outline);border-radius:var(--att-radius-md)"></div>`;

export const story: Story = {
  id: "tokens-borders",
  group: "Tokens",
  title: "Borders",
  blurb: "Thin outlines for cards; medium for emphasis; dashed for pending / in-flight money.",
  render: () => html`
    ${section("Width", html`${widths.map((v) => tokenRow(v, sample(v, "solid")))}`)}
    ${section("Style", html`
      ${tokenRow("solid", sample("--att-border-thin", "solid"))}
      ${tokenRow("dashed — pending ACH / pending txn", sample("--att-border-medium", "dashed"))}
    `)}
  `,
};
