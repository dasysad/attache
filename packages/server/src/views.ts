import type { Context } from "hono";
import {
  estimateMonthlyCost,
  PLATFORM_PRICING,
  PRICING_SCENARIOS,
  PASS_THROUGH_RATES,
  type CostEstimate,
  type FundingAccount,
  type BankTransaction,
  type Obligation,
  type ObligationOccurrence,
  type PlaidItem,
  type SolvencyForecast,
  type IngestedEvent,
  type BillExtractPayload,
  type ImapAccount,
  type GmailAccount,
  type TransferProposalRecord,
  HITL_CONFIDENCE_THRESHOLD,
} from "@attache/core";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Safe JSON for embedding in HTML attributes (SSR → Lit parse). */
function jsonAttr(value: unknown): string {
  return escapeHtml(JSON.stringify(value));
}

export function layout(title: string, body: string): string {
  const navBadge =
    navUnreadCount > 0
      ? ` <att-badge severity="action">${navUnreadCount}</att-badge>`
      : "";
  const transferBadge =
    transferPendingCount > 0
      ? ` <att-badge severity="action">${transferPendingCount}</att-badge>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Attache</title>
  <script src="/static/htmx.min.js"></script>
  <script type="module" src="/static/attache-ui.js"></script>
  <link rel="stylesheet" href="/static/attache.css" />
</head>
<body>
  <header class="site-header">
    <a href="/" class="logo">Attache</a>
    <nav>
      <a href="/">Dashboard</a>
      <a href="/app/accounts">Accounts</a>
      <a href="/app/obligations">Obligations</a>
      <a href="/app/transfers">Transfers${transferBadge}</a>
      <a href="/app/plaid">Plaid</a>
      <a href="/app/ingest">Ingest</a>
      <a href="/app/notifications">Alerts${navBadge}</a>
      <a href="/pricing">Pricing</a>
      <a href="/app/costs">Costs</a>
    </nav>
  </header>
  <main class="site-main">${body}</main>
  <footer class="site-footer">
    <p>Local-first household finance. Costs shown at cost — no fantasy margins.</p>
  </footer>
</body>
</html>`;
}

/** Set before rendering any layout-backed page (server refreshes alerts first). */
let navUnreadCount = 0;
let transferPendingCount = 0;

export function setNavUnreadCount(count: number): void {
  navUnreadCount = count;
}

export function setTransferPendingCount(count: number): void {
  transferPendingCount = count;
}

function severityClass(severity: string): string {
  if (severity === "action_required") return "action";
  if (severity === "warning") return "warning";
  return "info";
}

export function notificationsPage(
  notifications: Array<{
    id: string;
    severity: string;
    kind: string;
    title: string;
    body: string;
    actionUrl: string | null;
    readAt: string | null;
    createdAt: string;
  }>,
  pushEnabled: boolean,
  vapidPublicKey: string | null,
  message?: string,
): string {
  const rows =
    notifications.length === 0
      ? `<p class="empty-hint">No alerts — you're caught up.</p>`
      : `<ul class="notification-list">${notifications
          .map((n) => {
            const unread = !n.readAt;
            const action = n.actionUrl
              ? `<a href="${escapeHtml(n.actionUrl)}" class="btn-secondary">Open</a>`
              : "";
            const markRead = unread
              ? `<form method="post" action="/app/notifications/${escapeHtml(n.id)}/read" style="display:inline">
                   <button type="submit" class="btn-link">Mark read</button>
                 </form>`
              : `<span class="meta">Read</span>`;
            return `<li class="notification-item ${unread ? "unread" : "read"} severity-${severityClass(n.severity)}">
              <div class="notification-head">
                <span class="chip chip-${severityClass(n.severity)}">${escapeHtml(n.kind)}</span>
                <strong>${escapeHtml(n.title)}</strong>
                <time class="meta">${escapeHtml(n.createdAt.slice(0, 16))}</time>
              </div>
              <p>${escapeHtml(n.body)}</p>
              <div class="wizard-actions">${action} ${markRead}</div>
            </li>`;
          })
          .join("")}</ul>`;

  const pushBlock = pushEnabled
    ? `<div class="push-panel">
         <h2>Web push</h2>
         <p class="meta">Browser alerts when new items arrive (local VAPID keys).</p>
         <button type="button" id="enable-push" class="btn-secondary">Enable push</button>
         <p id="push-status" class="meta"></p>
         <script type="module">
           const pub = ${JSON.stringify(vapidPublicKey)};
           const btn = document.getElementById('enable-push');
           const status = document.getElementById('push-status');
           if (!pub) {
             status.textContent = 'Set ATTACHE_VAPID_PUBLIC_KEY / ATTACHE_VAPID_PRIVATE_KEY to enable.';
             btn.disabled = true;
           } else if (!('serviceWorker' in navigator)) {
             status.textContent = 'Service workers not supported in this browser.';
             btn.disabled = true;
           } else {
             btn.addEventListener('click', async () => {
               try {
                 const reg = await navigator.serviceWorker.register('/static/sw.js');
                 const toUint8 = (b64) => {
                   const pad = '='.repeat((4 - (b64.length % 4)) % 4);
                   const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
                   return Uint8Array.from(raw, (c) => c.charCodeAt(0));
                 };
                 const sub = await reg.pushManager.subscribe({
                   userVisibleOnly: true,
                   applicationServerKey: toUint8(pub),
                 });
                 const res = await fetch('/api/notifications/push-subscribe', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify(sub.toJSON()),
                 });
                 if (!res.ok) throw new Error(await res.text());
                 status.textContent = 'Push enabled for this browser.';
               } catch (e) {
                 status.textContent = e instanceof Error ? e.message : String(e);
               }
             });
           }
         </script>
       </div>`
    : `<p class="meta">Web push optional — configure VAPID env vars on the server.</p>`;

  return layout(
    "Alerts",
    `
<section class="form-page notifications-page">
  <h1>Alerts</h1>
  <p>Solvency, bills, and ingest review — refreshed on each visit.</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  <div class="wizard-actions">
    <form method="post" action="/app/notifications/read-all">
      <button type="submit" class="btn-secondary">Mark all read</button>
    </form>
  </div>
  ${rows}
  ${pushBlock}
  <p class="meta">Agent: <code>attache notifications list</code> · <code>attache notifications refresh</code></p>
</section>`,
  );
}

