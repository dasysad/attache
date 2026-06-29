/**
 * att-obligation-timeline — due dates across the forecast horizon (VS-2).
 */
import { LitElement, css, html } from "lit";
import { formatShortDate } from "./format-money.js";

export interface TimelineItem {
  date: string;
  payee: string;
  amountUsd: number;
  status?: string;
}

export class AttObligationTimeline extends LitElement {
  static properties = {
    itemsJson: { type: String, attribute: "items-json" },
    horizonDays: { type: Number, attribute: "horizon-days" },
  };

  itemsJson = "[]";
  horizonDays = 30;

  static styles = css`
    :host {
      display: block;
    }
    .timeline {
      background: var(--att-color-surface);
      border: var(--att-border-thin) solid var(--att-color-outline);
      border-radius: var(--att-radius-lg);
      padding: var(--att-space-4);
    }
    .title {
      margin: 0 0 var(--att-space-4);
      font-size: var(--att-type-label-size);
      font-weight: var(--att-type-label-weight);
      letter-spacing: var(--att-type-label-tracking);
      text-transform: uppercase;
      color: var(--att-color-text-subtle);
    }
    .track {
      position: relative;
      height: 4px;
      background: var(--att-color-outline);
      border-radius: 2px;
      margin: var(--att-space-6) var(--att-space-2) var(--att-space-4);
    }
    .marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--att-color-primary);
      border: 2px solid var(--att-color-surface);
    }
    .marker.overdue {
      background: var(--att-color-error);
    }
    .marker.due_soon {
      background: var(--att-color-warning);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--att-space-2);
      max-height: 220px;
      overflow-y: auto;
    }
    .row {
      display: grid;
      grid-template-columns: 4rem 1fr auto;
      gap: var(--att-space-3);
      align-items: center;
      font-size: var(--att-type-label-size);
    }
    .date {
      color: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
    }
    .payee {
      color: var(--att-color-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .amount {
      font-family: var(--att-font-mono);
      font-variant-numeric: tabular-nums;
      color: var(--att-color-text-muted);
    }
    .empty {
      color: var(--att-color-text-muted);
      font-size: var(--att-type-body-size);
      text-align: center;
      padding: var(--att-space-6);
    }
    .ends {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: var(--att-color-text-subtle);
      font-family: var(--att-font-mono);
      margin-top: var(--att-space-2);
    }
  `;

  private parseItems(): TimelineItem[] {
    try {
      const data = JSON.parse(this.itemsJson) as TimelineItem[];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  private dayOffset(dateIso: string, startIso: string): number {
    const a = new Date(dateIso + "T12:00:00Z").getTime();
    const b = new Date(startIso + "T12:00:00Z").getTime();
    return Math.round((a - b) / 86_400_000);
  }

  render() {
    const items = this.parseItems().sort((a, b) => a.date.localeCompare(b.date));
    if (!items.length) {
      return html`
        <div class="timeline">
          <h4 class="title">Obligation timeline</h4>
          <p class="empty">No bills in the next ${this.horizonDays} days.</p>
        </div>
      `;
    }

    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString()
      .slice(0, 10);
    const endDate = new Date(start + "T12:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() + this.horizonDays - 1);
    const end = endDate.toISOString().slice(0, 10);

    const inHorizon = items.filter((item) => {
      const off = this.dayOffset(item.date, start);
      return off >= 0 && off < this.horizonDays;
    });
    const markers = inHorizon.map((item) => {
      const offset = this.dayOffset(item.date, start);
      const pct = Math.min(100, Math.max(0, (offset / Math.max(this.horizonDays - 1, 1)) * 100));
      const statusClass =
        item.status === "overdue" || item.status === "due_soon" ? item.status : "";
      return html`<span
        class="marker ${statusClass}"
        style="left: ${pct}%"
        title="${item.payee} — $${item.amountUsd.toFixed(2)}"
      ></span>`;
    });

    return html`
      <div class="timeline">
        <h4 class="title">Obligation timeline</h4>
        <div class="track">${markers}</div>
        <div class="ends">
          <span>${formatShortDate(start)}</span>
          <span>${formatShortDate(end)}</span>
        </div>
        <div class="list">
          ${inHorizon.slice(0, 12).map(
            (item) => html`
              <div class="row">
                <span class="date">${formatShortDate(item.date)}</span>
                <span class="payee">${item.payee}</span>
                <span class="amount">$${item.amountUsd.toFixed(2)}</span>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }
}

if (!customElements.get("att-obligation-timeline")) {
  customElements.define("att-obligation-timeline", AttObligationTimeline);
}

declare global {
  interface HTMLElementTagNameMap {
    "att-obligation-timeline": AttObligationTimeline;
  }
}
