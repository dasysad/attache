import { html } from "lit";
import { section, type Story } from "@celestial/lens";

const ROLES = [
  { name: "display", size: "--att-type-display-size", weight: "--att-type-display-weight", leading: "--att-type-display-leading", sample: "Know you'll make rent." },
  { name: "headline", size: "--att-type-headline-size", weight: "--att-type-headline-weight", leading: "--att-type-headline-leading", sample: "30-day solvency runway" },
  { name: "body", size: "--att-type-body-size", weight: "--att-type-body-weight", leading: "--att-type-body-leading", sample: "Transparent pricing — platform fee separate from Plaid pass-through." },
  { name: "label", size: "--att-type-label-size", weight: "--att-type-label-weight", leading: "--att-type-label-leading", sample: "DUE IN 5 DAYS", mono: true },
  { name: "mono", size: "--att-type-mono-size", weight: "400", leading: "--att-type-mono-leading", sample: "$1,247.32 · checking ···4821", mono: true },
];

export const story: Story = {
  id: "tokens-typography",
  group: "Tokens",
  title: "Typography",
  blurb: "System UI for readability; mono for amounts and account hints.",
  render: () => html`
    ${section("Type scale", html`
      ${ROLES.map(
        (r) => html`
          <div style="padding:var(--att-space-5) 0;border-bottom:1px solid var(--att-color-outline)">
            <code style="font-size:var(--att-type-label-size);color:var(--att-color-text-subtle)">${r.name}</code>
            <div
              style="font-family:${r.mono ? "var(--att-font-mono)" : "var(--att-font-sans)"};
                     font-size:var(${r.size});
                     font-weight:var(${r.weight});
                     line-height:var(${r.leading});
                     letter-spacing:${r.mono ? "var(--att-type-label-tracking)" : "normal"};
                     text-transform:${r.mono ? "uppercase" : "none"};
                     margin-top:var(--att-space-2)"
            >${r.sample}</div>
          </div>
        `,
      )}
    `)}
  `,
};