export function renderCostReceipt(est: CostEstimate): string {
  if (est.lineItems.length === 0) {
    return `<div class="receipt empty"><p class="receipt-total">$0.00 <span>/ month</span></p><p>Manual tracking on your device — no cloud fees.</p></div>`;
  }

  const rows = est.lineItems
    .map(
      (line) => `
    <tr class="line-${line.category}">
      <td>${escapeHtml(line.label)}${line.vendor ? ` <span class="vendor">(${escapeHtml(line.vendor)})</span>` : ""}</td>
      <td class="qty">${line.quantity} ${escapeHtml(line.unitLabel)}</td>
      <td class="unit">$${line.unitUsd.toFixed(2)}</td>
      <td class="total">$${line.totalUsd.toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  return `
<div class="receipt">
  <table class="receipt-table">
    <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="3">Platform</td><td>$${est.platformSubtotalUsd.toFixed(2)}</td></tr>
      <tr><td colspan="3">Pass-through (at cost)</td><td>$${est.passThroughSubtotalUsd.toFixed(2)}</td></tr>
      <tr><td colspan="3">Cloud usage</td><td>$${est.usageSubtotalUsd.toFixed(2)}</td></tr>
      <tr class="grand-total"><td colspan="3">Estimated monthly</td><td>$${est.totalUsd.toFixed(2)}</td></tr>
    </tfoot>
  </table>
  <p class="receipt-note">${escapeHtml(est.disclaimer)}</p>
</div>`;
}

export function costEstimatorForm(
  values: {
    platformEnabled: boolean;
    plaidAccountCount: number;
    snaptradeUserCount: number;
    cloudOcrPages: number;
  } = {
    platformEnabled: true,
    plaidAccountCount: 3,
    snaptradeUserCount: 0,
    cloudOcrPages: 8,
  },
): string {
  const est = estimateMonthlyCost({
    ...values,
    cloudLlmTokensM: 0.5,
    r2StorageGb: 2,
  });

  return `
<div class="cost-estimator">
  <form hx-post="/api/costs/estimate" hx-target="#cost-receipt" hx-swap="innerHTML">
    <label class="toggle">
      <input type="checkbox" name="platformEnabled" value="true" ${values.platformEnabled ? "checked" : ""} />
      Attache platform ($${PLATFORM_PRICING.monthlyUsd}/mo)
    </label>
    <label>Plaid linked accounts
      <input type="number" name="plaidAccountCount" min="0" max="20" value="${values.plaidAccountCount}" />
    </label>
    <label>SnapTrade users (premium)
      <input type="number" name="snaptradeUserCount" min="0" max="10" value="${values.snaptradeUserCount}" />
    </label>
    <label>Cloud OCR pages / month
      <input type="number" name="cloudOcrPages" min="0" max="500" value="${values.cloudOcrPages}" />
    </label>
    <button type="submit">Update estimate</button>
  </form>
  <div id="cost-receipt">${renderCostReceipt(est)}</div>
</div>`;
}

export function pricingPage(): string {
  const scenarios = Object.entries(PRICING_SCENARIOS)
    .map(([key, sc]) => {
      const est = estimateMonthlyCost(sc.input);
      return `<article class="scenario-card">
        <h3>${escapeHtml(sc.label)}</h3>
        ${renderCostReceipt(est)}
        <a href="/app/costs?scenario=${key}" class="btn-secondary">Customize</a>
      </article>`;
    })
    .join("");

  return layout(
    "Pricing",
    `
<section class="hero pricing-hero">
  <h1>Honest pricing</h1>
  <p class="lead">We separate <strong>our platform fee</strong> from <strong>vendor costs</strong> (Plaid, SnapTrade) and <strong>cloud usage</strong> you actually consume. Local-first stays free.</p>
</section>
<section class="pricing-tiers">
  <div class="tier">
    <h2>Free</h2>
    <p class="price">$0</p>
    <ul><li>Manual accounts</li><li>Runway forecast</li><li>Local storage</li><li>Mesh sync (LAN)</li></ul>
  </div>
  <div class="tier featured">
    <h2>Platform</h2>
    <p class="price">$${PLATFORM_PRICING.monthlyUsd}<span>/mo</span></p>
    <p class="price-alt">$${PLATFORM_PRICING.introAnnualUsd} first year, then $${PLATFORM_PRICING.annualUsd}/yr</p>
    <ul><li>Agents &amp; workflows</li><li>Document pipeline</li><li>HITL transfers</li><li>Optional cloud backup</li></ul>
  </div>
  <div class="tier">
    <h2>Connect</h2>
    <p class="price">At cost</p>
    <ul><li>Plaid bank sync</li><li>~$1/account/mo pass-through</li><li>Estimator before you link</li></ul>
  </div>
  <div class="tier">
    <h2>Invest</h2>
    <p class="price">Premium + SnapTrade</p>
    <ul><li>Read-only brokerage</li><li>~$1/user/mo pass-through</li><li>Included in analyses</li></ul>
  </div>
</section>
<section class="scenarios">
  <h2>Example monthly receipts</h2>
  <div class="scenario-grid">${scenarios}</div>
</section>
<section class="cta">
  <h2>See your numbers before you connect a bank</h2>
  ${costEstimatorForm()}
</section>`,
  );
}

export function onboardPage(error?: string): string {
  return layout(
    "Get started",
    `
<section class="onboard">
  <att-wizard-steps current="1" total="3"></att-wizard-steps>
  <h1>Create your household</h1>
  <p>Data stays on this device. SQLCipher and passphrase vault ship in VS-0.1.</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="/onboard" class="onboard-form">
    <label>Household name
      <input name="householdName" required placeholder="Klaus Household" />
    </label>
    <label>Your name
      <input name="holderDisplayName" required placeholder="Jeremy" />
    </label>
    <button type="submit">Continue</button>
  </form>
</section>`,
  );
}

export function onboardAccountPage(error?: string): string {
  return layout(
    "First account",
    `
<section class="onboard form-page">
  <att-wizard-steps current="2" total="3"></att-wizard-steps>
  <h1>Add a funding account</h1>
  <p>Enter your checking or savings balance — manual path, no bank link required.</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="/onboard/account" class="onboard-form">
    <label>Name
      <input name="name" required placeholder="Checking" />
    </label>
    <label>Institution
      <input name="institution" placeholder="Chase" />
    </label>
    <label>Last 4 (mask)
      <input name="mask" placeholder="4821" maxlength="8" />
    </label>
    <label>Available balance (USD)
      <input name="balanceUsd" type="number" step="0.01" required placeholder="3412.18" />
    </label>
    <button type="submit">Continue</button>
  </form>
</section>`,
  );
}

export function onboardObligationPage(error?: string): string {
  return layout(
    "First bill",
    `
<section class="onboard form-page">
  <att-wizard-steps current="3" total="3"></att-wizard-steps>
  <h1>Add a bill (optional)</h1>
  <p>One obligation is enough to see runway impact — or skip and add later.</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="post" action="/onboard/obligation" class="onboard-form">
    <label>Payee
      <input name="payee" placeholder="Pacific Gas & Electric" />
    </label>
    <label>Amount (USD)
      <input name="amountUsd" type="number" step="0.01" min="0.01" placeholder="142.00" />
    </label>
    <label>Due date
      <input name="dueDate" type="date" />
    </label>
    <label>Cadence
      <select name="cadence">
        <option value="once">Once</option>
        <option value="monthly" selected>Monthly</option>
      </select>
    </label>
    <div class="wizard-actions">
      <button type="submit">Add bill & finish</button>
      <a href="/onboard/obligation/skip" class="btn-secondary">Skip for now</a>
    </div>
  </form>
</section>`,
  );
}

export function appHomePage(
  tenantName: string,
  siteId: string,
  forecast: SolvencyForecast,
  accounts: FundingAccount[],
  upcoming: ObligationOccurrence[],
  transactions: Array<BankTransaction & { accountLabel: string }>,
): string {
  const runwayTone =
    forecast.runwayDays >= 30
      ? "good"
      : forecast.runwayDays >= 14
        ? "warn"
        : "bad";
  const dueTone = forecast.dueIn7dUsd > 0 ? "warn" : "neutral";
  const overdueTone = forecast.overdueUsd > 0 ? "bad" : "good";

  const accountRows =
    accounts.length === 0
      ? `<p class="empty-hint">No accounts yet — <a href="/app/accounts">add a manual account</a>.</p>`
      : accounts
          .map(
            (a) => `<att-account-row
              name="${escapeHtml(a.name)}"
              ${a.mask ? `mask="${escapeHtml(a.mask)}"` : ""}
              ${a.institution ? `institution="${escapeHtml(a.institution)}"` : ""}
              balance="${a.balanceUsd}"
              syncStatus="${a.syncStatus === "manual" ? "manual" : a.syncStatus}"
              ${a.lastSyncedAt ? `syncLabel="synced via Plaid"` : ""}
            ></att-account-row>`,
          )
          .join("");

  const obligationRows =
    upcoming.length === 0
      ? `<p class="empty-hint">No upcoming bills — <a href="/app/obligations">add an obligation</a>.</p>`
      : upcoming
          .slice(0, 8)
          .map(
            (o) => `<att-obligation-row
              payee="${escapeHtml(o.payee)}"
              dueDate="${o.date}"
              amount="${o.amountUsd}"
              status="${o.status}"
              ${o.autopay ? "autopay" : ""}
              provenance="${o.provenance}"
            ></att-obligation-row>`,
          )
          .join("");

  const timelineItems = upcoming.map((o) => ({
    date: o.date,
    payee: o.payee,
    amountUsd: o.amountUsd,
    status: o.status,
  }));

  return layout(
    "Dashboard",
    `
<section class="dashboard">
  <h1>${escapeHtml(tenantName)}</h1>
  <p class="meta">Device <code>${escapeHtml(siteId.slice(0, 8))}…</code> · local-first · ledger primary here</p>

  <div class="stat-grid">
    <att-stat label="Runway" value="${forecast.runwayDays}" unit="days"
      tone="${runwayTone}"
      helper="${forecast.runwayDays >= 30 ? "Solvent for 30 days" : "Projected shortfall within horizon"}"></att-stat>
    <att-stat label="Liquid" value="$${forecast.liquidBalanceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}"
      helper="${accounts.length} funding account${accounts.length === 1 ? "" : "s"}"></att-stat>
    <att-stat label="Due in 7d" value="$${forecast.dueIn7dUsd.toFixed(2)}"
      tone="${dueTone}"></att-stat>
    <att-stat label="Overdue" value="$${forecast.overdueUsd.toFixed(2)}"
      tone="${overdueTone}"></att-stat>
  </div>

  <div class="dash-charts">
    <att-runway-chart
      series-json="${jsonAttr(forecast.series)}"
      runway-days="${forecast.runwayDays}"
    ></att-runway-chart>
    <att-obligation-timeline
      items-json="${jsonAttr(timelineItems)}"
      horizon-days="${forecast.horizonDays}"
    ></att-obligation-timeline>
  </div>

  <div class="dash-split">
    <att-list heading="Funding accounts">
      ${accountRows}
    </att-list>
    <att-list heading="Upcoming obligations">
      ${obligationRows}
    </att-list>
  </div>

  ${transactions.length
    ? `<att-list heading="Recent transactions (Plaid)">
        ${transactions
          .map(
            (t) => `<att-transaction-row
              payee="${escapeHtml(t.payee)}"
              date="${t.postedDate}"
              amount="${t.amountUsd}"
              ${t.category ? `category="${escapeHtml(t.category)}"` : ""}
              account="${escapeHtml(t.accountLabel)}"
              ${t.pending ? "pending" : ""}
            ></att-transaction-row>`,
          )
          .join("")}
      </att-list>`
    : `<p class="empty-hint">No bank transactions — <a href="/app/plaid">connect Plaid sandbox</a>.</p>`}

  <p class="actions">
    <a href="/app/accounts" class="btn-secondary">Manage accounts</a>
    <a href="/app/obligations" class="btn-secondary">Manage obligations</a>
    <a href="/app/plaid" class="btn-secondary">Plaid sync</a>
  </p>
</section>`,
  );
}

export function accountsPage(
  accounts: FundingAccount[],
  message?: string,
  error?: string,
): string {
  const total = accounts.reduce((s, a) => s + a.balanceUsd, 0);
  const list =
    accounts.length === 0
      ? `<p class="empty-hint">No accounts yet — add one below or <a href="/app/plaid">connect Plaid</a>.</p>`
      : `<att-list heading="Your accounts (${accounts.length})">
          ${accounts
            .map((a) => {
              const manual = a.syncStatus === "manual" && !a.plaidAccountId;
              const editForm = manual
                ? `<details class="manage-edit">
                     <summary>Edit</summary>
                     <form method="post" action="/app/accounts/${escapeHtml(a.id)}/update" class="stack-form">
                       <label>Name <input name="name" value="${escapeHtml(a.name)}" required /></label>
                       <label>Institution <input name="institution" value="${escapeHtml(a.institution ?? "")}" /></label>
                       <label>Mask <input name="mask" value="${escapeHtml(a.mask ?? "")}" maxlength="8" /></label>
                       <label>Kind
                         <select name="kind">
                           <option value="checking" ${a.kind === "checking" ? "selected" : ""}>Checking</option>
                           <option value="savings" ${a.kind === "savings" ? "selected" : ""}>Savings</option>
                           <option value="cash" ${a.kind === "cash" ? "selected" : ""}>Cash</option>
                         </select>
                       </label>
                       <label>Balance (USD) <input name="balanceUsd" type="number" step="0.01" value="${a.balanceUsd}" required /></label>
                       <button type="submit">Save</button>
                     </form>
                     <form method="post" action="/app/accounts/${escapeHtml(a.id)}/delete" class="inline-danger" onsubmit="return confirm('Delete this account?');">
                       <button type="submit" class="btn-danger">Delete</button>
                     </form>
                   </details>`
                : `<p class="meta">Synced via <a href="/app/plaid">Plaid</a> — balance updates on sync.</p>`;
              return `<div class="manage-item">
                <att-account-row
                  name="${escapeHtml(a.name)}"
                  ${a.mask ? `mask="${escapeHtml(a.mask)}"` : ""}
                  ${a.institution ? `institution="${escapeHtml(a.institution)}"` : ""}
                  balance="${a.balanceUsd}"
                  syncStatus="${a.syncStatus === "manual" ? "manual" : a.syncStatus}"
                  ${a.lastSyncedAt ? `syncLabel="last sync ${escapeHtml(a.lastSyncedAt.slice(0, 16))}"` : ""}
                ></att-account-row>
                ${editForm}
              </div>`;
            })
            .join("")}
        </att-list>
        <p class="meta">Total liquid: <strong>$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>`;

  return layout(
    "Accounts",
    `
<section class="manage-page">
  <h1>Funding accounts</h1>
  <p>Manual entry or sync via <a href="/app/plaid">Plaid</a>.</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  ${list}
  <h2>Add account</h2>
  <form method="post" action="/app/accounts" class="onboard-form">
    <label>Name
      <input name="name" required placeholder="Checking" />
    </label>
    <label>Institution
      <input name="institution" placeholder="Chase" />
    </label>
    <label>Last 4 (mask)
      <input name="mask" placeholder="4821" maxlength="8" />
    </label>
    <label>Kind
      <select name="kind">
        <option value="checking">Checking</option>
        <option value="savings">Savings</option>
        <option value="cash">Cash envelope</option>
      </select>
    </label>
    <label>Available balance (USD)
      <input name="balanceUsd" type="number" step="0.01" required placeholder="3412.18" />
    </label>
    <button type="submit">Add account</button>
  </form>
</section>`,
  );
}

export function obligationsPage(
  obligations: Array<Obligation & { status: string }>,
  message?: string,
  error?: string,
): string {
  const unpaid = obligations.filter((o) => !o.paidAt);
  const list =
    obligations.length === 0
      ? `<p class="empty-hint">No obligations yet — add a bill below or <a href="/app/ingest">ingest a document</a>.</p>`
      : `<att-list heading="Bills &amp; recurring (${unpaid.length} unpaid)">
          ${obligations
            .map((o) => {
              const actions = o.paidAt
                ? `<p class="meta">Paid ${escapeHtml(o.paidAt.slice(0, 10))}</p>
                   <form method="post" action="/app/obligations/${escapeHtml(o.id)}/delete" class="inline-danger" onsubmit="return confirm('Delete this obligation?');">
                     <button type="submit" class="btn-danger">Delete</button>
                   </form>`
                : `<div class="wizard-actions">
                     <form method="post" action="/app/obligations/${escapeHtml(o.id)}/paid">
                       <button type="submit" class="btn-secondary">Mark paid</button>
                     </form>
                   </div>
                   <details class="manage-edit">
                     <summary>Edit</summary>
                     <form method="post" action="/app/obligations/${escapeHtml(o.id)}/update" class="stack-form">
                       <label>Payee <input name="payee" value="${escapeHtml(o.payee)}" required /></label>
                       <label>Amount (USD) <input name="amountUsd" type="number" step="0.01" min="0.01" value="${o.amountUsd}" required /></label>
                       <label>Due date <input name="dueDate" type="date" value="${escapeHtml(o.dueDate)}" required /></label>
                       <label>Cadence
                         <select name="cadence">
                           <option value="once" ${o.cadence === "once" ? "selected" : ""}>Once</option>
                           <option value="monthly" ${o.cadence === "monthly" ? "selected" : ""}>Monthly</option>
                           <option value="yearly" ${o.cadence === "yearly" ? "selected" : ""}>Yearly</option>
                         </select>
                       </label>
                       <label class="toggle">
                         <input type="checkbox" name="autopay" value="true" ${o.autopay ? "checked" : ""} /> Autopay
                       </label>
                       <label>Notes <input name="notes" value="${escapeHtml(o.notes ?? "")}" /></label>
                       <button type="submit">Save</button>
                     </form>
                     <form method="post" action="/app/obligations/${escapeHtml(o.id)}/delete" class="inline-danger" onsubmit="return confirm('Delete this obligation?');">
                       <button type="submit" class="btn-danger">Delete</button>
                     </form>
                   </details>`;
              return `<div class="manage-item">
                <att-obligation-row
                  payee="${escapeHtml(o.payee)}"
                  dueDate="${o.dueDate}"
                  amount="${o.amountUsd}"
                  status="${o.status}"
                  cadence="${o.cadence}"
                  provenance="${o.provenance}"
                  ${o.autopay ? "autopay" : ""}
                ></att-obligation-row>
                ${actions}
              </div>`;
            })
            .join("")}
        </att-list>`;

  return layout(
    "Obligations",
    `
<section class="manage-page">
  <h1>Obligations</h1>
  <p>Bills and recurring payments — edit, mark paid, or delete.</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  ${list}
  <h2>Add obligation</h2>
  <form method="post" action="/app/obligations" class="onboard-form">
    <label>Payee
      <input name="payee" required placeholder="Pacific Gas & Electric" />
    </label>
    <label>Amount (USD)
      <input name="amountUsd" type="number" step="0.01" min="0.01" required placeholder="142.00" />
    </label>
    <label>Due date
      <input name="dueDate" type="date" required />
    </label>
    <label>Cadence
      <select name="cadence">
        <option value="once">Once</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </label>
    <label class="toggle">
      <input type="checkbox" name="autopay" value="true" /> Autopay
    </label>
    <button type="submit">Add obligation</button>
  </form>
</section>`,
  );
}

function statusChip(status: string, allowed: boolean): string {
  if (status === "pending") {
    return allowed
      ? `<span class="chip chip-high">pending</span>`
      : `<span class="chip chip-low">blocked</span>`;
  }
  return `<span class="chip chip-${status === "executed" ? "high" : status === "rejected" ? "low" : "review"}">${escapeHtml(status)}</span>`;
}

export function transfersPage(
  proposals: TransferProposalRecord[],
  accounts: FundingAccount[],
  message?: string,
  error?: string,
): string {
  const pending = proposals.filter((p) => p.status === "pending");
  const history = proposals.filter((p) => p.status !== "pending");

  const renderProposal = (p: TransferProposalRecord) => {
    const sim = p.simulation;
    const dest = p.toAccountId
      ? sim.toAccount?.name ?? "account"
      : "external";
    const warnings =
      sim.warnings.length || sim.blockers.length
        ? `<ul class="xfer-notes">${[...sim.blockers, ...sim.warnings]
            .map((w) => `<li>${escapeHtml(w)}</li>`)
            .join("")}</ul>`
        : "";
    const actions =
      p.status === "pending"
        ? `<div class="wizard-actions">
             <form method="post" action="/app/transfers/${escapeHtml(p.id)}/approve" style="display:inline">
               <input type="hidden" name="note" value="" />
               <button type="submit" ${p.allowed ? "" : "disabled"} title="${p.allowed ? "" : "Blockers present"}">Approve</button>
             </form>
             <form method="post" action="/app/transfers/${escapeHtml(p.id)}/reject" style="display:inline">
               <button type="submit" class="btn-secondary">Reject</button>
             </form>
           </div>`
        : `<p class="meta">${p.reviewedAt ? `Reviewed ${escapeHtml(p.reviewedAt.slice(0, 16))}` : ""}${p.reviewNote ? ` — ${escapeHtml(p.reviewNote)}` : ""}</p>`;

    return `<li class="transfer-item status-${escapeHtml(p.status)}">
      <div class="transfer-head">
        ${statusChip(p.status, p.allowed)}
        <strong>$${p.amountUsd.toFixed(2)}</strong>
        <span class="meta">${escapeHtml(sim.fromAccount.name)} → ${escapeHtml(dest)}</span>
        <time class="meta">${escapeHtml(p.createdAt.slice(0, 16))}</time>
      </div>
      ${p.memo ? `<p class="meta">Memo: ${escapeHtml(p.memo)}</p>` : ""}
      <p class="meta">Runway ${sim.forecastBefore.runwayDays}d → ${sim.forecastAfter.runwayDays}d · proposed by ${escapeHtml(p.proposedBy)}</p>
      ${warnings}
      ${actions}
    </li>`;
  };

  const accountOptions = accounts
    .map(
      (a) =>
        `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} ($${a.balanceUsd.toFixed(2)})</option>`,
    )
    .join("");

  return layout(
    "Transfers",
    `
<section class="manage-page transfers-page">
  <h1>Transfer approvals</h1>
  <p>Agent and CLI proposals require household approval. Manual accounts update on execute; Plaid legs record approval only.</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}

  <h2>Pending (${pending.length})</h2>
  ${pending.length
    ? `<ul class="transfer-list">${pending.map(renderProposal).join("")}</ul>`
    : `<p class="empty-hint">No pending transfers.</p>`}

  <details class="connect-panel">
    <summary>Submit manual proposal</summary>
    <form method="post" action="/app/transfers/submit" class="stack-form">
      <label>From
        <select name="fromAccountId" required>${accountOptions}</select>
      </label>
      <label>To (optional — leave blank for outbound)
        <select name="toAccountId">
          <option value="">— external / outbound —</option>
          ${accountOptions}
        </select>
      </label>
      <label>Amount (USD) <input name="amountUsd" type="number" step="0.01" min="0.01" required /></label>
      <label>Memo <input name="memo" placeholder="Optional" /></label>
      <button type="submit">Submit for approval</button>
    </form>
  </details>

  ${history.length
    ? `<h2>History</h2><ul class="transfer-list muted">${history.map(renderProposal).join("")}</ul>`
    : ""}

  <p class="meta">Agent: <code>attache transfer submit</code> · <code>attache transfer list</code></p>
