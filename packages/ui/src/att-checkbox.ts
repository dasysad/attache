/**
 * att-checkbox — consent, multi-select filters, rule toggles.
 */
import { LitElement, css, html } from "lit";

export class AttCheckbox extends LitElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean },
    label: { type: String },
  };

  checked = false;
  disabled = false;
  label = "";

  static styles = css`
    :host { display: inline-block; }
    label {
      display: inline-flex;
      align-items: center;
      gap: var(--att-space-3);
      cursor: pointer;
      font-size: var(--att-type-body-size);
      color: var(--att-color-text);
    }
    input {
      appearance: none;
      width: 1.125rem;
      height: 1.125rem;
      margin: 0;
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-sm);
      background: var(--att-color-bg);
      display: grid;
      place-content: center;
      transition: border-color var(--att-motion-fast), background var(--att-motion-fast);
    }
    input::before {
      content: "";
      width: 0.5rem;
      height: 0.25rem;
      border: 2px solid #fff;
      border-top: none;
      border-right: none;
      transform: rotate(-45deg) scale(0);
      transition: transform var(--att-motion-fast);
    }
    input:checked {
      background: var(--att-color-primary);
      border-color: var(--att-color-primary);
    }
    input:checked::before { transform: rotate(-45deg) scale(1); }
    input:focus-visible { box-shadow: var(--att-shadow-focus); }
    input:disabled + span { opacity: 0.5; }
  `;

  private onChange(e: Event) {
    this.checked = (e.target as HTMLInputElement).checked;
    this.dispatchEvent(
      new CustomEvent("att-change", {
        detail: { checked: this.checked },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <label>
        <input
          type="checkbox"
          .checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.onChange}
        />
        <span>${this.label}<slot></slot></span>
      </label>
    `;
  }
}

if (!customElements.get("att-checkbox")) customElements.define("att-checkbox", AttCheckbox);

declare global {
  interface HTMLElementTagNameMap {
    "att-checkbox": AttCheckbox;
  }
}
