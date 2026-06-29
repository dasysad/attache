/**
 * att-input — labeled text field for amounts, names, search.
 */
import { LitElement, css, html } from "lit";

export class AttInput extends LitElement {
  static properties = {
    label: { type: String },
    hint: { type: String },
    placeholder: { type: String },
    value: { type: String },
    inputmode: { type: String },
    disabled: { type: Boolean },
  };

  label = "";
  hint = "";
  placeholder = "";
  value = "";
  inputmode = "";
  disabled = false;

  static styles = css`
    :host { display: block; }
    label {
      display: block;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      color: var(--att-color-text-muted);
      margin-bottom: var(--att-space-2);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      font-family: var(--att-font-sans);
      font-size: var(--att-type-body-size);
      color: var(--att-color-text);
      background: var(--att-color-bg);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-md);
      padding: var(--att-space-3) var(--att-space-4);
      outline: none;
      transition: border-color var(--att-motion-fast), box-shadow var(--att-motion-fast);
    }
    input::placeholder { color: var(--att-color-text-subtle); }
    input:focus {
      border-color: var(--att-color-primary);
      box-shadow: var(--att-shadow-focus);
    }
    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hint {
      margin-top: var(--att-space-2);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
    }
  `;

  private onInput(e: Event) {
    this.value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(
      new CustomEvent("att-input", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <input
        .value=${this.value}
        placeholder=${this.placeholder}
        inputmode=${this.inputmode || undefined}
        ?disabled=${this.disabled}
        @input=${this.onInput}
      />
      ${this.hint ? html`<div class="hint">${this.hint}</div>` : ""}
    `;
  }
}

if (!customElements.get("att-input")) customElements.define("att-input", AttInput);

declare global {
  interface HTMLElementTagNameMap {
    "att-input": AttInput;
  }
}