</section>`,
  );
}

export function plaidPage(
  items: PlaidItem[],
  linkedAccountCount: number,
  message?: string,
  error?: string,
): string {
  const passThrough = estimateMonthlyCost({
    platformEnabled: false,
    plaidAccountCount: linkedAccountCount,
    snaptradeUserCount: 0,
    cloudOcrPages: 0,
  });
  const monthlyPlaid =
    linkedAccountCount > 0
      ? `$${(PASS_THROUGH_RATES.plaidPerAccountMonth * linkedAccountCount).toFixed(2)}/mo`
      : `$${PASS_THROUGH_RATES.plaidPerAccountMonth.toFixed(2)}/account/mo pass-through`;

  const itemList =
    items.length === 0
      ? `<p class="empty-hint">No bank links yet.</p>`
      : `<ul class="plaid-items">${items
          .map(
            (i) => `<li><strong>${escapeHtml(i.institutionName)}</strong>
              · ${i.lastSyncAt ? `last sync ${escapeHtml(i.lastSyncAt.slice(0, 16))}` : "never synced"}
              · <code>${escapeHtml(i.status)}</code></li>`,
          )
          .join("")}</ul>`;

  return layout(
    "Plaid",
    `
<section class="form-page plaid-page">
  <h1>Bank sync (Plaid)</h1>
  <p>Read-only Transactions + Balance. Access tokens live in <code>~/.attache/vault/</code> — never in SQLite.</p>
  <p class="meta">Pass-through: ${monthlyPlaid} at vendor cost (ADR-006).</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}

  ${itemList}

  <div class="wizard-actions">
    <form method="post" action="/app/plaid/connect-sandbox" style="display:inline">
      <button type="submit">Connect sandbox bank</button>
    </form>
    ${items.length
      ? `<form method="post" action="/app/plaid/sync" style="display:inline">
          <button type="submit" class="btn-secondary">Sync now</button>
        </form>`
      : ""}
  </div>

  <p class="meta">Agent: <code>attache plaid connect-sandbox</code> · <code>attache plaid sync</code></p>
  ${linkedAccountCount > 0 ? `<p class="meta">${passThrough.disclaimer}</p>` : ""}
