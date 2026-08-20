import type { Context } from "hono";
import {
  estimateMonthlyCost,
  PLATFORM_PRICING,
  PRICING_SCENARIOS,
  PASS_THROUGH_RATES,
  TRANSFER_HONESTY,
  achBackendFromEnv,
  type CostEstimate,
  type FundingAccount,
  type BankTransaction,
  type Obligation,
  type ObligationOccurrence,
  type PlaidItem,
  type SnapTradeConnection,
  type SolvencyForecast,
  type IngestedEvent,
  type BillExtractPayload,
  type ImapAccount,
  type GmailAccount,
  type TransferProposalRecord,
  type AttentionItem,
  type StoredSnapTradePosition,
  type DiscoverCandidate,
  type NetWorthSnapshot,
  type CashflowReport,
  type CashflowTrend,
  type HouseholdAsset,
  groupAccountsByKind,
  sumBrokerageUsd,
  sumLiquidBalanceUsd,
  sumLiabilityUsd,
  computeNetWorth,
  HITL_CONFIDENCE_THRESHOLD,
} from "@attache/core";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wizardSteps(current: number): string {
  return `<att-wizard-steps current="${current}" total="5" labels="Household,Find mail,Connect,Account,Bills"></att-wizard-steps>`;
}

/** Safe JSON for embedding in HTML attributes (SSR → Lit parse). */
function jsonAttr(value: unknown): string {
  return escapeHtml(JSON.stringify(value));
}

function navIsActive(href: string): boolean {
  if (href === "/") return navCurrentPath === "/";
  return navCurrentPath === href || navCurrentPath.startsWith(`${href}/`);
}

function navLink(href: string, label: string, extra = ""): string {
  const cls = navIsActive(href) ? ' class="active"' : "";
  return `<a href="${href}"${cls}>${label}${extra}</a>`;
}

function navGroupOpen(prefixes: string[]): boolean {
  return prefixes.some(
    (p) => navCurrentPath === p || navCurrentPath.startsWith(`${p}/`),
  );
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
  const connectOpen = navGroupOpen([
    "/app/connections",
    "/app/plaid",
    "/app/snaptrade",
    "/app/ingest",
  ]);
  const moreOpen = navGroupOpen(["/pricing", "/app/costs", "/app/net-worth", "/app/cashflow"]);
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
      ${navLink("/", "Home")}
      ${navLink("/app/accounts", "Accounts")}
      ${navLink("/app/obligations", "Bills")}
      ${navLink("/app/activity", "Activity")}
      ${navLink("/app/transfers", "Transfers", transferBadge)}
      ${navLink("/app/notifications", "Alerts", navBadge)}
      <details class="nav-more"${connectOpen ? " open" : ""}>
        <summary>Connect</summary>
        ${navLink("/app/connections", "Overview")}
        ${navLink("/app/plaid", "Banks")}
        ${navLink("/app/snaptrade", "Brokerage")}
        ${navLink("/app/ingest", "Inbox")}
      </details>
      <details class="nav-more"${moreOpen ? " open" : ""}>
        <summary>More</summary>
        ${navLink("/pricing", "Pricing")}
        ${navLink("/app/costs", "Costs")}
        ${navLink("/app/net-worth", "Net worth")}
        ${navLink("/app/cashflow", "Cash flow")}
      </details>
    </nav>
  </header>
  <main class="site-main">${body}</main>
  <footer class="site-footer">
    <p>Local-first household finance. Costs shown at cost — no fantasy margins.</p>
    <p class="footer-nav">
      <a href="/app/connections">Connections</a> ·
      <a href="/app/net-worth">Net worth</a> ·
      <a href="/app/cashflow">Cash flow</a> ·
      <a href="/pricing">Pricing</a> ·
      <a href="/app/costs">Costs</a>
    </p>
  </footer>
</body>
</html>`;
}

/** Set before rendering any layout-backed page (server refreshes alerts first). */
let navUnreadCount = 0;
let transferPendingCount = 0;
let navCurrentPath = "/";

export function setNavUnreadCount(count: number): void {
  navUnreadCount = count;
}

export function setTransferPendingCount(count: number): void {
  transferPendingCount = count;
}

export function setNavCurrentPath(path: string): void {
  navCurrentPath = path.split("?")[0] || "/";
}

function kindSelectOptions(selected: string): string {
  const opts: Array<[string, string]> = [
    ["checking", "Checking"],
    ["savings", "Savings"],
    ["cash", "Cash envelope"],
    ["brokerage", "Brokerage"],
    ["credit", "Credit card"],
    ["loan", "Loan"],
  ];
  return opts
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`,
    )
    .join("");
}

