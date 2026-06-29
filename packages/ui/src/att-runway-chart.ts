/**
 * att-runway-chart — 30-day projected balance (VS-2 dashboard).
 *
 * Server renders `series-json` attribute from computeSolvencyForecast().series.
 */
import { LitElement, css, html } from "lit";

export interface RunwayChartPoint {
  date: string;
  balanceUsd: number;
  obligationsDueUsd: number;
}

export class AttRunwayChart extends LitElement {
  static properties = {
    seriesJson: { type: String, attribute: "series-json" },
    runwayDays: { type: Number, attribute: "runway-days" },
    height: { type: Number },
  };

  seriesJson = "[]";
  runwayDays = 30;
  height = 160;

  static styles = css`
    :host {
      display: block;
    }
    .chart-wrap {
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
    .runway {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
      font-family: var(--att-font-mono);
    }
    svg {
      width: 100%;
      height: var(--chart-h, 160px);
      display: block;
    }
    .empty {
      padding: var(--att-space-8);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    .axis-label {
      font-size: 10px;
      fill: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
    }
  `;

  private parseSeries(): RunwayChartPoint[] {
    try {
      const data = JSON.parse(this.seriesJson) as RunwayChartPoint[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private renderChart(series: RunwayChartPoint[]) {
    const w = 600;
    const h = this.height;
    const pad = { t: 8, r: 12, b: 28, l: 48 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const balances = series.map((p) => p.balanceUsd);
    const minB = Math.min(0, ...balances);
    const maxB = Math.max(...balances, 1);
    const range = maxB - minB || 1;

    const x = (i: number) => pad.l + (i / Math.max(series.length - 1, 1)) * innerW;
    const y = (v: number) => pad.t + innerH - ((v - minB) / range) * innerH;

    const points = series.map((p, i) => `${x(i)},${y(p.balanceUsd)}`).join(" ");
    const zeroY = y(0);

    const dueMarkers = series
      .map((p, i) =>
        p.obligationsDueUsd > 0
          ? html`<circle cx="${x(i)}" cy="${y(p.balanceUsd)}" r="3" fill="var(--att-color-warning)" />`
          : "",
      );

    const firstLabel = series[0]?.date.slice(5) ?? "";
    const lastLabel = series[series.length - 1]?.date.slice(5) ?? "";

    return html`
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="30-day runway projection">
        <line
          x1="${pad.l}"
          y1="${zeroY}"
          x2="${w - pad.r}"
          y2="${zeroY}"
          stroke="var(--att-color-error)"
          stroke-opacity="0.35"
          stroke-dasharray="4 4"
        />
        <polyline
          points="${points}"
          fill="none"
          stroke="var(--att-color-primary)"
          stroke-width="2"
          stroke-linejoin="round"
        />
        ${dueMarkers}
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
    if (!series.length) {
      return html`
        <div class="chart-wrap">
          <p class="empty">Add a funding account to see your runway.</p>
        </div>
      `;
    }

    const solvent = this.runwayDays >= series.length;
    const runwayLabel = solvent
      ? `${series.length}d+ solvent`
      : `${this.runwayDays}d runway`;

    return html`
      <div class="chart-wrap" style="--chart-h: ${this.height}px">
        <div class="header">
          <h4 class="title">30-day projection</h4>
          <span class="runway">${runwayLabel}</span>
        </div>
        ${this.renderChart(series)}
      </div>
    `;
  }
}

if (!customElements.get("att-runway-chart")) {
  customElements.define("att-runway-chart", AttRunwayChart);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-runway-chart": AttRunwayChart;
  }
}
