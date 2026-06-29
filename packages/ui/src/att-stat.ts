/**
 * att-stat — runway / KPI metric tile for dashboard headers.
 */
import { LitElement, css, html } from "lit";

export type AttStatTone = "neutral" | "good" | "warn" | "bad";

export class AttStat extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
    unit: { type: String },
    helper: { type: String },
    tone: { type: String },
  };

  label = "";
  value = "";
  unit = "";
  helper = "";
  tone: AttStatTone = "neutral";

  static styles = css`
    :host {
      display: block;
    }
    .stat {
      padding: var(--att-space-4) var(--att-space-5);
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      box-shadow: var(--att-shadow-sm);
    }
    .label {
      margin: 0;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .value-row {
      display: flex;
      align-items: baseline;
      gap: var(--att-space-2);
      margin-top: var(--att-space-2);
    }
    .value {
      font-size: var(--att-type-display-size);
      font-weight: var(--att-type-display-weight);
      line-height: 1;
      color: var(--stat-color, var(--att-color-text));
      font-variant-numeric: tabular-nums;
    }
    .unit {
      font-size: var(--att-type-body-size);
      color: var(--att-color-text-muted);
      font-weight: 500;
    }
    .helper {
      margin: var(--att-space-2) 0 0;
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
    .neutral { --stat-color: var(--att-color-text); }
    .good { --stat-color: var(--att-color-success); }
    .warn { --stat-color: var(--att-color-warning); }
    .bad { --stat-color: var(--att-color-error); }
  `;

  render() {
    return html`
      <div class="stat ${this.tone}" part="stat">
        <p class="label" part="label">${this.label}</p>
        <div class="value-row">
          <span class="value ${this.tone}" part="value">${this.value}</span>
          ${this.unit ? html`<span class="unit" part="unit">${this.unit}</span>` : ""}
        </div>
        ${this.helper ? html`<p class="helper" part="helper">${this.helper}</p>` : ""}
      </div>
    `;
  }
}

if (!customElements.get("att-stat")) {
  customElements.define("att-stat", AttStat);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-stat": AttStat;
  }
}