function moneyUsd(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Shared account row for Home and My Accounts — Lit primitive + sync chip. */
function accountRowHtml(a: FundingAccount): string {
  const syncLabel = a.lastSyncedAt
    ? `last sync ${escapeHtml(a.lastSyncedAt.slice(0, 16))}`
    : a.provenance === "snaptrade"
      ? "SnapTrade"
      : a.provenance === "plaid"
        ? "Plaid"
        : "";
  return `<att-account-row
              name="${escapeHtml(a.name)}"
              ${a.mask ? `mask="${escapeHtml(a.mask)}"` : ""}
              ${a.institution ? `institution="${escapeHtml(a.institution)}"` : ""}
              kind="${escapeHtml(a.kind)}"
              balance="${a.balanceUsd}"
              syncStatus="${a.syncStatus === "manual" ? "manual" : a.syncStatus}"
              ${syncLabel ? `syncLabel="${syncLabel}"` : ""}
            ></att-account-row>`;
}

function attentionStrip(items: AttentionItem[]): string {
  if (items.length === 0) return "";
  const cards = items
    .map(
      (item) => `<a class="attention-card ${escapeHtml(item.severity)}" href="${escapeHtml(item.href)}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.body)}</span>
        <code class="cli-hint">${escapeHtml(item.cliHint)}</code>
      </a>`,
    )
    .join("");
  return `<section class="attention-strip" aria-label="Needs attention">${cards}</section>`;
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
  ${wizardSteps(1)}
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
  ${wizardSteps(4)}
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
    <div class="wizard-actions">
      <button type="submit">Continue</button>
      <a href="/app/plaid" class="btn-secondary">Or connect a bank (optional)</a>
    </div>
  </form>
</section>`,
  );
}

export function onboardObligationPage(error?: string): string {
  return layout(
    "First bill",
    `
<section class="onboard form-page">
  ${wizardSteps(5)}
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

/**
 * Wizard discover step — same JSON as `attache ingest discover`.
 * Gmail is optional; Skip continues to connect hints or a manual account.
 */
export function onboardDiscoverPage(opts: {
  candidates: DiscoverCandidate[];
  mailConnected: boolean;
  gmailOAuth: boolean;
  message?: string;
  error?: string;
}): string {
  const bills = opts.candidates.filter((c) => c.action === "confirm_bill");
  const billList =
    bills.length === 0
      ? `<p class="empty-hint">No bills in the queue yet — find mail, or skip and type a bill later.</p>`
      : `<ul class="review-queue">${bills
          .map((c) => {
            const amt =
              c.amountUsd != null ? `$${c.amountUsd.toFixed(2)}` : "";
            const due = c.dueDate ? ` due ${escapeHtml(c.dueDate)}` : "";
            return `<li>
              <strong>${escapeHtml(c.payee ?? "Bill")}</strong>
              ${amt}${due}
              <form method="post" action="/onboard/discover/confirm/${escapeHtml(c.eventId)}" class="inline-form">
                <button type="submit">Confirm bill</button>
              </form>
              ${
                c.assetHint && !c.assetConfirmed
                  ? `<form method="post" action="/onboard/discover/asset/${escapeHtml(c.eventId)}" class="inline-form">
                       <button type="submit" class="btn-secondary">Confirm as ${escapeHtml(c.assetHint.kind)}</button>
                     </form>`
                  : ""
              }
            </li>`;
          })
          .join("")}</ul>`;

  const gmailCta = `${opts.gmailOAuth
    ? `<a href="/app/ingest/gmail/connect" class="btn-link primary">Connect Gmail</a>`
    : ""}
    <form method="post" action="/onboard/discover-sandbox" style="display:inline">
      <button type="submit">Find bills in sandbox Gmail</button>
    </form>`;

  return layout(
    "Find bills",
    `
<section class="onboard form-page">
  ${wizardSteps(2)}
  <h1>Find bills in Gmail</h1>
  <p>Optional — bounded lookback, HITL confirm. Never required. Connecting mail does not pay bills.</p>
  ${opts.message ? `<p class="success">${escapeHtml(opts.message)}</p>` : ""}
  ${opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : ""}

  <div class="wizard-actions">
    ${gmailCta}
    <form method="post" action="/onboard/discover/run" style="display:inline">
      <button type="submit" class="btn-secondary" ${opts.mailConnected ? "" : "disabled"}>Find in connected mail</button>
    </form>
  </div>

  <h2>Bills to confirm (${bills.length})</h2>
  ${billList}
  <p class="cli-hint"><code>attache ingest discover-sandbox</code> · <code>attache ingest confirm &lt;id&gt;</code></p>

  <div class="wizard-actions">
    <a href="/onboard/discover/continue" class="btn-link primary">Continue</a>
    <a href="/onboard/discover/skip" class="btn-secondary">Skip for now</a>
  </div>
</section>`,
  );
}

/**
 * Wizard connect-hint step — same cards as Connect hub. Link is still a click.
 */
export function onboardConnectPage(opts: {
  hints: DiscoverCandidate[];
  livePlaid: boolean;
  liveSnaptrade: boolean;
  message?: string;
  error?: string;
}): string {
  return layout(
    "Connect accounts",
    `
<section class="onboard form-page">
  ${wizardSteps(3)}
  <h1>Add cards, banks, investments</h1>
  <p>Mail saw these institutions. Linking is optional and still takes a click — a hint is not a bank.</p>
  ${opts.message ? `<p class="success">${escapeHtml(opts.message)}</p>` : ""}
  ${opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : ""}
  ${connectHintsPanel(opts.hints, {
    livePlaid: opts.livePlaid,
    liveSnaptrade: opts.liveSnaptrade,
    heading: "Gmail saw these statements",
  })}
  <p class="cli-hint"><code>attache plaid connect</code> · <code>attache snaptrade connect-sandbox</code></p>
  <div class="wizard-actions">
    <a href="/onboard/connect/continue" class="btn-link primary">Continue</a>
    <a href="/onboard/connect/skip" class="btn-secondary">Skip for now</a>
  </div>
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
  attention: AttentionItem[] = [],
): string {
  const runwayTone =
    forecast.runwayDays >= 30
      ? "good"
      : forecast.runwayDays >= 14
        ? "warn"
        : "bad";
  const dueTone = forecast.dueIn7dUsd > 0 ? "warn" : "neutral";
  const overdueTone = forecast.overdueUsd > 0 ? "bad" : "good";
  const brokerageUsd = sumBrokerageUsd(accounts);
  const netWorth = computeNetWorth(accounts);
  const liquidCount = accounts.filter((a) =>
    a.kind === "checking" || a.kind === "savings" || a.kind === "cash",
  ).length;
  const groups = groupAccountsByKind(accounts);

  const accountBlock =
    accounts.length === 0
      ? `<p class="empty-hint">No accounts yet — <a href="/app/accounts">add a manual account</a> or connect a bank. No bank link required.</p>`
      : groups
          .map(
            (g) => `<att-list heading="${escapeHtml(g.label)} ($${moneyUsd(g.subtotalUsd)})">
          ${g.accounts.map(accountRowHtml).join("")}
        </att-list>`,
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

  const brokerageStat =
    brokerageUsd > 0
      ? `<att-stat label="Brokerage" value="$${moneyUsd(brokerageUsd)}"
      helper="Read-only · excluded from runway"></att-stat>`
      : "";
  const netWorthTone =
    netWorth.netWorthUsd < 0 ? "bad" : netWorth.hasLiabilities ? "neutral" : "neutral";
  const netWorthStat =
    accounts.length === 0
      ? ""
      : `<att-stat label="Net worth" value="$${moneyUsd(netWorth.netWorthUsd)}"
      tone="${netWorthTone}"
      helper="${netWorth.hasLiabilities ? "Assets − credit/loan" : "Equals assets — add a credit or loan account to subtract debt"}"></att-stat>`;

  return layout(
    "Home",
    `
<section class="dashboard">
  <h1>${escapeHtml(tenantName)}</h1>
  <p class="meta">Can we cover the bills? Device <code>${escapeHtml(siteId.slice(0, 8))}…</code> · local-first</p>

  ${attentionStrip(attention)}

  <div class="stat-grid">
    <att-stat label="Runway" value="${forecast.runwayDays}" unit="days"
      tone="${runwayTone}"
      helper="${forecast.runwayDays >= 30 ? "Solvent for 30 days" : "Projected shortfall within horizon"}"></att-stat>
    <att-stat label="Liquid" value="$${moneyUsd(forecast.liquidBalanceUsd)}"
      helper="${liquidCount} cash account${liquidCount === 1 ? "" : "s"}"></att-stat>
    ${brokerageStat}
    ${netWorthStat}
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
    <div>
      <h2 class="section-heading">Accounts</h2>
      ${accountBlock}
      <p class="list-footer"><a href="/app/accounts">Manage accounts</a></p>
    </div>
    <div>
      <h2 class="section-heading">Upcoming bills</h2>
      ${upcoming.length === 0
        ? `<p class="empty-hint">No upcoming bills — <a href="/app/obligations">add an obligation</a>.</p>`
        : `<att-list heading="Next ${Math.min(8, upcoming.length)}">
        ${obligationRows}
      </att-list>`}
      <p class="list-footer"><a href="/app/obligations">All bills</a></p>
    </div>
  </div>

  <h2 class="section-heading">Recent activity</h2>
  ${transactions.length
    ? `<att-list heading="Posted">
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
      </att-list>
      <p class="list-footer"><a href="/app/activity">Full register</a> · <a href="/app/cashflow">Cash flow</a></p>`
    : `<p class="empty-hint">No bank transactions yet. Connect Plaid when you want a register — <a href="/app/accounts">manual accounts still work</a>.</p>`}
</section>`,
  );
}

export function accountsPage(
  accounts: FundingAccount[],
  message?: string,
  error?: string,
): string {
  const liquid = sumLiquidBalanceUsd(accounts);
  const brokerage = sumBrokerageUsd(accounts);
  const liabilities = sumLiabilityUsd(accounts);
  const groups = groupAccountsByKind(accounts);
  const list =
    accounts.length === 0
      ? `<p class="empty-hint">No accounts yet — add one below or <a href="/app/plaid">connect Plaid</a>. Manual accounts work without a bank link.</p>`
      : `${groups
          .map((g) => {
            const rows = g.accounts
              .map((a) => {
                const manual = a.syncStatus === "manual" && !a.plaidAccountId;
                const syncErr =
                  a.syncStatus === "error"
                    ? `<p class="error compact">Bank sync failed — <a href="/app/connections">fix on Connections</a> or unlink.</p>`
                    : "";
                const editForm = manual
                  ? `<details class="manage-edit">
                     <summary>Edit</summary>
                     <form method="post" action="/app/accounts/${escapeHtml(a.id)}/update" class="stack-form">
                       <label>Name <input name="name" value="${escapeHtml(a.name)}" required /></label>
                       <label>Institution <input name="institution" value="${escapeHtml(a.institution ?? "")}" /></label>
                       <label>Mask <input name="mask" value="${escapeHtml(a.mask ?? "")}" maxlength="8" /></label>
                       <label>Kind
                         <select name="kind">
                           ${kindSelectOptions(a.kind)}
                         </select>
                       </label>
                       <label>Balance (USD) <input name="balanceUsd" type="number" step="0.01" value="${a.balanceUsd}" required /></label>
                       <button type="submit">Save</button>
                     </form>
                     <form method="post" action="/app/accounts/${escapeHtml(a.id)}/delete" class="inline-danger" onsubmit="return confirm('Delete this account?');">
                       <button type="submit" class="btn-danger">Delete</button>
                     </form>
                   </details>`
                  : a.provenance === "snaptrade"
                    ? `<p class="meta">${escapeHtml(a.kind)} · Synced via <a href="/app/snaptrade">SnapTrade</a> — equity updates on sync.
                       <a href="/app/activity?account=${escapeHtml(a.id)}">Activity</a></p>${syncErr}`
                    : `<p class="meta">${escapeHtml(a.kind)} · Synced via <a href="/app/plaid">Plaid</a> — balance updates on sync.
                       <a href="/app/activity?account=${escapeHtml(a.id)}">Activity</a></p>${syncErr}`;
                return `<div class="manage-item">
                ${accountRowHtml(a)}
                ${editForm}
                ${manual ? `<p class="meta"><a href="/app/activity?account=${escapeHtml(a.id)}">Activity</a></p>` : ""}
              </div>`;
              })
              .join("");
            return `<att-list heading="${escapeHtml(g.label)} · $${moneyUsd(g.subtotalUsd)}">
          ${rows}
        </att-list>`;
          })
          .join("")}
        <p class="meta">Liquid (runway): <strong>$${moneyUsd(liquid)}</strong>${
          brokerage > 0
            ? ` · Brokerage (excluded): <strong>$${moneyUsd(brokerage)}</strong>`
            : ""
        }${
          liabilities > 0
            ? ` · Owed: <strong>$${moneyUsd(liabilities)}</strong>`
            : ""
        } · <a href="/app/net-worth">Net worth</a></p>`;

  return layout(
    "Accounts",
    `
<section class="manage-page">
  <h1>My Accounts</h1>
  <p>Manual entry or sync. No bank link required. <span class="cli-hint">Agent: <code>attache accounts list</code></span></p>
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
        ${kindSelectOptions("checking")}
      </select>
    </label>
    <label>Balance (USD)
      <input name="balanceUsd" type="number" step="0.01" required placeholder="3412.18" />
    </label>
    <button type="submit">Add account</button>
  </form>
</section>`,
  );
}

export interface ActivityPageFilter {
  accountId?: string;
  pending: "all" | "posted" | "pending";
  fromDate?: string;
  toDate?: string;
}

export function activityPage(
  transactions: Array<BankTransaction & { accountLabel: string }>,
  accounts: Array<{ id: string; name: string }> = [],
  filter: ActivityPageFilter = { pending: "all" },
  error?: string,
): string {
  const accountOptions = [
    `<option value="" ${!filter.accountId ? "selected" : ""}>All accounts</option>`,
    ...accounts.map(
      (a) =>
        `<option value="${escapeHtml(a.id)}" ${filter.accountId === a.id ? "selected" : ""}>${escapeHtml(a.name)}</option>`,
    ),
  ].join("");
  const filteredEmpty =
    transactions.length === 0 &&
    (filter.accountId || filter.pending !== "all" || filter.fromDate || filter.toDate);
  const list =
    transactions.length === 0
      ? `<p class="empty-hint">${
          filteredEmpty
            ? "No transactions match these filters."
            : `No posted transactions yet. <a href="/app/plaid">Connect a bank</a> when you want a register — manual accounts and bills work without it.`
        }</p>`
      : `<att-list heading="${transactions.length} matching">
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
      </att-list>`;

  return layout(
    "Activity",
    `
<section class="manage-page">
  <h1>Activity</h1>
  <p>Bank register. Filters are the same as <code>attache activity list</code>. Recategorize via CLI: <code>attache activity recategorize</code>.</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="get" action="/app/activity" class="filter-bar">
    <label>Account
      <select name="account">${accountOptions}</select>
    </label>
    <label>Status
      <select name="pending">
        <option value="all" ${filter.pending === "all" ? "selected" : ""}>All</option>
        <option value="posted" ${filter.pending === "posted" ? "selected" : ""}>Posted</option>
        <option value="pending" ${filter.pending === "pending" ? "selected" : ""}>Pending</option>
      </select>
    </label>
    <label>From
      <input type="date" name="from" value="${escapeHtml(filter.fromDate ?? "")}" />
    </label>
    <label>To
      <input type="date" name="to" value="${escapeHtml(filter.toDate ?? "")}" />
    </label>
    <button type="submit">Filter</button>
  </form>
  ${list}
  <p class="list-footer"><a href="/app/cashflow">Cash-flow by category</a></p>
</section>`,
  );
}

export function netWorthPage(
  snapshot: NetWorthSnapshot,
  accountCount: number,
  householdAssets: HouseholdAsset[] = [],
): string {
  const tone = snapshot.netWorthUsd < 0 ? "bad" : "neutral";
  const empty =
    accountCount === 0 && householdAssets.length === 0
      ? `<p class="empty-hint">No accounts yet — <a href="/app/accounts">add a checking or credit account</a>. Net worth is not a chart until there is something to own or owe.</p>`
      : "";
  const liabilityHint = snapshot.hasLiabilities
    ? "Credit cards and loans reduce net worth. Balances are what you owe."
    : "No credit or loan accounts on file — net worth equals assets. Add <code>--kind credit</code> or <code>loan</code> to subtract debt.";
  const otherHint =
    snapshot.unvaluedAssetCount > 0
      ? `${snapshot.unvaluedAssetCount} home/vehicle row${snapshot.unvaluedAssetCount === 1 ? "" : "s"} have no estimate and are omitted — we do not invent a value.`
      : snapshot.otherAssetsUsd > 0
        ? "Household assets with an estimate are included."
        : "";
  const assetList =
    householdAssets.length === 0
      ? ""
      : `<h2>Home &amp; vehicle</h2>
         <ul class="review-queue">${householdAssets
           .map((a) => {
             const est =
               a.estimatedUsd == null
                 ? "unvalued"
                 : `$${moneyUsd(a.estimatedUsd)}`;
             return `<li><strong>${escapeHtml(a.label)}</strong> · ${escapeHtml(a.kind)} · ${est}</li>`;
           })
           .join("")}</ul>
         <p class="cli-hint"><code>attache assets list</code> · <code>attache assets create --kind home --label …</code></p>`;
  return layout(
    "Net worth",
    `
<section class="manage-page">
  <h1>Net worth</h1>
  <p>Liquid + invested + valued household assets − liabilities. Same numbers as <code>attache net-worth</code>.</p>
  ${empty}
  <div class="stat-grid">
    <att-stat label="Net worth" value="$${moneyUsd(snapshot.netWorthUsd)}" tone="${tone}"
      helper="${snapshot.hasLiabilities ? "Assets − liabilities" : "Equals assets"}"></att-stat>
    <att-stat label="Liquid" value="$${moneyUsd(snapshot.liquidUsd)}" helper="Runway funds"></att-stat>
    <att-stat label="Invested" value="$${moneyUsd(snapshot.investedUsd)}" helper="Brokerage (read-only)"></att-stat>
    <att-stat label="Home/vehicle" value="$${moneyUsd(snapshot.otherAssetsUsd)}"
      helper="${snapshot.unvaluedAssetCount ? `${snapshot.unvaluedAssetCount} unvalued omitted` : "Estimates only"}"></att-stat>
    <att-stat label="Liabilities" value="$${moneyUsd(snapshot.liabilitiesUsd)}"
      helper="${snapshot.hasLiabilities ? "Credit + loans" : "None on file"}"></att-stat>
  </div>
  <p class="meta">${liabilityHint} ${otherHint}</p>
  ${assetList}
  <p class="list-footer"><a href="/app/accounts">My Accounts</a> · <a href="/app/cashflow">Cash flow</a></p>
</section>`,
  );
}

export function cashflowPage(
  report: CashflowReport,
  error?: string,
  trend?: CashflowTrend,
): string {
  const emptyHint =
    report.buckets.length === 0
      ? "No posted transactions in this window. Connect a bank or wait for sync — we do not invent a Sankey."
      : "";
  const uncat =
    report.uncategorizedCount > 0
      ? `<p class="meta">${report.uncategorizedCount} uncategorized — recategorize with <code>attache activity recategorize &lt;id&gt; --category Groceries</code></p>`
      : "";
  const outflowTone =
    !trend ? "neutral" : trend.outflowDeltaUsd > 0 ? "bad" : trend.outflowDeltaUsd < 0 ? "good" : "neutral";
  const deltaHelper = trend
    ? `vs ${escapeHtml(trend.prior.fromDate)} → ${escapeHtml(trend.prior.toDate)}: ${trend.outflowDeltaUsd >= 0 ? "+" : ""}$${moneyUsd(trend.outflowDeltaUsd)}`
    : "";
  const spark =
    trend
      ? `<att-cashflow-trend series-json="${jsonAttr(trend.series)}"
      empty-hint="No posted spend in this window to chart."></att-cashflow-trend>`
      : "";
  const deltaRows =
    trend && trend.categories.length > 0
      ? `<table class="delta-table">
        <thead><tr><th>Category</th><th>This window</th><th>Prior</th><th>Δ</th></tr></thead>
        <tbody>
          ${trend.categories
            .map((c) => {
              const delta =
                c.deltaUsd === 0
                  ? `$${moneyUsd(0)}`
                  : `${c.deltaUsd > 0 ? "+" : "−"}$${moneyUsd(Math.abs(c.deltaUsd))}`;
              return `<tr>
                <td>${escapeHtml(c.category)}</td>
                <td>$${moneyUsd(c.currentOutflowUsd)}</td>
                <td>$${moneyUsd(c.priorOutflowUsd)}</td>
                <td>${delta}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
      <p class="meta">Agent: <code>attache cashflow trend</code></p>`
      : trend
        ? `<p class="empty-hint">No category deltas — both windows are empty. We do not invent a Sankey. Agent: <code>attache cashflow trend</code></p>`
        : "";
  return layout(
    "Cash flow",
    `
<section class="manage-page">
  <h1>Cash flow</h1>
  <p>Posted activity by category (${escapeHtml(report.fromDate)} → ${escapeHtml(report.toDate)}). Pending is excluded. Same as <code>attache cashflow</code>.</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="get" action="/app/cashflow" class="filter-bar">
    <label>From
      <input type="date" name="from" value="${escapeHtml(report.fromDate)}" />
    </label>
    <label>To
      <input type="date" name="to" value="${escapeHtml(report.toDate)}" />
    </label>
    <button type="submit">Filter</button>
  </form>
  <div class="stat-grid">
    <att-stat label="Inflow" value="$${moneyUsd(report.inflowUsd)}"></att-stat>
    <att-stat label="Outflow" value="$${moneyUsd(report.outflowUsd)}"
      ${deltaHelper ? `helper="${deltaHelper}"` : ""}
      ${trend ? `tone="${outflowTone}"` : ""}></att-stat>
    <att-stat label="Net" value="$${moneyUsd(report.netUsd)}"
      tone="${report.netUsd < 0 ? "bad" : "good"}"></att-stat>
  </div>
  ${spark}
  <att-cashflow-bar buckets-json="${jsonAttr(report.buckets)}"
    empty-hint="${escapeHtml(emptyHint || "No posted transactions in this window.")}"></att-cashflow-bar>
  ${deltaRows}
  ${uncat}
  <p class="list-footer"><a href="/app/activity">Activity register</a></p>
</section>`,
  );
}

export function connectionsPage(opts: {
  plaidItems: number;
  snaptradeConnections: number;
  gmailAccounts: number;
  imapAccounts: number;
  attention: AttentionItem[];
  connectHints?: DiscoverCandidate[];
  livePlaid?: boolean;
  liveSnaptrade?: boolean;
  message?: string;
  error?: string;
}): string {
  const syncItems = opts.attention.filter((i) => i.id === "sync_error");
  return layout(
    "Connections",
    `
<section class="manage-page">
  <h1>Connections</h1>
  <p>Banks, brokerage, and bill inbox — optional. The household works without any of them.</p>
  ${opts.message ? `<p class="success">${escapeHtml(opts.message)}</p>` : ""}
  ${opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : ""}
  ${attentionStrip(syncItems)}
  ${connectHintsPanel(opts.connectHints ?? [], {
    livePlaid: Boolean(opts.livePlaid),
    liveSnaptrade: Boolean(opts.liveSnaptrade),
    heading: "Mail saw these institutions",
  })}
  <div class="connection-grid">
    <a class="connection-card" href="/app/plaid">
      <h2>Banks</h2>
      <p>${opts.plaidItems} Plaid item${opts.plaidItems === 1 ? "" : "s"}</p>
      <span class="cli-hint"><code>attache plaid status</code></span>
    </a>
    <a class="connection-card" href="/app/snaptrade">
      <h2>Brokerage</h2>
      <p>${opts.snaptradeConnections} SnapTrade connection${opts.snaptradeConnections === 1 ? "" : "s"} · read-only</p>
      <span class="cli-hint"><code>attache snaptrade status</code></span>
    </a>
    <a class="connection-card" href="/app/ingest">
      <h2>Bill inbox</h2>
      <p>${opts.gmailAccounts} Gmail · ${opts.imapAccounts} IMAP</p>
      <span class="cli-hint"><code>attache ingest status</code></span>
    </a>
  </div>
</section>`,
  );
}

/**
 * Statement hints from discover — Link is always a click (ADR-015 P2).
 * How: each card POSTs to the existing sandbox connect route or links to live Link.
 * Why: Gmail seeing Chase is not a bank; the button is the consent.
 */
export function connectHintsPanel(
  hints: DiscoverCandidate[],
  opts: { livePlaid: boolean; liveSnaptrade: boolean; heading: string },
): string {
  if (hints.length === 0) return "";
  const cards = hints
    .map((h) => {
      const who = escapeHtml(h.institutionHint ?? h.payee ?? "an institution");
      const isPlaid = h.action === "connect_plaid";
      const sandboxAction = isPlaid
        ? "/app/plaid/connect-sandbox"
        : "/app/snaptrade/connect-sandbox";
      const sandboxLabel = isPlaid ? "Connect sandbox bank" : "Connect sandbox brokerage";
      const live = isPlaid
        ? opts.livePlaid
          ? `<a href="/app/plaid/connect" class="btn-link primary">Plaid Link</a>`
          : ""
        : opts.liveSnaptrade
          ? `<form method="post" action="/app/snaptrade/connect" style="display:inline">
               <button type="submit" class="btn-link primary">SnapTrade portal</button>
             </form>`
          : "";
      const cli = isPlaid ? "attache plaid connect" : "attache snaptrade connect";
      const honesty = isPlaid
        ? "Not a bank until you Link."
        : "Read-only brokerage — not a trade, and not linked until you connect.";
      return `<li class="connect-hint-card">
        <h3>Gmail saw a ${who} statement</h3>
        <p>${honesty} Connecting is still a click.</p>
        <div class="wizard-actions">
          ${live}
          <form method="post" action="${sandboxAction}" style="display:inline">
            <button type="submit">${sandboxLabel}</button>
          </form>
        </div>
        <span class="cli-hint"><code>${cli}</code></span>
      </li>`;
    })
    .join("");
  return `<section class="connect-hints">
    <h2>${escapeHtml(opts.heading)}</h2>
    <ul class="connect-hint-list">${cards}</ul>
  </section>`;
}

/**
 * Home/vehicle hints from discover — confirm is HITL, estimate optional (ADR-015 P4).
 * Why: property tax is not a house on the books until the user confirms.
 */
export function assetHintsPanel(
  hints: DiscoverCandidate[],
  actionPrefix: string,
): string {
  const pending = hints.filter((h) => h.assetHint && !h.assetConfirmed);
  if (pending.length === 0) return "";
  const cards = pending
    .map((h) => {
      const kind = h.assetHint!.kind;
      return `<li class="connect-hint-card">
        <h3>Mail looks like a ${escapeHtml(kind)}</h3>
        <p>${escapeHtml(h.payee ?? h.assetHint!.label)}. Not on net worth until you confirm — estimate is optional. Not a document store.</p>
        <form method="post" action="${escapeHtml(actionPrefix)}/${escapeHtml(h.eventId)}" class="inline-form">
          <button type="submit">Confirm as ${escapeHtml(kind)}</button>
        </form>
        <span class="cli-hint"><code>attache assets confirm ${escapeHtml(h.eventId)}</code></span>
      </li>`;
    })
    .join("");
  return `<section class="connect-hints">
    <h2>Home &amp; vehicle hints</h2>
    <ul class="connect-hint-list">${cards}</ul>
  </section>`;
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
  if (status === "approved") {
    return `<span class="chip chip-review" title="${escapeHtml(TRANSFER_HONESTY.approvedStatus)}">approved (no ACH)</span>`;
  }
  if (status === "ach_pending") {
    return `<span class="chip chip-review" title="${escapeHtml(TRANSFER_HONESTY.achPendingStatus)}">ACH submitted</span>`;
  }
  if (status === "ach_failed") {
    return `<span class="chip chip-low" title="${escapeHtml(TRANSFER_HONESTY.achFailedStatus)}">ACH failed</span>`;
  }
  if (status === "executed") {
    return `<span class="chip chip-high" title="${escapeHtml(TRANSFER_HONESTY.executedStatus)}">executed (local ledger)</span>`;
  }
  return `<span class="chip chip-${status === "rejected" ? "low" : "review"}">${escapeHtml(status)}</span>`;
}

function proposalIsLinkedNonManual(
  p: TransferProposalRecord,
  accounts: FundingAccount[],
): boolean {
  const from = accounts.find((a) => a.id === p.fromAccountId);
  const to = p.toAccountId
    ? accounts.find((a) => a.id === p.toAccountId)
    : undefined;
  const linked = (a: FundingAccount | undefined) =>
    !a ||
    a.provenance === "plaid" ||
    a.provenance === "snaptrade" ||
    Boolean(a.plaidAccountId) ||
    Boolean(a.snaptradeAccountId) ||
    a.syncStatus !== "manual";
  return linked(from) || Boolean(to && linked(to));
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
    const from = accounts.find((a) => a.id === p.fromAccountId);
    const to = p.toAccountId
      ? accounts.find((a) => a.id === p.toAccountId)
      : undefined;
    const bothPlaid =
      from?.provenance === "plaid" && to?.provenance === "plaid";
    const achOn = achBackendFromEnv() !== "off";
    const plaidOnly = proposalIsLinkedNonManual(p, accounts);
    const pendingNote = bothPlaid && achOn
      ? achBackendFromEnv() === "plaid"
        ? TRANSFER_HONESTY.achSubmitLive
        : TRANSFER_HONESTY.achSubmitSandbox
      : plaidOnly
        ? TRANSFER_HONESTY.approvalOnly
        : TRANSFER_HONESTY.ledgerExecute;
    const honestyBanner =
      p.status === "pending"
        ? `<p class="meta honesty-note">${escapeHtml(pendingNote)}</p>`
        : "";
    const warnings =
      sim.warnings.length || sim.blockers.length
        ? `<ul class="xfer-notes">${[...sim.blockers, ...sim.warnings]
            .map((w) => `<li>${escapeHtml(w)}</li>`)
            .join("")}</ul>`
        : "";
    const approveLabel =
      bothPlaid && achOn
        ? "Approve &amp; submit ACH"
        : plaidOnly
          ? "Approve (no ACH)"
          : "Approve &amp; execute";
    const approveTitle = pendingNote;
    const actions =
      p.status === "pending"
        ? `<div class="wizard-actions">
             <form method="post" action="/app/transfers/${escapeHtml(p.id)}/approve" style="display:inline">
               <input type="hidden" name="note" value="" />
               <button type="submit" ${p.allowed ? "" : "disabled"} title="${escapeHtml(approveTitle)}">${approveLabel}</button>
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
      ${honestyBanner}
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
  <p><strong>Approve ≠ bank ACH</strong> unless <code>ATTACHE_ACH</code> is on and both legs are Plaid-linked.
     Manual accounts post to the local ledger. SnapTrade and mixed legs stay consent-only.</p>
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

  <p class="meta">Agent: <code>attache transfer submit</code> · <code>attache transfer approve</code> — check <code>execution.mode</code> / <code>message</code> in JSON.</p>
</section>`,
  );
}

export function plaidPage(
  items: PlaidItem[],
  linkedAccountCount: number,
  message?: string,
  error?: string,
  livePlaid = false,
  connectHints: DiscoverCandidate[] = [],
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
          .map((i) => {
            const err =
              i.status === "error" && (i.errorCode || i.errorMessage)
                ? `<p class="error compact">Sync error: <code>${escapeHtml(i.errorCode ?? "")}</code>
                     ${i.errorMessage ? escapeHtml(i.errorMessage) : ""}
                     — re-connect or unlink.</p>`
                : "";
            return `<li>
              <strong>${escapeHtml(i.institutionName)}</strong>
              · ${i.lastSyncAt ? `last sync ${escapeHtml(i.lastSyncAt.slice(0, 16))}` : "never synced"}
              · <code>${escapeHtml(i.status)}</code>
              ${err}
              <form method="post" action="/app/plaid/${escapeHtml(i.id)}/unlink" class="inline-danger"
                    onsubmit="return confirm('Unlink ${escapeHtml(i.institutionName)} and remove linked accounts from My Accounts?');">
                <button type="submit" class="btn-danger">Unlink</button>
              </form>
            </li>`;
          })
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
  ${connectHintsPanel(connectHints, {
    livePlaid,
    liveSnaptrade: false,
    heading: "Mail saw a bank statement",
  })}

  ${itemList}

  <div class="wizard-actions">
    ${livePlaid
      ? `<a href="/app/plaid/connect" class="btn-link primary">Connect bank (Plaid Link)</a>`
      : ""}
    <form method="post" action="/app/plaid/connect-sandbox" style="display:inline">
      <button type="submit">Connect sandbox bank</button>
    </form>
    ${items.length
      ? `<form method="post" action="/app/plaid/sync" style="display:inline">
          <button type="submit" class="btn-secondary">Sync now</button>
        </form>`
      : ""}
  </div>

  <p class="meta">Agent: <code>attache plaid connect</code> · <code>attache plaid sync</code> · <code>attache plaid unlink &lt;id&gt;</code></p>
  ${linkedAccountCount > 0
    ? `<p class="actions"><a href="/app/accounts" class="btn-link primary">View My Accounts (${linkedAccountCount})</a></p>
       <p class="meta">${passThrough.disclaimer}</p>`
    : ""}
</section>`,
  );
}

export function snaptradePage(
  connections: SnapTradeConnection[],
  linkedAccountCount: number,
  positions: StoredSnapTradePosition[] = [],
  message?: string,
  error?: string,
  liveConfigured = false,
  connectHints: DiscoverCandidate[] = [],
): string {
  const monthly =
    linkedAccountCount > 0
      ? `$${(PASS_THROUGH_RATES.snaptradePerUserMonth * Math.max(1, connections.length)).toFixed(2)}/mo`
      : `$${PASS_THROUGH_RATES.snaptradePerUserMonth.toFixed(2)}/user/mo pass-through`;

  const list =
    connections.length === 0
      ? `<p class="empty-hint">No brokerage links yet.</p>`
      : `<ul class="plaid-items">${connections
          .map((c) => {
            const err =
              c.status === "error" && c.lastError
                ? `<p class="error compact">${escapeHtml(c.lastError)}</p>`
                : "";
            return `<li>
              <strong>${escapeHtml(c.label)}</strong>
              ${c.brokerageName ? `· ${escapeHtml(c.brokerageName)}` : ""}
              · ${c.lastSyncAt ? `last sync ${escapeHtml(c.lastSyncAt.slice(0, 16))}` : "never synced"}
              · <code>${escapeHtml(c.status)}</code>
              ${err}
              <form method="post" action="/app/snaptrade/${escapeHtml(c.id)}/unlink" class="inline-danger"
                    onsubmit="return confirm('Unlink ${escapeHtml(c.label)} and remove brokerage accounts?');">
                <button type="submit" class="btn-danger">Unlink</button>
              </form>
            </li>`;
          })
          .join("")}</ul>`;

  return layout(
    "SnapTrade",
    `
<section class="form-page plaid-page">
  <h1>Investments</h1>
  <p>Read-only positions + equity via SnapTrade. Secrets live in <code>~/.attache/vault/</code> — never in SQLite (ADR-004). Not a Bloomberg.</p>
  <p class="meta">Pass-through: ${monthly} at vendor cost (ADR-006). Premium billing gate deferred.</p>
  ${message ? `<p class="success">${escapeHtml(message)}</p>` : ""}
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  ${connectHintsPanel(connectHints, {
    livePlaid: false,
    liveSnaptrade: liveConfigured,
    heading: "Mail saw a brokerage statement",
  })}

  ${list}

  <div class="wizard-actions">
    <form method="post" action="/app/snaptrade/connect-sandbox" style="display:inline">
      <button type="submit">Connect sandbox brokerage</button>
    </form>
    ${liveConfigured
      ? `<form method="post" action="/app/snaptrade/connect" style="display:inline">
           <button type="submit" class="btn-secondary">Connect (portal URL)</button>
         </form>`
      : ""}
    ${connections.length
      ? `<form method="post" action="/app/snaptrade/sync" style="display:inline">
          <button type="submit" class="btn-secondary">Sync now</button>
        </form>`
      : ""}
  </div>

  ${positions.length
    ? `<h2 class="section-heading">Positions (${positions.length})</h2>
       <att-list heading="Read-only holdings">
        ${positions
          .map(
            (p) => `<att-position-row
              symbol="${escapeHtml(p.symbol)}"
              ${p.accountName ? `account="${escapeHtml(p.accountName)}"` : ""}
              units="${p.units}"
              price="${p.priceUsd}"
              marketValue="${p.marketValueUsd}"
            ></att-position-row>`,
          )
          .join("")}
      </att-list>`
    : connections.length
      ? `<p class="empty-hint">No positions cached — sync after linking, or the brokerage has cash only.</p>`
      : ""}

  <p class="meta">Agent: <code>attache snaptrade positions</code> · <code>attache snaptrade sync</code> · <code>attache snaptrade unlink &lt;id&gt;</code></p>
  ${linkedAccountCount > 0
    ? `<p class="actions"><a href="/app/accounts" class="btn-link primary">View My Accounts (${linkedAccountCount})</a></p>`
    : ""}
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
  connectHints: DiscoverCandidate[] = [],
  assetHints: DiscoverCandidate[] = [],
  mailgunConfigured = false,
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
    ...gmailAccounts.map((a) => {
      const err =
        a.status === "error" && a.lastError
          ? `<p class="error compact">${escapeHtml(a.lastError)}</p>`
          : "";
      return `<li class="mail-account-row">
          <span class="mail-account-kind">Gmail</span>
          <strong>${escapeHtml(a.label)}</strong>
          <span class="meta">${escapeHtml(a.email)}</span>
          · ${a.lastSyncAt ? `synced ${escapeHtml(a.lastSyncAt.slice(0, 16))}` : "never synced"}
          · <code>${escapeHtml(a.status)}</code>
          ${err}
          <form method="post" action="/app/ingest/gmail/${escapeHtml(a.id)}/unlink" class="inline-danger"
                onsubmit="return confirm('Unlink Gmail ${escapeHtml(a.email)}?');">
            <button type="submit" class="btn-danger">Unlink</button>
          </form>
        </li>`;
    }),
    ...imapAccounts.map((a) => {
      const err =
        a.status === "error" && a.lastError
          ? `<p class="error compact">${escapeHtml(a.lastError)}</p>`
          : "";
      return `<li class="mail-account-row">
          <span class="mail-account-kind">IMAP</span>
          <strong>${escapeHtml(a.label)}</strong>
          <span class="meta">${escapeHtml(a.username)} @ ${escapeHtml(a.host)}</span>
          · ${a.lastSyncAt ? `synced ${escapeHtml(a.lastSyncAt.slice(0, 16))}` : "never synced"}
          · <code>${escapeHtml(a.status)}</code>
          ${err}
          <form method="post" action="/app/ingest/imap/${escapeHtml(a.id)}/unlink" class="inline-danger"
                onsubmit="return confirm('Unlink IMAP ${escapeHtml(a.label)}?');">
            <button type="submit" class="btn-danger">Unlink</button>
          </form>
        </li>`;
    }),
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
  ${connectHintsPanel(connectHints, {
    livePlaid: false,
    liveSnaptrade: false,
    heading: "Mail saw these institutions",
  })}
  ${assetHintsPanel(assetHints, "/app/ingest/asset")}

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
    <form method="post" action="/app/ingest/discover" style="display:inline">
      <button type="submit" class="btn-secondary" ${hasMailAccounts ? "" : "disabled"}>Find bills &amp; statements</button>
    </form>
    <form method="post" action="/app/ingest/discover-sandbox" style="display:inline">
      <button type="submit">Discover sandbox mail</button>
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
    <p class="meta">${mailgunConfigured
      ? `BYO Mailgun inbound is on — <code>POST /api/ingest/mailgun</code>. Mailgun sees plaintext. Primary path remains Gmail/IMAP.`
      : `Hosted Mailgun ingress is off. Set <code>ATTACHE_MAILGUN_SIGNING_KEY</code> to accept signed inbound (plaintext at Mailgun). Gmail/IMAP stay primary.`}</p>
    <p class="meta">Display address: <code>${escapeHtml(ingestAddress)}</code></p>
    <p class="meta">Generic webhook: <code>POST ${escapeHtml(webhookUrl)}</code>${webhookSecured ? " (Bearer)" : ""}</p>
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

  <p class="meta">Agent: <code>attache ingest discover</code> · <code>attache assets confirm &lt;id&gt;</code> · <code>attache ingest gmail connect</code></p>
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

/**
 * VS-8 — standalone unlock page when the encrypted DB has no key in this process.
 * No nav/header: every other route is gated until unlock succeeds.
 */
export function vaultUnlockPage(error?: string): string {
  const errBlock = error
    ? `<p class="vault-error" role="alert">${escapeHtml(error)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unlock vault — Attache</title>
  <link rel="stylesheet" href="/static/attache.css" />
  <style>
    body { display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0f1419; color: #e8eef4; }
    .vault-card { width: min(420px, 92vw); padding: 2rem; border: 1px solid #2a3540; border-radius: 12px; background: #151b22; }
    .vault-card h1 { margin: 0 0 0.5rem; font-size: 1.35rem; }
    .vault-card p { color: #9fb0c0; line-height: 1.5; }
    .vault-error { color: #f87171; background: #2a1515; padding: 0.75rem; border-radius: 8px; }
    label { display: block; margin: 1.25rem 0 0.35rem; font-weight: 600; }
    input[type=password] { width: 100%; padding: 0.65rem 0.75rem; border-radius: 8px; border: 1px solid #3a4a58; background: #0f1419; color: inherit; box-sizing: border-box; }
    button { margin-top: 1.25rem; width: 100%; padding: 0.75rem; border: 0; border-radius: 8px; background: #3b82f6; color: #fff; font-weight: 600; cursor: pointer; }
    .vault-foot { margin-top: 1.5rem; font-size: 0.85rem; color: #6b7c8d; }
  </style>
</head>
<body>
  <section class="vault-card">
    <h1>Unlock Attache</h1>
    <p>Your household data is encrypted. Enter the vault passphrase to continue.</p>
    ${errBlock}
    <form method="post" action="/vault/unlock">
      <label for="passphrase">Passphrase</label>
      <input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required autofocus />
      <button type="submit">Unlock</button>
    </form>
    <p class="vault-foot">Agents: set <code>ATTACHE_PASSPHRASE</code> or <code>ATTACHE_DEK</code> before starting the server. Lost passphrase = lost data.</p>
  </section>
</body>
</html>`;
}
