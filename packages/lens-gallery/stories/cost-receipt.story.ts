import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-cost-receipt";

export const story: Story = {
  id: "patterns-cost-receipt",
  group: "Patterns",
  title: "Cost receipt",
  blurb: "Transparent monthly breakdown — platform vs pass-through vs usage.",
  render: () => html`
    ${section("Typical household", html`
      <div style="max-width:480px">
        <att-cost-receipt
          .lines=${[
            { label: "Attache platform", totalUsd: 4.99, category: "platform" },
            { label: "Plaid bank sync", totalUsd: 3, vendor: "Plaid", category: "pass_through" },
            { label: "Cloud document OCR", totalUsd: 0.16, category: "usage" },
          ]}
          .totalUsd=${8.15}
          disclaimer="Pass-through at vendor cost. Local mesh sync is $0."
        ></att-cost-receipt>
      </div>
    `)}
    ${section("Free tier", html`
      <div style="max-width:480px">
        <att-cost-receipt></att-cost-receipt>
      </div>
    `)}
  `,
};
