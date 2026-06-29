/**
 * att-transaction-row — Plaid/manual bank transaction line item.
 *
 * Negative `amount` = spend; positive = deposit/refund. Use inside att-list
 * or a plain scroll region on the dashboard / account detail views.
 */
import { LitElement, css, html } from "lit";
import { formatShortDate } from "./format-money.js";
import "./att-money.js";
import "./att-chip.js";

export class AttTransactionRow extends LitElement {
  static properties = {
    payee: { type: String },
    date: { type: String },
    amount: { type: Number },
    category: { type: String },
    account: { type: String },
    pending: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
  };

  payee = "";
  /** ISO date string or pre-formatted label. */
  date = "";
  /** USD; negative = outflow. */
  amount = 0;
  category = "";
  account = "";
  pending = false;
  selected = false;

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 3.5rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      padding: var(--att-space-3) var(--att-space-4);
      background: var(--att-color-surface);
      transition: background var(--att-motion-fast);
    }
    :host([selected]) .row {
      background: var(--att-color-surface-raised);
      box-shadow: inset 3px 0 0 var(--att-color-primary);
    }
    .date {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      line-height: 1.2;
    }
    .main {
      min-width: 0;
    }
    .payee {
      margin: 0;
      font-size: var(--att-type-body-size);
      font-weight: 500;
      color: var(--att-color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      align-items: center;
      margin-top: var(--att-space-1);
    }
    .account {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .amount {
      text-align: right;
    }
    :host([pending]) .payee {
      color: var(--att-color-text-muted);
    }
  `;

  private dateLabel(): string {
    if (!this.date) return "—";
    if (/^\d{4}-\d{2}-\d{2}/.test(this.date)) {
      return formatShortDate(this.date);
    }
    return this.date;
  }

  render() {
    return html`
      <div class="row" part="row">
        <div class="date" part="date">${this.dateLabel()}</div>
        <div class="main">
          <p class="payee" part="payee">${this.payee || "Unknown"}</p>
          <div class="meta">
            ${this.category
              ? html`<att-chip tone="neutral">${this.category}</att-chip>`
              : ""}
            ${this.pending ? html`<att-chip tone="warning">Pending</att-chip>` : ""}
            ${this.account ? html`<span class="account">${this.account}</span>` : ""}
          </div>
        </div>
        <div class="amount" part="amount">
          <att-money
            .amount=${this.amount}
            .tone=${this.pending ? "pending" : "neutral"}
            sign="auto"
          ></att-money>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("att-transaction-row")) {
  customElements.define("att-transaction-row", AttTransactionRow);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-transaction-row": AttTransactionRow;
  }
}
