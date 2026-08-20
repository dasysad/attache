/**
 * att-cashflow-trend — daily outflow sparkline for the current cash-flow window.
 *
 * Server embeds `series-json` from computeCashflowTrend(). Empty series is
 * honest: we do not draw a flat zero line (ADR-014 P3, no hollow charts).
 */
import { LitElement, css, html } from "lit";

export interface CashflowTrendPoint {
  date: string;
  inflowUsd: number;
  outflowUsd: number;
}

export class AttCashflowTrend extends LitElement {
  static properties = {
    seriesJson: { type: String, attribute: "series-json" },
    emptyHint: { type: String, attribute: "empty-hint" },
    height: { type: Number },
  };

  seriesJson = "[]";
  emptyHint = "No posted spend in this window to chart.";
  height = 120;

  static styles = css`
    :host {
      display: block;
    }
    .wrap {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-4);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: var(--att-space-3);
    }
    .title {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .empty {
      padding: var(--att-space-8);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    svg {
      width: 100%;
      height: var(--chart-h, 120px);
      display: block;
    }
    .axis-label {
      font-size: 10px;
      fill: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
    }
  `;

  private parseSeries(): CashflowTrendPoint[] {
    try {
      const data = JSON.parse(this.seriesJson) as CashflowTrendPoint[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private renderChart(series: CashflowTrendPoint[]) {
    const w = 600;
    const h = this.height;
    const pad = { t: 8, r: 12, b: 28, l: 48 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;
    const values = series.map((p) => p.outflowUsd);
    const maxB = Math.max(...values, 1);
    const x = (i: number) => pad.l + (i / Math.max(series.length - 1, 1)) * innerW;
    const y = (v: number) => pad.t + innerH - (v / maxB) * innerH;
    const points = series.map((p, i) => `${x(i)},${y(p.outflowUsd)}`).join(" ");
    const firstLabel = series[0]?.date.slice(5) ?? "";
    const lastLabel = series[series.length - 1]?.date.slice(5) ?? "";
    return html`
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily outflow in this window">
        <polyline
          points="${points}"
          fill="none"
          stroke="var(--att-color-primary)"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <text class="axis-label" x="${pad.l}" y="${h - 6}">${firstLabel}</text>
        <text class="axis-label" x="${w - pad.r}" y="${h - 6}" text-anchor="end">${lastLabel}</text>
        <text class="axis-label" x="${pad.l - 6}" y="${pad.t + 4}" text-anchor="end">
          $${Math.round(maxB).toLocaleString()}
        </text>
      </svg>
    `;
  }

  render() {
    const series = this.parseSeries();
    if (series.length === 0) {
      return html`<div class="wrap"><p class="empty">${this.emptyHint}</p></div>`;
    }
    return html`
      <div class="wrap" style="--chart-h: ${this.height}px" part="chart">
        <div class="header">
          <p class="title">Daily outflow</p>
        </div>
        ${this.renderChart(series)}
      </div>
    `;
  }
}

if (!customElements.get("att-cashflow-trend")) {
  customElements.define("att-cashflow-trend", AttCashflowTrend);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-cashflow-trend": AttCashflowTrend;
  }
}
