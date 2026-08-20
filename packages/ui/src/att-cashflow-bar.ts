/**
 * att-cashflow-bar — category outflow bars for the cash-flow report (ADR-014 P2).
 *
 * Server embeds `buckets-json` from computeCashflow(). Honest empty: no fake Sankey.
 */
import { LitElement, css, html } from "lit";

export interface CashflowBarBucket {
  category: string;
  inflowUsd: number;
  outflowUsd: number;
  netUsd: number;
  count: number;
}

export class AttCashflowBar extends LitElement {
  static properties = {
    bucketsJson: { type: String, attribute: "buckets-json" },
    emptyHint: { type: String, attribute: "empty-hint" },
  };

  bucketsJson = "[]";
  emptyHint = "No posted transactions in this window.";

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
    .title {
      margin: 0 0 var(--att-space-4);
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
    .row {
      display: grid;
      grid-template-columns: 8rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      margin-bottom: var(--att-space-3);
    }
    .cat {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .track {
      height: 10px;
      background: var(--att-color-surface-raised);
      border-radius: var(--att-radius-sm);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: var(--att-color-primary);
      border-radius: var(--att-radius-sm);
    }
    .amt {
      font-family: var(--att-font-mono);
      font-size: var(--att-type-mono-size);
      color: var(--att-color-text);
      font-variant-numeric: tabular-nums;
    }
  `;

  private parseBuckets(): CashflowBarBucket[] {
    try {
      const data = JSON.parse(this.bucketsJson) as CashflowBarBucket[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  render() {
    const buckets = this.parseBuckets();
    if (buckets.length === 0) {
      return html`<div class="wrap"><p class="empty">${this.emptyHint}</p></div>`;
    }
    const maxOut = Math.max(...buckets.map((b) => b.outflowUsd), 1);
    return html`
      <div class="wrap" part="chart">
        <p class="title">Outflow by category</p>
        ${buckets.map((b) => {
          const pct = Math.max(2, Math.round((b.outflowUsd / maxOut) * 100));
          const label =
            b.outflowUsd > 0
              ? `$${b.outflowUsd.toFixed(2)}`
              : `+$${b.inflowUsd.toFixed(2)}`;
          return html`
            <div class="row">
              <span class="cat" title=${b.category}>${b.category}</span>
              <div class="track">
                <div class="fill" style="width:${b.outflowUsd > 0 ? pct : 0}%"></div>
              </div>
              <span class="amt">${label}</span>
            </div>
          `;
        })}
      </div>
    `;
  }
}

if (!customElements.get("att-cashflow-bar")) {
  customElements.define("att-cashflow-bar", AttCashflowBar);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-cashflow-bar": AttCashflowBar;
  }
}