</section>`,
  );
}

function confidenceLabel(confidence: number): string {
  if (confidence >= HITL_CONFIDENCE_THRESHOLD) return "high";
  if (confidence >= 0.6) return "review";
  return "low";
}

export function ingestPage(
  pending: IngestedEvent[],
  ingestAddress: string,
  maildropPath: string,
  webhookUrl: string,
  extractUrl: string | null,
  webhookSecured: boolean,
  gmailAccounts: GmailAccount[],
  imapAccounts: ImapAccount[],
  gmailOAuthEnabled: boolean,
  message?: string,
  error?: string,
): string {
  const queue =
    pending.length === 0
      ? `<p class="empty-hint">No bills awaiting review — upload a document or connect mail.</p>`
      : `<ul class="review-queue">${pending
          .map((e) => {
            const tone = confidenceLabel(e.confidence);
            return `<li>
              <a href="/app/ingest/review/${escapeHtml(e.id)}">
                <strong>${escapeHtml(e.source)}</strong>
                · ${Math.round(e.confidence * 100)}% confidence
                · <span class="chip chip-${tone}">${tone}</span>
              </a>
            </li>`;
          })
          .join("")}</ul>`;

  const mailAccountRows = [
    ...gmailAccounts.map(
      (a) =>
        `<li class="mail-account-row">
          <span class="mail-account-kind">Gmail</span>
          <strong>${escapeHtml(a.label)}</strong>
          <span class="meta">${escapeHtml(a.email)}</span>
          · ${a.lastSyncAt ? `synced ${escapeHtml(a.lastSyncAt.slice(0, 16))}` : "never synced"}
          · <code>${escapeHtml(a.status)}</code>
        </li>`,
    ),
    ...imapAccounts.map(
      (a) =>
        `<li class="mail-account-row">
          <span class="mail-account-kind">IMAP</span>
          <strong>${escapeHtml(a.label)}</strong>
          <span class="meta">${escapeHtml(a.username)} @ ${escapeHtml(a.host)}</span>
          · ${a.lastSyncAt ? `synced ${escapeHtml(a.lastSyncAt.slice(0, 16))}` : "never synced"}
          · <code>${escapeHtml(a.status)}</code>
        </li>`,
    ),
  ].join("");

  const hasMailAccounts = gmailAccounts.length + imapAccounts.length > 0;

  const gmailConnectCta = gmailOAuthEnabled
    ? `<a href="/app/ingest/gmail/connect" class="btn-link primary">Connect Gmail</a>`
    : `<form method="post" action="/app/ingest/gmail/connect-sandbox" style="display:inline">
         <button type="submit">Connect Gmail (sandbox)</button>
       </form>
       <p class="meta">Set <code>GOOGLE_CLIENT_ID</code> + <code>GOOGLE_CLIENT_SECRET</code> for live OAuth.</p>`;

  return layout(
    "Ingest",
    `
