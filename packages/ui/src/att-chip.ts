/**
 * att-chip — compact status tags (subscription, category, sync state).
 */
import { LitElement, css, html } from "lit";

export type AttChipTone = "neutral" | "success" | "warning" | "error" | "info";

export class AttChip extends LitElement {
  static properties = {
    tone: { type: String },
  };

  tone: AttChipTone = "neutral";

  static styles = css`
    :host { display: inline-block; }
    .chip {
      display: inline-flex;
      align-items: center;
      font-size: var(--att-type-label-size);
      font-weight: 600;
      padding: var(--att-space-1) var(--att-space-3);
      border-radius: 999px;
      border: var(--att-border-thin) solid var(--chip-border);
      color: var(--chip-text);
      background: var(--chip-bg);
      white-space: nowrap;
    }
    .neutral {
      --chip-border: var(--att-color-outline);
      --chip-text: var(--att-color-text-muted);
      --chip-bg: transparent;
    }
    .success {
      --chip-border: var(--att-color-success);
      --chip-text: var(--att-color-success);
      --chip-bg: rgba(61, 154, 107, 0.12);
    }
    .warning {
      --chip-border: var(--att-color-warning);
      --chip-text: var(--att-color-warning);
      --chip-bg: rgba(201, 162, 39, 0.12);
    }
    .error {
      --chip-border: var(--att-color-error);
      --chip-text: var(--att-color-error);
      --chip-bg: rgba(232, 93, 93, 0.12);
    }
    .info {
      --chip-border: var(--att-color-info);
      --chip-text: var(--att-color-info);
      --chip-bg: rgba(74, 143, 212, 0.12);
    }
  `;

  render() {
    return html`<span class="chip ${this.tone}"><slot></slot></span>`;
  }
}

if (!customElements.get("att-chip")) customElements.define("att-chip", AttChip);

declare global {
  interface HTMLElementTagNameMap {
    "att-chip": AttChip;
  }
}
