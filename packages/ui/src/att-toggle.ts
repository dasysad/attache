/**
 * att-toggle — binary settings (enable platform, cloud backup, notifications).
 */
import { LitElement, css, html } from "lit";

export class AttToggle extends LitElement {
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
    .track {
      width: 2.5rem;
      height: 1.375rem;
      border-radius: 999px;
      background: var(--att-color-outline);
      position: relative;
      transition: background var(--att-motion-fast);
    }
    .thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 1rem;
      height: 1rem;
      border-radius: 50%;
      background: #fff;
      transition: transform var(--att-motion-fast);
    }
    input {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }
    input:checked + .track {
      background: var(--att-color-primary);
    }
    input:checked + .track .thumb {
      transform: translateX(1.125rem);
    }
    input:focus-visible + .track {
      box-shadow: var(--att-shadow-focus);
    }
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
          role="switch"
          .checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.onChange}
        />
        <span class="track"><span class="thumb"></span></span>
        <span>${this.label}</span>
      </label>
    `;
  }
}

if (!customElements.get("att-toggle")) customElements.define("att-toggle", AttToggle);

declare global {
  interface HTMLElementTagNameMap {
    "att-toggle": AttToggle;
  }
}