<section class="form-page ingest-page">
  <h1>Document &amp; email ingest</h1>
  <p>Upload bills or connect your mailbox. OAuth tokens live in <code>~/.attache/vault/</code> — never in SQLite (ADR-008).</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}

  <h2>Mail accounts</h2>
  ${hasMailAccounts
    ? `<ul class="mail-accounts">${mailAccountRows}</ul>`
    : `<p class="empty-hint">No mailboxes connected yet.</p>`}

  <div class="connection-actions wizard-actions">
    ${gmailConnectCta}
    <form method="post" action="/app/ingest/poll-gmail" style="display:inline">
      <button type="submit" class="btn-secondary" ${gmailAccounts.length ? "" : "disabled"}>Poll Gmail</button>
    </form>
    <form method="post" action="/app/ingest/poll-imap" style="display:inline">
      <button type="submit" class="btn-secondary" ${imapAccounts.length ? "" : "disabled"}>Poll IMAP</button>
    </form>
  </div>

  <details class="connect-panel">
    <summary>Connect IMAP (app password)</summary>
    <p class="meta">Fastmail, iCloud, or Gmail with an app-specific password.</p>
    <form method="post" action="/app/ingest/imap/connect" class="stack-form">
      <label>Label <input name="label" placeholder="Fastmail personal" /></label>
      <label>IMAP host <input name="host" placeholder="imap.fastmail.com" required /></label>
      <label>Username <input name="username" type="email" required /></label>
      <label>App password <input name="password" type="password" required autocomplete="off" /></label>
      <label>Mailbox <input name="mailbox" value="INBOX" /></label>
      <button type="submit">Connect IMAP</button>
    </form>
  </details>

  <h2>Upload bill</h2>
  <form method="post" action="/app/ingest/upload" enctype="multipart/form-data" class="stack-form">
    <label>File (.txt, .pdf, image)
      <input type="file" name="bill" accept=".txt,.pdf,image/*" required />
    </label>
    <button type="submit">Upload &amp; extract</button>
  </form>

  <details class="connect-panel">
    <summary>Advanced: maildrop &amp; webhook</summary>
    <p class="meta">Deferred ingress: <code>${escapeHtml(ingestAddress)}</code></p>
    <p class="meta">Webhook: <code>POST ${escapeHtml(webhookUrl)}</code>${webhookSecured ? " (Bearer)" : ""}</p>
    <p class="meta">Maildrop: <code>${escapeHtml(maildropPath)}/</code></p>
    <div class="wizard-actions">
      <form method="post" action="/app/ingest/poll-email" style="display:inline">
        <button type="submit" class="btn-secondary">Poll maildrop</button>
      </form>
      <form method="post" action="/app/ingest/simulate-email" style="display:inline">
        <button type="submit" class="btn-secondary">Simulate sandbox email</button>
      </form>
    </div>
  </details>

  <h2>Extraction engine</h2>
  <p class="meta">${extractUrl
    ? `Sidecar: <code>${escapeHtml(extractUrl)}</code>`
    : "In-process extractor — set <code>ATTACHE_EXTRACT_URL</code> for Litestar sidecar."}</p>

  <h2>Review queue (${pending.length})</h2>
  ${queue}

  <p class="meta">Agent: <code>attache ingest gmail connect</code> · <code>attache ingest poll-gmail</code></p>
