/**
 * att-list — bordered stack for transaction, obligation, and account rows.
 *
 * Slotted row components get dividers automatically. Optional heading and
 * footer slot for "view all" links.
 */
import { LitElement, css, html } from "lit";

export class AttList extends LitElement {
  static properties = {
    heading: { type: String },
    dense: { type: Boolean, reflect: true },
  };

  heading = "";
  dense = false;

  static styles = css`
    :host {
      display: block;
    }
    .list {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      overflow: hidden;
    }
    .header {
      padding: var(--att-space-4) var(--att-space-4) var(--att-space-2);
      border-bottom: var(--att-border-thin) solid var(--att-color-outline);
    }
    .heading {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .body ::slotted(*) {
      display: block;
      border-bottom: var(--att-border-thin) solid var(--att-color-outline);
    }
    .body ::slotted(*:last-child) {
      border-bottom: none;
    }
    :host([dense]) .body ::slotted(att-transaction-row),
    :host([dense]) .body ::slotted(att-obligation-row) {
      /* Rows keep their own padding; dense trims via row internals later if needed */
    }
    .empty {
      padding: var(--att-space-8) var(--att-space-4);
      text-align: center;
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
    }
    .footer {
      padding: var(--att-space-3) var(--att-space-4);
      border-top: var(--att-border-thin) solid var(--att-color-outline);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
      text-align: center;
    }
  `;

  render() {
    return html`
      <div class="list" part="list">
        ${this.heading
          ? html`
              <div class="header">
                <h4 class="heading">${this.heading}</h4>
              </div>
            `
          : ""}
        <div class="body">
          <slot></slot>
          <slot name="empty">
            <div class="empty" hidden>Nothing here yet.</div>
          </slot>
        </div>
        <slot name="footer"></slot>
      </div>
    `;
  }
}

if (!customElements.get("att-list")) {
  customElements.define("att-list", AttList);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-list": AttList;
  }
}
