/**
 * att-account-row — funding account summary for dashboard and link flows.
 */
import { LitElement, css, html } from "lit";
import "./att-money.js";
import "./att-chip.js";

export type AttAccountSyncStatus = "fresh" | "stale" | "error" | "manual";

export class AttAccountRow extends LitElement {
  static properties = {
    name: { type: String },
    mask: { type: String },
    institution: { type: String },
    kind: { type: String },
    balance: { type: Number },
    balanceLabel: { type: String, attribute: "balance-label" },
    syncStatus: { type: String },
    syncLabel: { type: String },
    primary: { type: Boolean, reflect: true },
    selected: { type: Boolean, reflect: true },
  };

  name = "";
  mask = "";
  institution = "";
  /** checking | savings | cash | brokerage | credit | loan — shown as a chip when set. */
  kind = "";
  balance = 0;
  /** Override; credit/loan default to "Balance owed". */
  balanceLabel = "";
  syncStatus: AttAccountSyncStatus = "manual";
  syncLabel = "";
  primary = false;
  selected = false;

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--att-space-4);
      align-items: center;
      padding: var(--att-space-4);
      background: var(--att-color-surface);
      transition: background var(--att-motion-fast);
    }
    :host([selected]) .row,
    :host([primary]) .row {
      background: var(--att-color-surface-raised);
    }
    :host([primary]) .row {
      box-shadow: inset 3px 0 0 var(--att-color-primary);
    }
    .title {
      margin: 0;
      font-size: var(--att-type-body-size);
      font-weight: 600;
      color: var(--att-color-text);
    }
    .subtitle {
      margin: var(--att-space-1) 0 0;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--att-space-2);
      margin-top: var(--att-space-2);
    }
    .balance {
      text-align: right;
    }
    .balance-label {
      display: block;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      margin-bottom: var(--att-space-1);
      text-transform: uppercase;
      letter-spacing: var(--att-type-label-tracking);
    }
  `;

  private displayName(): string {
    const parts = [this.name, this.mask].filter(Boolean);
    return parts.join(" ") || "Account";
  }

  private syncChip() {
    switch (this.syncStatus) {
      case "fresh":
        return html`<att-chip tone="success">Synced</att-chip>`;
      case "stale":
        return html`<att-chip tone="warning">Stale</att-chip>`;
      case "error":
        return html`<att-chip tone="error">Sync error</att-chip>`;
      default:
        return html`<att-chip tone="neutral">Manual</att-chip>`;
    }
  }

  private resolvedBalanceLabel(): string {
    if (this.balanceLabel) return this.balanceLabel;
    if (this.kind === "credit" || this.kind === "loan") return "Balance owed";
    return "Available";
  }

  render() {
    const owed = this.kind === "credit" || this.kind === "loan";
    return html`
      <div class="row" part="row">
        <div class="main">
          <p class="title" part="title">${this.displayName()}</p>
          ${this.institution
            ? html`<p class="subtitle">${this.institution}</p>`
            : ""}
          <div class="meta">
            ${this.kind ? html`<att-chip tone="neutral">${this.kind}</att-chip>` : ""}
            ${this.syncChip()}
            ${this.primary ? html`<att-chip tone="info">Ledger primary</att-chip>` : ""}
            ${this.syncLabel
              ? html`<span class="subtitle" style="margin:0">${this.syncLabel}</span>`
              : ""}
          </div>
        </div>
        <div class="balance" part="balance">
          <span class="balance-label">${this.resolvedBalanceLabel()}</span>
          <att-money
            .amount=${this.balance}
            size="lg"
            tone=${owed ? "outflow" : "neutral"}
            sign="never"
          ></att-money>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("att-account-row")) {
  customElements.define("att-account-row", AttAccountRow);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-account-row": AttAccountRow;
  }
}
