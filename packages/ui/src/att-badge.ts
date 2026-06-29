/**
 * att-badge — notification counts and severity pills (HITL queue, alerts).
 */
import { LitElement, css, html } from "lit";

export type AttBadgeSeverity = "info" | "warning" | "action" | "error";

export class AttBadge extends LitElement {
  static properties = {
    severity: { type: String },
  };

  severity: AttBadgeSeverity = "info";

  static styles = css`
    :host { display: inline-block; }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.25rem;
      padding: 0 var(--att-space-2);
      height: 1.25rem;
      border-radius: 999px;
      font-size: 0.6875rem;
      font-weight: 700;
      font-family: var(--att-font-mono);
      color: #fff;
      background: var(--badge-bg);
    }
    .info { --badge-bg: var(--att-color-info); }
    .warning { --badge-bg: var(--att-color-warning); color: #1a1400; }
    .action { --badge-bg: var(--att-color-action); }
    .error { --badge-bg: var(--att-color-error); }
  `;

  render() {
    return html`<span class="badge ${this.severity}"><slot></slot></span>`;
  }
}

if (!customElements.get("att-badge")) customElements.define("att-badge", AttBadge);

declare global {
  interface HTMLElementTagNameMap {
    "att-badge": AttBadge;
  }
}
