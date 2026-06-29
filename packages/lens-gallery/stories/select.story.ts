import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-select";

export const story: Story = {
  id: "primitives-select",
  group: "Primitives",
  title: "Select",
  blurb: "Account picker, billing period, calendar source.",
  render: () => html`
    ${section("Field", html`
      <div style="max-width:280px">
        <att-select label="Linked accounts" value="3">
          <option value="1">1 account</option>
          <option value="2">2 accounts</option>
          <option value="3">3 accounts</option>
          <option value="4">4 accounts</option>
        </att-select>
      </div>
    `)}
  `,
};
