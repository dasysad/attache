import { html } from "lit";
import { section, type Story } from "@celestial/lens";
import "@attache/ui/att-cashflow-bar";
import "@attache/ui/att-cashflow-trend";
import "@attache/ui/att-stat";

const buckets = [
  { category: "Groceries", inflowUsd: 0, outflowUsd: 412.1, netUsd: -412.1, count: 6 },
  { category: "Shopping", inflowUsd: 0, outflowUsd: 187.34, netUsd: -187.34, count: 3 },
  { category: "(uncategorized)", inflowUsd: 0, outflowUsd: 42, netUsd: -42, count: 2 },
  { category: "Income", inflowUsd: 4250, outflowUsd: 0, netUsd: 4250, count: 1 },
];

const series = [
  { date: "2026-08-01", inflowUsd: 0, outflowUsd: 12 },
  { date: "2026-08-02", inflowUsd: 0, outflowUsd: 0 },
  { date: "2026-08-03", inflowUsd: 0, outflowUsd: 88 },
  { date: "2026-08-04", inflowUsd: 4250, outflowUsd: 0 },
  { date: "2026-08-05", inflowUsd: 0, outflowUsd: 142 },
];

export const story: Story = {
  id: "patterns-cashflow",
  group: "Patterns",
  title: "Cash flow",
  blurb: "Category bars + daily outflow vs prior window. Empty is honest, not a Sankey.",
  render: () => html`
    ${section("Last 30 days", html`
      <div style="max-width:560px;display:grid;gap:var(--att-space-4)">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--att-space-3)">
          <att-stat label="Inflow" value="$4,250.00"></att-stat>
          <att-stat label="Outflow" value="$641.44" helper="vs prior +$80" tone="bad"></att-stat>
          <att-stat label="Net" value="$3,608.56" tone="good"></att-stat>
        </div>
        <att-cashflow-trend series-json=${JSON.stringify(series)}></att-cashflow-trend>
        <att-cashflow-bar buckets-json=${JSON.stringify(buckets)}></att-cashflow-bar>
      </div>
    `)}
    ${section("Empty window", html`
      <div style="max-width:560px;display:grid;gap:var(--att-space-3)">
        <att-cashflow-trend
          series-json="[]"
          empty-hint="No posted spend in this window to chart."
        ></att-cashflow-trend>
        <att-cashflow-bar
          buckets-json="[]"
          empty-hint="No posted transactions in this window. We do not invent a Sankey."
        ></att-cashflow-bar>
      </div>
    `)}
    ${section("Malformed JSON (negative)", html`
      <div style="max-width:560px">
        <att-cashflow-bar buckets-json="not-json"></att-cashflow-bar>
      </div>
    `)}
  `,
};