</section>`,
  );
}

export function billReviewPage(
  eventId: string,
  payload: BillExtractPayload,
  confidence: number,
  source: string,
  message?: string,
  error?: string,
): string {
  const tone = confidenceLabel(confidence);
  return layout(
    "Review bill",
    `
<section class="form-page review-page">
  <h1>Confirm extracted bill</h1>
  <p>Source: <strong>${escapeHtml(source)}</strong>
    · ${Math.round(confidence * 100)}% confidence
    · <span class="chip chip-${tone}">${tone}</span>
    · file: <code>${escapeHtml(payload.filename)}</code></p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}

  <form method="post" action="/app/ingest/review/${escapeHtml(eventId)}/confirm" class="stack-form">
    <label>Payee
      <input name="payee" value="${escapeHtml(payload.payee)}" required />
    </label>
    <label>Amount (USD)
      <input name="amountUsd" type="number" step="0.01" min="0.01" value="${payload.amountUsd}" required />
    </label>
    <label>Due date
      <input name="dueDate" type="date" value="${escapeHtml(payload.dueDate)}" required />
    </label>
    <label>Cadence
      <select name="cadence">
        <option value="once" ${payload.cadence === "once" ? "selected" : ""}>Once</option>
        <option value="monthly" ${payload.cadence === "monthly" ? "selected" : ""}>Monthly</option>
        <option value="yearly" ${payload.cadence === "yearly" ? "selected" : ""}>Yearly</option>
      </select>
    </label>
    <label class="toggle">
      <input type="checkbox" name="autopay" value="true" ${payload.autopay ? "checked" : ""} /> Autopay
    </label>
    <label>Notes
      <input name="notes" placeholder="Optional" />
    </label>
    <div class="wizard-actions">
      <button type="submit">Confirm → create obligation</button>
      <a href="/app/ingest" class="btn-secondary">Back</a>
    </div>
  </form>
</section>`,
  );
}

export async function parseCostForm(c: Context): Promise<{
  platformEnabled: boolean;
  plaidAccountCount: number;
  snaptradeUserCount: number;
  cloudOcrPages: number;
}> {
  const body =
    c.req.method === "POST" ? await c.req.parseBody() : c.req.query();
  const get = (k: string) => {
    const v = body[k];
    if (Array.isArray(v)) return v[0];
    return v;
  };
  return {
    platformEnabled: get("platformEnabled") === "true" || get("platformEnabled") === "on",
    plaidAccountCount: Number(get("plaidAccountCount") ?? 0),
    snaptradeUserCount: Number(get("snaptradeUserCount") ?? 0),
    cloudOcrPages: Number(get("cloudOcrPages") ?? 0),
  };
}
