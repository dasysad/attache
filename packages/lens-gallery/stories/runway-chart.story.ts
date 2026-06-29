import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-runway-chart";
import "@attache/ui/att-obligation-timeline";
import "@attache/ui/att-wizard-steps";

const sampleSeries = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 5, 1 + i));
  const balanceUsd = 5000 - i * 120 - (i === 10 ? 800 : 0);
  return {
    date: d.toISOString().slice(0, 10),
    balanceUsd,
    obligationsDueUsd: i === 10 ? 800 : i % 7 === 0 ? 150 : 0,
  };
});

export const story: Story = {
  id: "patterns-runway-chart",
  group: "Patterns",
  title: "Runway chart",
  blurb: "VS-2 — 30-day projected balance from forecast series.",
  render: () => html`
    ${section("Solvent household", html`
      <div style="max-width:640px">
        <att-runway-chart
          series-json=${JSON.stringify(sampleSeries)}
          runway-days="30"
        ></att-runway-chart>
      </div>
    `)}
    ${section("Short runway", html`
      <div style="max-width:640px">
        <att-runway-chart
          series-json=${JSON.stringify(sampleSeries.map((p, i) => ({
            ...p,
            balanceUsd: 800 - i * 50,
          })))}
          runway-days="12"
        ></att-runway-chart>
      </div>
    `)}
  `,
};
