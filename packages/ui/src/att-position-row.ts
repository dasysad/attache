/**
 * att-position-row — read-only SnapTrade holding (symbol, units, market value).
 *
 * Not a blotter: no lots, P&L, or trade actions. ADR-014 P1 — do not overbuild.
 */
import { LitElement, css, html } from "lit";
import "./att-money.js";
import "./att-chip.js";

export class AttPositionRow extends LitElement {
  static properties = {
    symbol: { type: String },
    account: { type: String },
    units: { type: Number },
    price: { type: Number },
    marketValue: { type: Number },
  };

  symbol = "";
  account = "";
  units = 0;
  price = 0;
  marketValue = 0;

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--att-space-4);
      align-items: center;
      padding: var(--att-space-3) var(--att-space-4);
      background: var(--att-color-surface);
    }
    .symbol {
      margin: 0;
      font-family: var(--att-font-mono);
      font-size: var(--att-type-body-size);
      font-weight: 600;
      color: var(--att-color-text);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      align-items: center;
      margin-top: var(--att-space-1);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .value {
      text-align: right;
    }
    .value-label {
      display: block;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      text-transform: uppercase;
      letter-spacing: var(--att-type-label-tracking);
      margin-bottom: var(--att-space-1);
    }
  `;

  render() {
    const unitsLabel =
      this.units === 1 ? "1 share" : `${this.units.toLocaleString("en-US")} shares`;
    return html`
      <div class="row" part="row">
        <div>
          <p class="symbol" part="symbol">${this.symbol || "—"}</p>
          <div class="meta">
            <span>${unitsLabel} @ $${this.price.toFixed(2)}</span>
            ${this.account
              ? html`<att-chip tone="neutral">${this.account}</att-chip>`
              : ""}
          </div>
        </div>
        <div class="value" part="value">
          <span class="value-label">Market value</span>
          <att-money .amount=${this.marketValue} size="lg" tone="neutral" sign="never"></att-money>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("att-position-row")) {
  customElements.define("att-position-row", AttPositionRow);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-position-row": AttPositionRow;
  }
}
