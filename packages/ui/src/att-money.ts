/**
 * att-money — signed USD display with inflow/outflow coloring.
 *
 * Amounts are USD floats by default; set `cents` when passing TigerBeetle integers.
 */
import { LitElement, css, html } from "lit";
import {
  formatMoneyCents,
  formatMoneyUsd,
  type MoneySignMode,
} from "./format-money.js";

export type AttMoneyTone = "neutral" | "inflow" | "outflow" | "pending" | "muted";
export type AttMoneySize = "sm" | "md" | "lg";

export class AttMoney extends LitElement {
  static properties = {
    amount: { type: Number },
    cents: { type: Boolean },
    sign: { type: String },
    tone: { type: String },
    size: { type: String },
    showCents: { type: Boolean },
  };

  /** USD float, or integer cents when `cents` is true. */
  amount = 0;
  cents = false;
  sign: MoneySignMode = "auto";
  tone: AttMoneyTone = "neutral";
  size: AttMoneySize = "md";
  showCents = true;

  static styles = css`
    :host {
      display: inline-block;
      font-family: var(--att-font-mono);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .amount {
      color: var(--money-color, var(--att-color-text));
    }
    .sm { font-size: var(--att-type-mono-size); }
    .md { font-size: var(--att-type-body-size); }
    .lg { font-size: var(--att-type-headline-size); font-weight: 600; }
    .neutral { --money-color: var(--att-color-text); }
    .inflow { --money-color: var(--att-color-success); }
    .outflow { --money-color: var(--att-color-text); }
    .pending {
      --money-color: var(--att-color-text-muted);
      font-style: italic;
    }
    .muted { --money-color: var(--att-color-text-muted); }
  `;

  private resolvedTone(): AttMoneyTone {
    if (this.tone !== "neutral") return this.tone;
    if (this.amount > 0) return "inflow";
    if (this.amount < 0) return "outflow";
    return "neutral";
  }

  private formatted(): string {
    const opts = { sign: this.sign, showCents: this.showCents };
    return this.cents
      ? formatMoneyCents(this.amount, opts)
      : formatMoneyUsd(this.amount, opts);
  }

  render() {
    const tone = this.resolvedTone();
    return html`
      <span class="amount ${tone} ${this.size}" part="amount">${this.formatted()}</span>
    `;
  }
}

if (!customElements.get("att-money")) {
  customElements.define("att-money", AttMoney);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-money": AttMoney;
  }
}
