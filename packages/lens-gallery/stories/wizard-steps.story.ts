import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-wizard-steps";

export const story: Story = {
  id: "primitives-wizard-steps",
  group: "Primitives",
  title: "Wizard steps",
  blurb: "Onboarding: household → find mail → connect → account → bills.",
  render: () => html`
    ${section("Step 1 of 5", html`<att-wizard-steps current="1"></att-wizard-steps>`)}
    ${section("Find mail", html`<att-wizard-steps current="2"></att-wizard-steps>`)}
    ${section("Connect", html`<att-wizard-steps current="3"></att-wizard-steps>`)}
  `,
};
