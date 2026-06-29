/**
 * att-obligation-row — bill / recurring payment due line item.
 *
 * `status` is computed by the server or forecast engine; the row only renders
 * severity (overdue vs upcoming) — it does not infer dates client-side.
 */
import { LitElement, css, html } from "lit";
import { formatShortDate } from "./format-money.js";
import "./att-money.js";
import "./att-chip.js";

export type AttObligationStatus =
  | "upcoming"
  | "due_soon"
  | "overdue"
  | "paid"
  | "scheduled";

export class AttObligationRow extends LitElement {
  static properties = {
    payee: { type: String },
    dueDate: { type: String },
    amount: { type: Number },
    status: { type: String },
    cadence: { type: String },
    provenance: { type: String },
    autopay: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
  };

  payee = "";
  dueDate = "";
  /** USD; always positive for amounts owed. */
  amount = 0;
  status: AttObligationStatus = "upcoming";
  cadence = "";
  provenance = "";
  autopay = false;
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
    :host([data-severity="overdue"]) .row {
      box-shadow: inset 3px 0 0 var(--att-color-error);
    }
    .due {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      line-height: 1.2;
    }
    :host([data-severity="overdue"]) .due {
      color: var(--att-color-error);
      font-weight: 600;
    }
    .payee {
      margin: 0;
      font-size: var(--att-type-body-size);
      font-weight: 500;
      color: var(--att-color-text);
    }
    :host([data-severity="paid"]) .payee {
      color: var(--att-color-text-muted);
      text-decoration: line-through;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      align-items: center;
      margin-top: var(--att-space-1);
    }
    .cadence {
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .amount {
      text-align: right;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.syncSeverity();
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has("status")) {
      this.syncSeverity();
    }
  }

  private syncSeverity(): void {
    const severity =
      this.status === "overdue"
        ? "overdue"
        : this.status === "paid"
          ? "paid"
          : "default";
    this.dataset.severity = severity;
  }

  private statusChip() {
    switch (this.status) {
      case "overdue":
        return html`<att-chip tone="error">Overdue</att-chip>`;
      case "due_soon":
        return html`<att-chip tone="warning">Due soon</att-chip>`;
      case "paid":
        return html`<att-chip tone="success">Paid</att-chip>`;
      case "scheduled":
        return html`<att-chip tone="info">Scheduled</att-chip>`;
      default:
        return "";
    }
  }

  private dueLabel(): string {
    if (!this.dueDate) return "—";
    if (/^\d{4}-\d{2}-\d{2}/.test(this.dueDate)) {
      return formatShortDate(this.dueDate);
    }
    return this.dueDate;
  }

  render() {
    const moneyTone =
      this.status === "paid"
        ? "muted"
        : this.status === "overdue"
          ? "outflow"
          : "neutral";

    return html`
      <div class="row" part="row">
        <div class="due" part="due">${this.dueLabel()}</div>
        <div class="main">
          <p class="payee" part="payee">${this.payee || "Obligation"}</p>
          <div class="meta">
            ${this.statusChip()}
            ${this.autopay ? html`<att-chip tone="info">Autopay</att-chip>` : ""}
            ${this.cadence ? html`<span class="cadence">${this.cadence}</span>` : ""}
            ${this.provenance
              ? html`<att-chip tone="neutral">${this.provenance}</att-chip>`
              : ""}
          </div>
        </div>
        <div class="amount" part="amount">
          <att-money
            .amount=${this.amount}
            .tone=${moneyTone}
            sign="never"
          ></att-money>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("att-obligation-row")) {
  customElements.define("att-obligation-row", AttObligationRow);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-obligation-row": AttObligationRow;
  }
}
