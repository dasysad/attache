/**
 * att-select — native select styled for theme consistency.
 */
import { LitElement, css, html } from "lit";

export class AttSelect extends LitElement {
  static properties = {
    label: { type: String },
    value: { type: String },
  };

  label = "";
  value = "";

  static styles = css`
    :host { display: block; }
    label {
      display: block;
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      color: var(--att-color-text-muted);
      margin-bottom: var(--att-space-2);
    }
    select {
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
    }
    select:focus {
      border-color: var(--att-color-primary);
      box-shadow: var(--att-shadow-focus);
    }
  `;

  private onChange(e: Event) {
    this.value = (e.target as HTMLSelectElement).value;
    this.dispatchEvent(
      new CustomEvent("att-change", {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      ${this.label ? html`<label>${this.label}</label>` : ""}
      <select .value=${this.value} @change=${this.onChange}>
        <slot></slot>
      </select>
    `;
  }
}

if (!customElements.get("att-select")) customElements.define("att-select", AttSelect);

declare global {
  interface HTMLElementTagNameMap {
    "att-select": AttSelect;
  }
}
