/**
 * att-wizard-steps — onboarding step indicator (VS-2 / ADR-015 P3).
 * Default labels: household → find mail → connect → account → bills.
 * Why: discover and connect are skippable but still appear in the map so
 * users see they can skip, not that the product requires Gmail.
 */
import { LitElement, css, html } from "lit";

export class AttWizardSteps extends LitElement {
  static properties = {
    current: { type: Number },
    total: { type: Number },
    labels: { type: String },
  };

  current = 1;
  total = 5;
  labels = "Household,Find mail,Connect,Account,Bills";

  static styles = css`
    :host {
      display: block;
    }
    ol {
      display: flex;
      gap: var(--att-space-2);
      list-style: none;
      margin: 0 0 var(--att-space-6);
      padding: 0;
    }
    li {
      flex: 1;
      text-align: center;
      font-size: var(--att-type-label-size);
      font-weight: 600;
      padding: var(--att-space-2) var(--att-space-3);
      border-radius: var(--att-radius-md);
      color: var(--att-color-text-subtle);
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
    }
    li.active {
      color: var(--att-color-on-primary);
      background: var(--att-color-primary);
      border-color: var(--att-color-primary);
    }
    li.done {
      color: var(--att-color-success);
      border-color: var(--att-color-success);
    }
  `;

  render() {
    const items = this.labels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const total = this.total > 0 ? this.total : items.length;
    return html`
      <ol part="steps">
        ${items.slice(0, total).map(
          (label, i) => html`
            <li class="${i + 1 === this.current ? "active" : i + 1 < this.current ? "done" : ""}">
              ${label}
            </li>
          `,
        )}
      </ol>
    `;
  }
}

if (!customElements.get("att-wizard-steps")) {
  customElements.define("att-wizard-steps", AttWizardSteps);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-wizard-steps": AttWizardSteps;
  }
}
