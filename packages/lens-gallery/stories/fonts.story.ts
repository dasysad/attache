import { html } from "lit";
import { section, type Story } from "@celestial/lens";

export const story: Story = {
  id: "tokens-fonts",
  group: "Tokens",
  title: "Fonts",
  blurb: "System sans for UI copy; tabular mono for amounts, masks, and CLI hints.",
  render: () => html`
    ${section("Stacks", html`
      <p style="font-family:var(--att-font-sans);font-size:var(--att-type-headline-size)">
        Sans — Can we cover the bills this month?
      </p>
      <code style="display:block;margin-top:var(--att-space-2);color:var(--att-color-text-subtle)">--att-font-sans</code>
      <p style="font-family:var(--att-font-mono);font-size:var(--att-type-headline-size);margin-top:var(--att-space-6)">
        $16,252.18 · ···4821
      </p>
      <code style="display:block;margin-top:var(--att-space-2);color:var(--att-color-text-subtle)">--att-font-mono</code>
    `)}
  `,
};
