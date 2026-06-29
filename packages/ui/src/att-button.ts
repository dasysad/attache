/**
 * att-button — primary actions for household finance flows.
 * Decorator-free for Lens / plain Vite (see cel-button in @celestial/components).
 */
import { LitElement, css, html } from "lit";

export type AttButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export class AttButton extends LitElement {
  static properties = {
    variant: { type: String },
    disabled: { type: Boolean, reflect: true },
    type: { type: String },
  };

  variant: AttButtonVariant = "primary";
  disabled = false;
  type: "button" | "submit" = "button";

  static styles = css`
    :host { display: inline-block; }
    button {
      font-family: var(--att-font-sans);
      font-size: var(--att-type-body-size);
      font-weight: 600;
      line-height: 1;
      padding: var(--att-space-3) var(--att-space-5);
      border-radius: var(--att-radius-md);
      border: var(--att-border-thin) solid transparent;
      cursor: pointer;
      transition: background var(--att-motion-fast),
        border-color var(--att-motion-fast),
        box-shadow var(--att-motion-fast);
    }
    .primary {
      background: var(--att-color-primary);
      color: var(--att-color-on-primary);
    }
    .primary:hover:not(:disabled) {
      background: var(--att-color-primary-hover);
    }
    .secondary {
      background: var(--att-color-surface-raised);
      color: var(--att-color-text);
      border-color: var(--att-color-outline);
    }
    .secondary:hover:not(:disabled) {
      border-color: var(--att-color-primary);
    }
    .ghost {
      background: transparent;
      color: var(--att-color-primary);
    }
    .ghost:hover:not(:disabled) {
      background: rgba(61, 154, 139, 0.12);
    }
    .danger {
      background: var(--att-color-error);
      color: #fff;
    }
    button:focus-visible {
      outline: none;
      box-shadow: var(--att-shadow-focus);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `;

  render() {
    return html`
      <button class=${this.variant} type=${this.type} ?disabled=${this.disabled}>
        <slot></slot>
      </button>
    `;
  }
}

if (!customElements.get("att-button")) customElements.define("att-button", AttButton);

declare global {
  interface HTMLElementTagNameMap {
    "att-button": AttButton;
  }
}
