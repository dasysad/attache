/**
 * att-card — grouped content: obligation, account summary, settings section.
 */
import { LitElement, css, html } from "lit";

export class AttCard extends LitElement {
  static properties = {
    heading: { type: String },
    eyebrow: { type: String },
  };

  heading = "";
  eyebrow = "";

  static styles = css`
    :host { display: block; }
    .card {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-5);
      box-shadow: var(--att-shadow-sm);
    }
    .header {
      margin-bottom: var(--att-space-4);
    }
    .eyebrow {
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
      margin: 0 0 var(--att-space-1);
    }
    .heading {
      font-size: var(--att-type-headline-size);
      font-weight: var(--att-type-headline-weight);
      margin: 0;
      color: var(--att-color-text);
    }
    .footer {
      margin-top: var(--att-space-4);
      padding-top: var(--att-space-4);
      border-top: var(--att-border-thin) solid var(--att-color-outline);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-muted);
    }
  `;

  render() {
    return html`
      <div class="card">
        ${this.heading || this.eyebrow
          ? html`
              <div class="header">
                ${this.eyebrow ? html`<p class="eyebrow">${this.eyebrow}</p>` : ""}
                ${this.heading ? html`<h3 class="heading">${this.heading}</h3>` : ""}
              </div>
            `
          : ""}
        <slot></slot>
        <slot name="footer"></slot>
      </div>
    `;
  }
}

if (!customElements.get("att-card")) customElements.define("att-card", AttCard);

declare global {
  interface HTMLElementTagNameMap {
    "att-card": AttCard;
  }
}
