import { html } from "lit";
import { colorSwatch, grid, section, type Story } from "@celestial/lens";

const SURFACE = [
  "--att-color-bg",
  "--att-color-surface",
  "--att-color-surface-raised",
  "--att-color-surface-overlay",
];
const TEXT = ["--att-color-text", "--att-color-text-muted", "--att-color-text-subtle", "--att-color-outline"];
const BRAND = ["--att-color-primary", "--att-color-primary-hover", "--att-color-primary-muted"];
const FEEDBACK = [
  "--att-color-success",
  "--att-color-warning",
  "--att-color-error",
  "--att-color-info",
  "--att-color-action",
];

export const story: Story = {
  id: "tokens-color",
  group: "Tokens",
  title: "Color",
  blurb: "Household finance palette — teal primary, muted surfaces, clear severity hues.",
  render: () => html`
    ${section("Surfaces", grid(SURFACE.map((v) => colorSwatch(v))))}
    ${section("Text & outline", grid(TEXT.map((v) => colorSwatch(v))))}
    ${section("Brand", grid(BRAND.map((v) => colorSwatch(v))))}
    ${section("Feedback", grid(FEEDBACK.map((v) => colorSwatch(v))))}
    ${section("Switch theme", html`<p style="color:var(--att-color-text-muted);font-size:var(--att-type-body-size)">Use the Lens theme switcher: Household (dark) vs Daylight (light). Same tokens, inverted surfaces.</p>`)}
  `,
};
