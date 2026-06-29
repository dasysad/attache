/**
 * att-cost-receipt — transparent monthly cost breakdown (pricing UX).
 */
import { LitElement, css, html } from "lit";

export interface CostLine {
  label: string;
  totalUsd: number;
  vendor?: string;
  category: "platform" | "pass_through" | "usage";
}

export class AttCostReceipt extends LitElement {
  static properties = {
    lines: { type: Array },
    totalUsd: { type: Number },
    disclaimer: { type: String },
    apiQuery: { type: String },
    loading: { type: Boolean },
  };

  lines: CostLine[] = [];
  totalUsd = 0;
  disclaimer = "";
  apiQuery = "";
  loading = false;

  static styles = css`
    :host { display: block; }
    .receipt {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--att-type-mono-size);
      font-family: var(--att-font-mono);
    }
    th, td {
      padding: var(--att-space-3) var(--att-space-4);
      text-align: left;
      border-bottom: var(--att-border-thin) solid var(--att-color-outline);
    }
    th { color: var(--att-color-text-subtle); font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .vendor { color: var(--att-color-text-subtle); font-size: 0.75rem; }
    tfoot td { font-weight: 600; color: var(--att-color-text); }
    .grand td {
      font-size: 1.125rem;
      color: var(--att-color-primary);
      border-bottom: none;
    }
    .empty {
      padding: var(--att-space-6);
      text-align: center;
      color: var(--att-color-text-muted);
    }
    .note {
      padding: var(--att-space-4);
      font-size: var(--att-type-label-size);
      color: var(--att-color-text-subtle);
      border-top: var(--att-border-thin) solid var(--att-color-outline);
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    if (this.apiQuery) void this.fetchEstimate();
  }

  async fetchEstimate(): Promise<void> {
    this.loading = true;
    try {
      const res = await fetch(`/api/costs/estimate.json?${this.apiQuery}`);
      const data = (await res.json()) as {
        lineItems: Array<{
          label: string;
          totalUsd: number;
          vendor?: string;
          category: CostLine["category"];
        }>;
        totalUsd: number;
        disclaimer: string;
      };
      this.lines = data.lineItems.map((l) => ({
        label: l.label,
        totalUsd: l.totalUsd,
        vendor: l.vendor,
        category: l.category,
      }));
      this.totalUsd = data.totalUsd;
      this.disclaimer = data.disclaimer;
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="empty">Calculating…</div>`;
    }
    if (!this.lines.length) {
      return html`
        <div class="receipt empty">
          <p><strong>$0.00</strong> / month</p>
          <p>Local-first — no cloud fees.</p>
        </div>
      `;
    }
    return html`
      <div class="receipt">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${this.lines.map(
              (line) => html`
                <tr>
                  <td>
                    ${line.label}
                    ${line.vendor
                      ? html`<span class="vendor"> (${line.vendor})</span>`
                      : ""}
                  </td>
                  <td class="num">$${line.totalUsd.toFixed(2)}</td>
                </tr>
              `,
            )}
          </tbody>
          <tfoot>
            <tr class="grand">
              <td>Estimated monthly</td>
              <td class="num">$${this.totalUsd.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        ${this.disclaimer ? html`<p class="note">${this.disclaimer}</p>` : ""}
      </div>
    `;
  }
}

if (!customElements.get("att-cost-receipt")) {
  customElements.define("att-cost-receipt", AttCostReceipt);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-cost-receipt": AttCostReceipt;
  }
}
