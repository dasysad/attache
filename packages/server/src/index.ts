import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import {
  accountLabelForTransaction,
  computeSolvencyForecast,
  confirmBillIngest,
  connectSandboxPlaid,
  connectLivePlaid,
  createPlaidLinkToken,
  isPlaidConfigured,
  plaidHostedLinkUrl,
  LivePlaidAdapter,
  connectImapAccount,
  connectSandboxGmail,
  connectGmailFromAuthCode,
  createGmailOAuthState,
  consumeGmailOAuthState,
  countPlaidLinkedAccounts,
  buildGoogleAuthUrl,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  createAccount,
  createDocumentAdapter,
  createEmailAdapter,
  createObligation,
  createPlaidAdapter,
  createTenant,
  createTransferProposal,
  deleteManualAccount,
  deleteObligation,
  approveTransferProposal,
  rejectTransferProposal,
  listTransferProposals,
  estimateMonthlyCost,
  getBillReview,
  getOrCreateIngestToken,
  getTenant,
  getVault,
  inboxDirForToken,
  ingestDocumentBytes,
  ingestEmailAddress,
  ingestEmailBatch,
  ingestEmailWebhook,
  type InboundEmailWebhookPayload,
  isOnboarded,
  listAccounts,
  listActivity,
  listObligations,
  listPendingBillReviews,
  listImapAccounts,
  listGmailAccounts,
  listPlaidItems,
  listRecentTransactions,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  savePushSubscription,
  markObligationPaid,
  markSetupComplete,
  markSetupDiscoverDone,
  markSetupConnectHintsDone,
  obligationDisplayStatus,
  openDatabase,
  hasKeyfile,
  isDatabaseUnlocked,
  unlockDatabaseWithPassphrase,
  WrongPassphraseError,
  pollImapIngest,
  pollGmailIngest,
  PRICING_SCENARIOS,
  setupWizardPath,
  syncAllPlaidItems,
  unlinkPlaidItem,
  unlinkGmailAccount,
  unlinkImapAccount,
  unlinkSnapTradeConnection,
  connectSandboxSnapTrade,
  connectLiveSnapTrade,
  syncAllSnapTradeConnections,
  listSnapTradeConnections,
  listSnapTradePositions,
  countSnapTradeLinkedAccounts,
  createSnapTradeAdapter,
  isSnapTradeConfigured,
  collectAttention,
  discoverMailCandidates,
  DiscoverError,
  listDiscoverCandidates,
  listUnsatisfiedConnectHints,
  transferApprovalMessage,
  updateManualAccount,
  updateObligation,
  computeNetWorth,
  computeCashflowTrend,
  parseFundingKind,
  listHouseholdAssets,
  listHouseholdEntities,
  getSetupCoverage,
  listMembers,
  addMember,
  removeMember,
  listIncomeStreams,
  createIncomeStream,
  deleteIncomeStream,
  getStatementRegister,
  createHouseholdAsset,
  deleteHouseholdAsset,
  confirmAssetHint,
  registerPushDevice,
  listPushDevices,
  unlinkPushDevice,
  ingestMailgunWebhook,
  MailgunWebhookError,
  isMailgunIngressConfigured,
  handleAchWebhook,
  AchWebhookError,
  achWebhookStatus,
  achStatus,
  createTransferRule,
  disableTransferRule,
  evaluateTransferRules,
  listTransferRules,
  listTransferRuleRuns,
  installTransferRulesSchedule,
  uninstallTransferRulesSchedule,
  transferRulesScheduleStatus,
  simulateAchPosted,
  syncAchTransfers,
  fcmStatus,
} from "@attache/core";
import {
  accountsPage,
  activityPage,
  appHomePage,
  billReviewPage,
  cashflowPage,
  connectionsPage,
  costEstimatorForm,
  ingestPage,
  layout,
  notificationsPage,
  netWorthPage,
  obligationsPage,
  onboardAccountPage,
  onboardConnectPage,
  onboardDiscoverPage,
  onboardObligationPage,
  onboardPage,
  parseCostForm,
  plaidPage,
  snaptradePage,
  pricingPage,
  renderCostReceipt,
  setNavUnreadCount,
  setNavCurrentPath,
  setTransferPendingCount,
  transfersPage,
  transferRulesPage,
  achPage,
  vaultUnlockPage,
  setupPage,
  peoplePage,
  assetsRegisterPage,
  entitiesPage,
  incomePage,
  statementsPage,
} from "./views.js";
import { syncNotificationsSync } from "./notify-sync.js";
import { resolvePublicRoot } from "./paths.js";
import { getVapidPublicKey, isPushConfigured } from "./push.js";

const app = new Hono();

app.use("*", async (c, next) => {
  setNavCurrentPath(c.req.path);
  await next();
});

const publicRoot = resolvePublicRoot();
app.use("/static/*", serveStatic({ root: publicRoot }));

/** VS-8: paths that work while the encrypted database is locked. */
function isVaultPublicPath(path: string): boolean {
  return (
    path.startsWith("/static") ||
    path === "/health" ||
    path === "/vault/unlock"
  );
}

/** Redirect to unlock form when the DB is encrypted and no key is available. */
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (isVaultPublicPath(path)) return next();
  if (!isDatabaseUnlocked()) {
    return c.redirect("/vault/unlock");
  }
  return next();
});

app.get("/health", (c) => {
  const encrypted = hasKeyfile();
  if (!isDatabaseUnlocked()) {
    return c.json({ status: "locked", encrypted }, 503);
  }
  return c.json({ status: "ok", encrypted });
});

app.get("/vault/unlock", (c) => {
  if (isDatabaseUnlocked()) return c.redirect("/");
  return c.html(vaultUnlockPage());
});

app.post("/vault/unlock", async (c) => {
  if (isDatabaseUnlocked()) return c.redirect("/");
  const body = await c.req.parseBody();
  const passphrase = String(body.passphrase ?? "");
  try {
    unlockDatabaseWithPassphrase(passphrase);
    return c.redirect("/");
  } catch (e) {
    const msg =
      e instanceof WrongPassphraseError
        ? "Incorrect passphrase. Try again."
        : "Could not unlock the vault.";
    return c.html(vaultUnlockPage(msg), 401);
  }
});

function withDb<T>(fn: (db: ReturnType<typeof openDatabase>) => T): T {
  const db = openDatabase();
  try {
    if (isOnboarded(db)) {
      syncNotificationsSync(db);
    } else {
      setNavUnreadCount(0);
      setTransferPendingCount(0);
    }
    return fn(db);
  } finally {
    db.close();
  }
}

async function withDbAsync<T>(
  fn: (db: ReturnType<typeof openDatabase>) => Promise<T>,
): Promise<T> {
  const db = openDatabase();
  try {
    if (isOnboarded(db)) {
      syncNotificationsSync(db);
    } else {
      setNavUnreadCount(0);
      setTransferPendingCount(0);
    }
    return await fn(db);
  } finally {
    db.close();
  }
}

function obligationsWithStatus(db: ReturnType<typeof openDatabase>) {
  return listObligations(db).map((o) => ({
    ...o,
    status: obligationDisplayStatus(o),
  }));
}

/** Redirect Home to setup hub while checklist is unfinished. App routes stay open. */
function maybeSetupRedirect(
  db: ReturnType<typeof openDatabase>,
  currentPath: string,
): Response | null {
  if (currentPath !== "/") return null;
  const next = setupWizardPath(db);
  if (!next || next === "/") return null;
  return new Response(null, {
    status: 302,
    headers: { Location: next },
  });
}

/** Return to setup hub after an accelerator mutation. */
function setupHubLocation(): string {
  return "/app/setup";
}

function onboardDiscoverHtml(
  db: ReturnType<typeof openDatabase>,
  opts?: { message?: string; error?: string },
): string {
  return onboardDiscoverPage({
    candidates: listDiscoverCandidates(db),
    mailConnected:
      listGmailAccounts(db).length > 0 || listImapAccounts(db).length > 0,
    gmailOAuth: isGoogleOAuthConfigured(),
    message: opts?.message,
    error: opts?.error,
  });
}

app.get("/", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const redirect = maybeSetupRedirect(db, "/");
    if (redirect) return redirect;
    const tenant = getTenant(db)!;
    const accounts = listAccounts(db);
    const obligations = listObligations(db);
    const forecast = computeSolvencyForecast(
      accounts,
      obligations,
      30,
      listIncomeStreams(db),
    );
    const txs = listRecentTransactions(db, 12).map((t) => ({
      ...t,
      accountLabel: accountLabelForTransaction(db, t.fundingAccountId),
    }));
    return c.html(
      appHomePage(
        tenant.name,
        tenant.ledgerPrimarySiteId,
        forecast,
        accounts,
        forecast.upcoming,
        txs,
        collectAttention(db),
      ),
    );
  }),
);

app.get("/onboard", (c) =>
  withDb((db) => {
    if (isOnboarded(db)) {
      const redirect = setupWizardPath(db);
      return c.redirect(redirect ?? "/");
    }
    return c.html(onboardPage());
  }),
);

app.post("/onboard", async (c) => {
  const body = await c.req.parseBody();
  const householdName = String(body.householdName ?? "").trim();
  const holderDisplayName = String(body.holderDisplayName ?? "").trim();
  if (!householdName || !holderDisplayName) {
    return c.html(onboardPage("Household name and your name are required."), 400);
  }
  return withDb((db) => {
    try {
      createTenant(db, { householdName, holderDisplayName });
      return c.redirect(setupHubLocation());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create household";
      return c.html(onboardPage(msg), 400);
    }
  });
});

app.get("/onboard/discover", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(
      onboardDiscoverHtml(db, {
        message: c.req.query("msg") ? String(c.req.query("msg")) : undefined,
        error: c.req.query("error") ? String(c.req.query("error")) : undefined,
      }),
    );
  }),
);

/** Skip and Continue both mark the step done — Gmail is never required. */
app.get("/onboard/discover/skip", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markSetupDiscoverDone(db);
    return c.redirect(setupHubLocation());
  }),
);

app.get("/onboard/discover/continue", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markSetupDiscoverDone(db);
    return c.redirect(setupHubLocation());
  }),
);

/**
 * POST runs discover (poll). GET never polls — listDiscoverCandidates only.
 * Stay on the wizard so bills can be confirmed before connect hints.
 */
app.post("/onboard/discover/run", async (c) =>
  withDbAsync(async (db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = await discoverMailCandidates(
        db,
        getVault(),
        createDocumentAdapter(),
      );
      return c.redirect(
        `/onboard/discover?msg=${encodeURIComponent(result.message)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "discover failed";
      return c.redirect(`/onboard/discover?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/onboard/discover-sandbox", async (c) =>
  withDbAsync(async (db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = await discoverMailCandidates(
        db,
        getVault(),
        createDocumentAdapter(),
        { sandbox: true },
      );
      return c.redirect(
        `/onboard/discover?msg=${encodeURIComponent(result.message)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "discover failed";
      return c.redirect(`/onboard/discover?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/onboard/discover/confirm/:id", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const eventId = c.req.param("id");
    try {
      const obligation = confirmBillIngest(db, eventId);
      return c.redirect(
        `/onboard/discover?msg=${encodeURIComponent(`Confirmed ${obligation.payee}`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "confirm failed";
      return c.redirect(`/onboard/discover?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/onboard/discover/asset/:id", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const eventId = c.req.param("id");
    try {
      const asset = confirmAssetHint(db, eventId);
      return c.redirect(
        `/onboard/discover?msg=${encodeURIComponent(`Noted ${asset.kind}: ${asset.label}`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "asset confirm failed";
      return c.redirect(`/onboard/discover?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.get("/onboard/connect", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(
      onboardConnectPage({
        hints: listUnsatisfiedConnectHints(db),
        livePlaid: isPlaidConfigured(),
        liveSnaptrade: isSnapTradeConfigured(),
        message: c.req.query("msg") ? String(c.req.query("msg")) : undefined,
        error: c.req.query("error") ? String(c.req.query("error")) : undefined,
      }),
    );
  }),
);

app.get("/onboard/connect/skip", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markSetupConnectHintsDone(db);
    return c.redirect(setupHubLocation());
  }),
);

app.get("/onboard/connect/continue", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markSetupConnectHintsDone(db);
    return c.redirect(setupHubLocation());
  }),
);

app.get("/onboard/account", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(onboardAccountPage());
  }),
);

app.post("/onboard/account", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const institution = String(body.institution ?? "").trim();
  const mask = String(body.mask ?? "").trim();
  const balanceUsd = Number(body.balanceUsd);
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      createAccount(db, {
        name,
        institution: institution || undefined,
        mask: mask || undefined,
        balanceUsd,
      });
      return c.redirect(setupHubLocation());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add account";
      return c.html(onboardAccountPage(msg), 400);
    }
  });
});

app.get("/onboard/obligation", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(onboardObligationPage());
  }),
);

app.get("/onboard/obligation/skip", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markSetupComplete(db);
    return c.redirect("/");
  }),
);

app.post("/onboard/obligation", async (c) => {
  const body = await c.req.parseBody();
  const payee = String(body.payee ?? "").trim();
  const amountUsd = Number(body.amountUsd);
  const dueDate = String(body.dueDate ?? "").trim();
  const cadence = String(body.cadence ?? "monthly");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    if (!payee || !dueDate || !Number.isFinite(amountUsd)) {
      markSetupComplete(db);
      return c.redirect("/");
    }
    try {
      createObligation(db, {
        payee,
        amountUsd,
        dueDate,
        cadence: cadence as "once" | "monthly" | "yearly",
      });
      markSetupComplete(db);
      return c.redirect("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add obligation";
      return c.html(onboardObligationPage(msg), 400);
    }
  });
});

app.get("/app/accounts", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      accountsPage(
        listAccounts(db),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
      ),
    );
  }),
);

app.get("/app/activity", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const accountId = c.req.query("account")?.trim() || undefined;
    const pendingQ = c.req.query("pending") ?? "all";
    const pending: "all" | "posted" | "pending" =
      pendingQ === "posted" || pendingQ === "pending" ? pendingQ : "all";
    const fromDate = c.req.query("from")?.trim() || undefined;
    const toDate = c.req.query("to")?.trim() || undefined;
    try {
      const txs = listActivity(db, {
        accountId,
        pending: pending === "all" ? undefined : pending === "pending",
        fromDate,
        toDate,
        limit: 200,
      });
      return c.html(
        activityPage(
          txs,
          listAccounts(db).map((a) => ({ id: a.id, name: a.name })),
          { accountId, pending, fromDate, toDate },
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid filter";
      return c.html(
        activityPage(
          [],
          listAccounts(db).map((a) => ({ id: a.id, name: a.name })),
          { accountId, pending, fromDate, toDate },
          msg,
        ),
        400,
      );
    }
  }),
);

app.get("/app/net-worth", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const accounts = listAccounts(db);
    const assets = listHouseholdAssets(db);
    return c.html(netWorthPage(computeNetWorth(accounts, assets), accounts.length, assets));
  }),
);

app.get("/app/cashflow", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const fromDate = c.req.query("from")?.trim() || undefined;
    const toDate = c.req.query("to")?.trim() || undefined;
    try {
      const trend = computeCashflowTrend(db, { fromDate, toDate });
      return c.html(cashflowPage(trend.current, undefined, trend));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid range";
      const fallback = computeCashflowTrend(db, {});
      return c.html(cashflowPage(fallback.current, msg, fallback), 400);
    }
  }),
);

app.get("/app/setup", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    return c.html(setupPage(getSetupCoverage(db), msg));
  }),
);

app.post("/app/setup/complete", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markSetupComplete(db);
    return c.redirect("/app/setup?msg=Setup+marked+complete");
  }),
);

app.get("/app/people", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(
      peoplePage(listMembers(db), c.req.query("msg"), c.req.query("error")),
    );
  }),
);

app.post("/app/people", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const body = await c.req.parseBody();
    const name = String(body.name ?? "");
    const kind = String(body.kind ?? "other");
    try {
      addMember(db, { displayName: name, kind });
      return c.redirect("/app/people?msg=Member+added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return c.redirect(`/app/people?error=${encodeURIComponent(msg)}`);
    }
  } finally {
    db.close();
  }
});

app.post("/app/people/:id/delete", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      removeMember(db, c.req.param("id"));
      return c.redirect("/app/people?msg=Member+removed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return c.redirect(`/app/people?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.get("/app/assets", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(
      assetsRegisterPage(
        listHouseholdAssets(db),
        c.req.query("msg"),
        c.req.query("error"),
      ),
    );
  }),
);

app.post("/app/assets", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const body = await c.req.parseBody();
    const estimateRaw = String(body.estimate ?? "").trim();
    try {
      createHouseholdAsset(db, {
        kind: String(body.kind ?? "home"),
        label: String(body.label ?? ""),
        estimatedUsd: estimateRaw ? Number(estimateRaw) : null,
      });
      return c.redirect("/app/assets?msg=Asset+added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return c.redirect(`/app/assets?error=${encodeURIComponent(msg)}`);
    }
  } finally {
    db.close();
  }
});

app.post("/app/assets/:id/delete", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      deleteHouseholdAsset(db, c.req.param("id"));
      return c.redirect("/app/assets?msg=Asset+deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return c.redirect(`/app/assets?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.get("/app/entities", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(entitiesPage(listHouseholdEntities(db)));
  }),
);

app.get("/app/income", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(
      incomePage(listIncomeStreams(db), c.req.query("msg"), c.req.query("error")),
    );
  }),
);

app.post("/app/income", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const body = await c.req.parseBody();
    try {
      createIncomeStream(db, {
        label: String(body.label ?? ""),
        amountUsd: Number(body.amount),
        nextDate: String(body.next ?? ""),
        cadence: String(body.cadence ?? "monthly"),
      });
      return c.redirect("/app/income?msg=Income+added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return c.redirect(`/app/income?error=${encodeURIComponent(msg)}`);
    }
  } finally {
    db.close();
  }
});

app.post("/app/income/:id/delete", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      deleteIncomeStream(db, c.req.param("id"));
      return c.redirect("/app/income?msg=Income+deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed";
      return c.redirect(`/app/income?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.get("/app/statements", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    return c.html(statementsPage(getStatementRegister(db)));
  }),
);

app.get("/app/connections", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      connectionsPage({
        plaidItems: listPlaidItems(db).length,
        snaptradeConnections: listSnapTradeConnections(db).length,
        gmailAccounts: listGmailAccounts(db).length,
        imapAccounts: listImapAccounts(db).length,
        attention: collectAttention(db),
        connectHints: listUnsatisfiedConnectHints(db),
        livePlaid: isPlaidConfigured(),
        liveSnaptrade: isSnapTradeConfigured(),
        message: msg ? String(msg) : undefined,
        error: err ? String(err) : undefined,
      }),
    );
  }),
);

app.post("/app/accounts", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const institution = String(body.institution ?? "").trim();
  const mask = String(body.mask ?? "").trim();
  const kind = String(body.kind ?? "checking");
  const balanceUsd = Number(body.balanceUsd);
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      createAccount(db, {
        name,
        institution: institution || undefined,
        mask: mask || undefined,
        kind: parseFundingKind(kind),
        balanceUsd,
      });
      return c.redirect("/app/accounts?msg=Account+added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add account";
      return c.html(accountsPage(listAccounts(db), undefined, msg), 400);
    }
  });
});

app.post("/app/accounts/:id/update", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      updateManualAccount(db, id, {
        name: String(body.name ?? "").trim(),
        institution: String(body.institution ?? "").trim(),
        mask: String(body.mask ?? "").trim(),
        kind: parseFundingKind(String(body.kind ?? "checking")),
        balanceUsd: Number(body.balanceUsd),
      });
      return c.redirect("/app/accounts?msg=Account+updated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "update failed";
      return c.redirect(`/app/accounts?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/accounts/:id/delete", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      deleteManualAccount(db, id);
      return c.redirect("/app/accounts?msg=Account+deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "delete failed";
      return c.redirect(`/app/accounts?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.get("/app/obligations", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      obligationsPage(
        obligationsWithStatus(db),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
      ),
    );
  }),
);

app.post("/app/obligations", async (c) => {
  const body = await c.req.parseBody();
  const payee = String(body.payee ?? "").trim();
  const amountUsd = Number(body.amountUsd);
  const dueDate = String(body.dueDate ?? "").trim();
  const cadence = String(body.cadence ?? "once");
  const autopay = body.autopay === "true" || body.autopay === "on";
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      createObligation(db, {
        payee,
        amountUsd,
        dueDate,
        cadence: cadence as "once" | "monthly" | "yearly",
        autopay,
      });
      markSetupComplete(db);
      return c.redirect("/app/obligations?msg=Obligation+added");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add obligation";
      return c.html(obligationsPage(obligationsWithStatus(db), undefined, msg), 400);
    }
  });
});

app.post("/app/obligations/:id/update", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      updateObligation(db, id, {
        payee: String(body.payee ?? "").trim(),
        amountUsd: Number(body.amountUsd),
        dueDate: String(body.dueDate ?? "").trim(),
        cadence: String(body.cadence ?? "once") as "once" | "monthly" | "yearly",
        autopay: body.autopay === "true" || body.autopay === "on",
        notes: String(body.notes ?? "") || undefined,
      });
      return c.redirect("/app/obligations?msg=Obligation+updated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "update failed";
      return c.redirect(`/app/obligations?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/obligations/:id/delete", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      deleteObligation(db, id);
      return c.redirect("/app/obligations?msg=Obligation+deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "delete failed";
      return c.redirect(`/app/obligations?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/obligations/:id/paid", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      markObligationPaid(db, id);
    } catch {
      /* ignore */
    }
    return c.redirect("/app/obligations?msg=Marked+paid");
  });
});

app.get("/app/transfers", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      transfersPage(
        listTransferProposals(db, { limit: 30 }),
        listAccounts(db),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
      ),
    );
  }),
);

app.post("/app/transfers/submit", async (c) => {
  const body = await c.req.parseBody();
  const fromAccountId = String(body.fromAccountId ?? "");
  const toRaw = String(body.toAccountId ?? "");
  const amountUsd = Number(body.amountUsd);
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      createTransferProposal(db, {
        fromAccountId,
        toAccountId: toRaw || undefined,
        amountUsd,
        memo: String(body.memo ?? "") || undefined,
        proposedBy: "web",
      });
      return c.redirect("/app/transfers?msg=Proposal+submitted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "submit failed";
      return c.redirect(`/app/transfers?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/transfers/:id/approve", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const note = String(body.note ?? "") || undefined;
  return withDbAsync(async (db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = await approveTransferProposal(db, id, note);
      const msg = encodeURIComponent(transferApprovalMessage(result.status));
      return c.redirect(`/app/transfers?msg=${msg}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "approve failed";
      return c.redirect(`/app/transfers?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/transfers/:id/reject", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const note = String(body.note ?? "") || undefined;
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      rejectTransferProposal(db, id, note);
      return c.redirect("/app/transfers?msg=Proposal+rejected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "reject failed";
      return c.redirect(`/app/transfers?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.get("/app/transfer-rules", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      transferRulesPage(
        listTransferRules(db),
        listTransferRuleRuns(db),
        listAccounts(db),
        transferRulesScheduleStatus(),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
      ),
    );
  }),
);

app.post("/app/transfer-rules", async (c) => {
  const body = await c.req.parseBody();
  const name = String(body.name ?? "").trim();
  const fromAccountId = String(body.fromAccountId ?? "");
  const toAccountId = String(body.toAccountId ?? "");
  const amountUsd = Number(body.amountUsd);
  const maxPerRunUsd = body.maxPerRunUsd ? Number(body.maxPerRunUsd) : undefined;
  const maxPerMonthUsd = body.maxPerMonthUsd
    ? Number(body.maxPerMonthUsd)
    : undefined;
  const autonomy = String(body.autonomy ?? "proposal");
  const thresholdRaw = body.thresholdUsd ? Number(body.thresholdUsd) : undefined;
  const whenCel = String(body.whenCel ?? "").trim() || undefined;
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      createTransferRule(db, {
        name,
        fromAccountId,
        toAccountId,
        amountUsd,
        maxPerRunUsd: Number.isFinite(maxPerRunUsd) ? maxPerRunUsd : undefined,
        maxPerMonthUsd: Number.isFinite(maxPerMonthUsd)
          ? maxPerMonthUsd
          : undefined,
        autonomy:
          autonomy === "auto" || autonomy === "proposal" ? autonomy : undefined,
        thresholdUsd: Number.isFinite(thresholdRaw) ? thresholdRaw : undefined,
        whenCel,
      });
      return c.redirect("/app/transfer-rules?msg=Rule+created");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "create failed";
      return c.redirect(`/app/transfer-rules?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/transfer-rules/evaluate", (c) =>
  withDbAsync(async (db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = await evaluateTransferRules(db);
      return c.redirect(
        `/app/transfer-rules?msg=${encodeURIComponent(result.message)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "evaluate failed";
      return c.redirect(`/app/transfer-rules?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/app/transfer-rules/schedule/install", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      installTransferRulesSchedule();
      return c.redirect("/app/transfer-rules?msg=Schedule+installed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "install failed";
      return c.redirect(`/app/transfer-rules?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/app/transfer-rules/schedule/uninstall", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      uninstallTransferRulesSchedule();
      return c.redirect("/app/transfer-rules?msg=Schedule+removed");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "uninstall failed";
      return c.redirect(`/app/transfer-rules?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/app/transfer-rules/:id/disable", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const id = c.req.param("id");
    const rule = disableTransferRule(db, id);
    if (!rule) {
      return c.redirect("/app/transfer-rules?error=Rule+not+found");
    }
    return c.redirect("/app/transfer-rules?msg=Rule+disabled");
  }),
);

app.get("/app/ach", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      achPage(
        achStatus(db),
        achWebhookStatus(),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
      ),
    );
  }),
);

app.post("/app/ach/sync", (c) =>
  withDbAsync(async (db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const synced = await syncAchTransfers(db);
      return c.redirect(
        `/app/ach?msg=${encodeURIComponent(`Synced ${synced.length} open transfer(s)`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync failed";
      return c.redirect(`/app/ach?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/app/ach/simulate/:proposalId", (c) =>
  withDbAsync(async (db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const proposalId = c.req.param("proposalId");
    try {
      await simulateAchPosted(db, proposalId);
      return c.redirect("/app/ach?msg=Simulated+posted+→+ledger");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "simulate failed";
      return c.redirect(`/app/ach?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.get("/app/plaid", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      plaidPage(
        listPlaidItems(db),
        countPlaidLinkedAccounts(db),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
        isPlaidConfigured(),
        listUnsatisfiedConnectHints(db).filter((h) => h.action === "connect_plaid"),
      ),
    );
  }),
);

app.post("/app/plaid/connect-sandbox", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const adapter = createPlaidAdapter();
    const { sync } = await connectSandboxPlaid(db, adapter, getVault());
    return c.redirect(
      `/app/accounts?msg=${encodeURIComponent(`Connected — ${sync.transactionsNew} transactions · My Accounts updated`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connect failed";
    return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.get("/app/plaid/connect", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    if (!isPlaidConfigured()) {
      return c.redirect("/app/plaid?error=Plaid+not+configured");
    }
    const adapter = createPlaidAdapter();
    if (adapter.mode !== "live") {
      return c.redirect("/app/plaid?error=Plaid+not+configured");
    }
    const host = c.req.header("host") ?? "localhost:8780";
    const redirectUri = `http://${host}/app/plaid/callback`;
    const { linkToken } = await createPlaidLinkToken(
      db,
      adapter as LivePlaidAdapter,
      redirectUri,
    );
    return c.redirect(plaidHostedLinkUrl(linkToken));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "link failed";
    return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.get("/app/plaid/callback", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const err = c.req.query("error");
    if (err) {
      const detail = c.req.query("error_message") ?? err;
      return c.redirect(`/app/plaid?error=${encodeURIComponent(String(detail))}`);
    }
    const publicToken = c.req.query("public_token");
    if (!publicToken) {
      return c.redirect("/app/plaid?error=Missing+public_token");
    }
    const adapter = createPlaidAdapter();
    if (adapter.mode !== "live") {
      return c.redirect("/app/plaid?error=Plaid+not+configured");
    }
    const { sync } = await connectLivePlaid(
      db,
      adapter as LivePlaidAdapter,
      getVault(),
      String(publicToken),
    );
    return c.redirect(
      `/app/accounts?msg=${encodeURIComponent(`Connected — ${sync.transactionsNew} transactions · My Accounts updated`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connect failed";
    return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/plaid/sync", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const results = await syncAllPlaidItems(db, createPlaidAdapter(), getVault());
    if (!results.length) {
      return c.redirect("/app/plaid?error=No+Plaid+items+linked");
    }
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      const msg = failed
        .map((r) => r.error ?? "sync failed")
        .join("; ")
        .slice(0, 200);
      return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
    }
    const newTx = results.reduce((s, r) => s + r.transactionsNew, 0);
    return c.redirect(
      `/app/accounts?msg=${encodeURIComponent(`Sync complete — ${newTx} new transactions · My Accounts updated`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/plaid/:id/unlink", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = unlinkPlaidItem(db, id, getVault());
      return c.redirect(
        `/app/accounts?msg=${encodeURIComponent(`Unlinked ${result.institutionName} — removed from My Accounts`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unlink failed";
      return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.get("/app/snaptrade", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      snaptradePage(
        listSnapTradeConnections(db),
        countSnapTradeLinkedAccounts(db),
        listSnapTradePositions(db),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
        isSnapTradeConfigured(),
        listUnsatisfiedConnectHints(db).filter((h) => h.action === "connect_snaptrade"),
      ),
    );
  }),
);

app.post("/app/snaptrade/connect-sandbox", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const { sync } = await connectSandboxSnapTrade(
      db,
      createSnapTradeAdapter(),
      getVault(),
    );
    return c.redirect(
      `/app/accounts?msg=${encodeURIComponent(`SnapTrade sandbox — ${sync.accountsUpdated} brokerage account(s) on My Accounts`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connect failed";
    return c.redirect(`/app/snaptrade?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/snaptrade/connect", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    if (!isSnapTradeConfigured()) {
      return c.redirect(
        `/app/snaptrade?error=${encodeURIComponent("Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY")}`,
      );
    }
    const result = await connectLiveSnapTrade(db, createSnapTradeAdapter(), getVault());
    const hint = result.portalUrl
      ? `Open portal: ${result.portalUrl}`
      : "Connected — run Sync after linking in portal";
    return c.redirect(`/app/snaptrade?msg=${encodeURIComponent(hint)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "connect failed";
    return c.redirect(`/app/snaptrade?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/snaptrade/sync", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const results = await syncAllSnapTradeConnections(
      db,
      createSnapTradeAdapter(),
      getVault(),
    );
    if (!results.length) {
      return c.redirect(`/app/snaptrade?error=${encodeURIComponent("No SnapTrade connections")}`);
    }
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      return c.redirect(
        `/app/snaptrade?error=${encodeURIComponent(failed.map((r) => r.error).join("; ").slice(0, 200))}`,
      );
    }
    const n = results.reduce((s, r) => s + r.accountsUpdated, 0);
    return c.redirect(
      `/app/accounts?msg=${encodeURIComponent(`SnapTrade sync — ${n} account(s) updated`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    return c.redirect(`/app/snaptrade?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/snaptrade/:id/unlink", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = unlinkSnapTradeConnection(db, id, getVault());
      return c.redirect(
        `/app/accounts?msg=${encodeURIComponent(`Unlinked ${result.label} — removed from My Accounts`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unlink failed";
      return c.redirect(`/app/snaptrade?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.get("/app/ingest", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const token = getOrCreateIngestToken(db);
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    const host = c.req.header("host") ?? "localhost:8780";
    return c.html(
      ingestPage(
        listPendingBillReviews(db),
        ingestEmailAddress(token),
        inboxDirForToken(token),
        `http://${host}/api/ingest/email`,
        process.env.ATTACHE_EXTRACT_URL ?? null,
        Boolean(process.env.ATTACHE_INGEST_WEBHOOK_SECRET),
        listGmailAccounts(db),
        listImapAccounts(db),
        isGoogleOAuthConfigured(),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
        listUnsatisfiedConnectHints(db),
        listDiscoverCandidates(db).filter((c) => c.assetHint && !c.assetConfirmed),
        isMailgunIngressConfigured(),
      ),
    );
  }),
);

app.post("/app/ingest/upload", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const body = await c.req.parseBody();
    const file = body.bill;
    if (!file || typeof file === "string") {
      return c.redirect("/app/ingest?error=No+file+uploaded");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestDocumentBytes(db, createDocumentAdapter(), {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: buffer,
    });
    return c.redirect(
      `/app/ingest/review/${result.event.id}?msg=${encodeURIComponent("Extracted — confirm fields")}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.get("/app/ingest/gmail/connect", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const host = c.req.header("host") ?? "localhost:8780";
    const redirectUri = `http://${host}/app/ingest/gmail/callback`;
    const config = getGoogleOAuthConfig(redirectUri);
    if (!config) {
      return c.redirect("/app/ingest?error=Google+OAuth+not+configured");
    }
    const state = createGmailOAuthState(db);
    return c.redirect(buildGoogleAuthUrl(config, state));
  }),
);

app.get("/app/ingest/gmail/callback", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const err = c.req.query("error");
    if (err) {
      return c.redirect(`/app/ingest?error=${encodeURIComponent(String(err))}`);
    }
    if (!code || !state || !consumeGmailOAuthState(db, String(state))) {
      return c.redirect("/app/ingest?error=Invalid+OAuth+state");
    }
    const host = c.req.header("host") ?? "localhost:8780";
    const redirectUri = `http://${host}/app/ingest/gmail/callback`;
    const config = getGoogleOAuthConfig(redirectUri);
    if (!config) {
      return c.redirect("/app/ingest?error=Google+OAuth+not+configured");
    }
    const account = await connectGmailFromAuthCode(db, getVault(), String(code), config);
    return c.redirect(
      `/app/ingest?msg=${encodeURIComponent(`Gmail connected — ${account.email}`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gmail connect failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/ingest/gmail/connect-sandbox", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const account = connectSandboxGmail(db, getVault());
    return c.redirect(
      `/app/ingest?msg=${encodeURIComponent(`Gmail sandbox connected — ${account.email}`)}`,
    );
  }),
);

app.post("/app/ingest/gmail/:id/unlink", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = unlinkGmailAccount(db, id, getVault());
      return c.redirect(
        `/app/ingest?msg=${encodeURIComponent(`Unlinked Gmail ${result.email}`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unlink failed";
      return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/ingest/poll-gmail", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const batch = await pollGmailIngest(db, getVault(), createDocumentAdapter());
    const failed = batch.accountOutcomes.filter((o) => !o.ok);
    if (failed.length && !batch.billsCreated) {
      const msg = failed.map((o) => o.error ?? "poll failed").join("; ").slice(0, 200);
      return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
    }
    if (!batch.billsCreated) {
      return c.redirect(
        `/app/ingest?error=${encodeURIComponent(`No new Gmail bills (${batch.accountsPolled} account(s))`)}`,
      );
    }
    const first = batch.results[0]!;
    const suffix = failed.length ? ` · ${failed.length} account error(s)` : "";
    return c.redirect(
      `/app/ingest/review/${first.event.id}?msg=${encodeURIComponent(`Gmail: ${batch.billsCreated} bill(s)${suffix}`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gmail poll failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

/**
 * Run discover (poll + rank) then land on Connections so statement hints are visible.
 * Why: P2 human path — Find in Gmail → Connect cards; Link remains a click.
 */
app.post("/app/ingest/discover", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const result = await discoverMailCandidates(db, getVault(), createDocumentAdapter());
    return c.redirect(
      `/app/connections?msg=${encodeURIComponent(result.message)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "discover failed";
    const dest =
      e instanceof DiscoverError && e.code === "no_mail" ? "/app/ingest" : "/app/connections";
    return c.redirect(`${dest}?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/ingest/discover-sandbox", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const result = await discoverMailCandidates(db, getVault(), createDocumentAdapter(), {
      sandbox: true,
    });
    return c.redirect(
      `/app/connections?msg=${encodeURIComponent(result.message)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "discover failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/ingest/imap/connect", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const body = await c.req.parseBody();
    const get = (k: string) => {
      const v = body[k];
      if (Array.isArray(v)) return String(v[0] ?? "");
      return String(v ?? "");
    };
    connectImapAccount(db, getVault(), {
      label: get("label") || undefined,
      host: get("host"),
      username: get("username"),
      password: get("password"),
      mailbox: get("mailbox") || "INBOX",
    });
    return c.redirect("/app/ingest?msg=IMAP+mailbox+connected");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "imap connect failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/ingest/imap/:id/unlink", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = unlinkImapAccount(db, id, getVault());
      return c.redirect(
        `/app/ingest?msg=${encodeURIComponent(`Unlinked IMAP ${result.label}`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unlink failed";
      return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
    }
  });
});

app.post("/app/ingest/asset/:id", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const eventId = c.req.param("id");
    try {
      const asset = confirmAssetHint(db, eventId);
      return c.redirect(
        `/app/ingest?msg=${encodeURIComponent(`Noted ${asset.kind}: ${asset.label}`)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "asset confirm failed";
      return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
    }
  }),
);

app.post("/app/ingest/poll-imap", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const batch = await pollImapIngest(db, getVault(), createDocumentAdapter());
    const failed = batch.accountOutcomes.filter((o) => !o.ok);
    if (failed.length && !batch.billsCreated) {
      const msg = failed.map((o) => o.error ?? "poll failed").join("; ").slice(0, 200);
      return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
    }
    if (!batch.billsCreated) {
      return c.redirect(
        `/app/ingest?error=${encodeURIComponent(`No new bills (${batch.accountsPolled} account(s) polled)`)}`,
      );
    }
    const first = batch.results[0]!;
    const suffix = failed.length ? ` · ${failed.length} account error(s)` : "";
    return c.redirect(
      `/app/ingest/review/${first.event.id}?msg=${encodeURIComponent(`IMAP: ${batch.billsCreated} bill(s)${suffix}`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "imap poll failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/ingest/poll-email", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const token = getOrCreateIngestToken(db);
    const batch = await ingestEmailBatch(
      db,
      createDocumentAdapter(),
      createEmailAdapter("live"),
      token,
    );
    if (!batch.billsCreated) {
      return c.redirect(
        `/app/ingest?error=${encodeURIComponent(`No new mail in ${inboxDirForToken(token)}/`)}`,
      );
    }
    const first = batch.results[0]!;
    return c.redirect(
      `/app/ingest/review/${first.event.id}?msg=${encodeURIComponent(`Polled ${batch.messagesProcessed} message(s)`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "poll failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/app/ingest/simulate-email", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const token = getOrCreateIngestToken(db);
    const batch = await ingestEmailBatch(
      db,
      createDocumentAdapter(),
      createEmailAdapter("sandbox"),
      token,
    );
    if (!batch.billsCreated) {
      return c.redirect("/app/ingest?error=No+new+email+bills");
    }
    const first = batch.results[0]!;
    return c.redirect(
      `/app/ingest/review/${first.event.id}?msg=${encodeURIComponent("Email bill ingested")}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "email ingest failed";
    return c.redirect(`/app/ingest?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.post("/api/ingest/email", async (c) => {
  const secret = process.env.ATTACHE_INGEST_WEBHOOK_SECRET;
  if (secret) {
    const auth = c.req.header("Authorization");
    if (auth !== `Bearer ${secret}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }

  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      return c.json({ error: "not onboarded" }, 503);
    }
    const payload = (await c.req.json()) as InboundEmailWebhookPayload;
    const batch = await ingestEmailWebhook(db, createDocumentAdapter(), payload);
    return c.json({
      ok: true,
      messagesProcessed: batch.messagesProcessed,
      billsCreated: batch.billsCreated,
      eventIds: batch.results.map((r) => r.event.id),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingest failed";
    return c.json({ error: msg }, 400);
  } finally {
    db.close();
  }
});

/**
 * BL-8: Mailgun inbound (multipart form). Signing key required — unsigned
 * posts never enter the pipeline. Generic JSON stays at POST /api/ingest/email.
 */
app.post("/api/ingest/mailgun", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      return c.json({ error: "not onboarded" }, 503);
    }
    const parsed = await c.req.parseBody();
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") body[key] = value;
    }
    const batch = await ingestMailgunWebhook(db, createDocumentAdapter(), body);
    return c.json({
      ok: true,
      messagesProcessed: batch.messagesProcessed,
      billsCreated: batch.billsCreated,
      eventIds: batch.results.map((r) => r.event.id),
    });
  } catch (e) {
    if (e instanceof MailgunWebhookError) {
      return c.json({ error: e.message }, e.statusCode);
    }
    const msg = e instanceof Error ? e.message : "ingest failed";
    return c.json({ error: msg }, 400);
  } finally {
    db.close();
  }
});

/**
 * ADR-013 P2: ACH Transfer events. Bearer ATTACHE_ACH_WEBHOOK_SECRET.
 * Same settle path as `attache ach sync` when status is posted.
 */
app.post("/api/ach/webhook", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) {
      return c.json({ error: "not onboarded" }, 503);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const transfer = await handleAchWebhook(db, body, {
      authorizationHeader: c.req.header("authorization") ?? undefined,
    });
    return c.json({ ok: true, transfer, ...achWebhookStatus() });
  } catch (e) {
    if (e instanceof AchWebhookError) {
      return c.json({ error: e.message }, e.statusCode);
    }
    const msg = e instanceof Error ? e.message : "ach webhook failed";
    return c.json({ error: msg }, 400);
  } finally {
    db.close();
  }
});

app.get("/app/ingest/review/:id", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const review = getBillReview(db, c.req.param("id"));
    if (!review) return c.redirect("/app/ingest?error=Review+not+found");
    const msg = c.req.query("msg");
    return c.html(
      billReviewPage(
        review.event.id,
        review.payload,
        review.event.confidence,
        review.event.source,
        msg ? String(msg) : undefined,
      ),
    );
  }),
);

app.post("/app/ingest/review/:id/confirm", async (c) => {
  const db = openDatabase();
  const eventId = c.req.param("id");
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const body = await c.req.parseBody();
    const get = (k: string) => {
      const v = body[k];
      if (Array.isArray(v)) return v[0];
      return v;
    };
    confirmBillIngest(db, eventId, {
      payee: String(get("payee") ?? ""),
      amountUsd: Number(get("amountUsd")),
      dueDate: String(get("dueDate") ?? ""),
      cadence: String(get("cadence") ?? "once") as "once" | "monthly" | "yearly",
      autopay: get("autopay") === "true" || get("autopay") === "on",
      notes: String(get("notes") ?? "") || undefined,
    });
    return c.redirect("/app/obligations?msg=Obligation+created+from+bill");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "confirm failed";
    return c.redirect(`/app/ingest/review/${eventId}?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.get("/app/notifications", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const msg = c.req.query("msg");
    return c.html(
      notificationsPage(
        listNotifications(db),
        isPushConfigured(),
        getVapidPublicKey(),
        msg ? String(msg) : undefined,
      ),
    );
  }),
);

app.post("/app/notifications/:id/read", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markNotificationRead(db, id);
    return c.redirect("/app/notifications");
  });
});

app.post("/app/notifications/read-all", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    markAllNotificationsRead(db);
    return c.redirect("/app/notifications?msg=All+marked+read");
  }),
);

app.get("/api/notifications", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const since = c.req.query("since");
    const unreadOnly = c.req.query("unread") === "true";
    const rows = listNotifications(db, {
      since: since ? String(since) : undefined,
      unreadOnly,
    });
    return c.json({ count: rows.length, notifications: rows });
  }),
);

app.post("/api/notifications/:id/read", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const n = markNotificationRead(db, id);
    if (!n) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, notification: n });
  });
});

app.get("/api/notifications/vapid-public-key", (c) => {
  const key = getVapidPublicKey();
  if (!key) return c.json({ configured: false }, 404);
  return c.json({ configured: true, publicKey: key });
});

app.post("/api/notifications/push-subscribe", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const body = (await c.req.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return c.json({ error: "invalid subscription" }, 400);
    }
    const sub = savePushSubscription(db, {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      userAgent: c.req.header("user-agent"),
    });
    return c.json({ ok: true, id: sub.id });
  } finally {
    db.close();
  }
});

/**
 * BL-6 companion API (docs/specs/android-notification-reader.md).
 * Local-first: no OAuth device flow in P0 — same trust as other /api routes.
 */
app.post("/devices/register", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const body = (await c.req.json()) as {
      fcm_token?: string;
      fcmToken?: string;
      platform?: string;
      label?: string;
    };
    const token = body.fcm_token ?? body.fcmToken;
    if (!token) return c.json({ error: "fcm_token is required" }, 400);
    try {
      const device = registerPushDevice(db, {
        fcmToken: token,
        platform: body.platform,
        label: body.label,
      });
      return c.json({ ok: true, device, fcm: fcmStatus(db) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "register failed";
      return c.json({ error: msg }, 400);
    }
  } finally {
    db.close();
  }
});

app.get("/devices", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    return c.json({
      ok: true,
      fcm: fcmStatus(db),
      devices: listPushDevices(db),
    });
  }),
);

app.delete("/devices/:id", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const device = unlinkPushDevice(db, c.req.param("id"));
    if (!device) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, device });
  }),
);

/** Spec alias for the companion — same payload as GET /api/notifications. */
app.get("/notifications", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const since = c.req.query("since");
    const unreadOnly = c.req.query("unread") === "true";
    const rows = listNotifications(db, {
      since: since ? String(since) : undefined,
      unreadOnly,
    });
    return c.json({ count: rows.length, notifications: rows });
  }),
);

app.post("/notifications/:id/read", (c) => {
  const id = c.req.param("id");
  return withDb((db) => {
    if (!isOnboarded(db)) return c.json({ error: "not onboarded" }, 503);
    const n = markNotificationRead(db, id);
    if (!n) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, notification: n });
  });
});

app.get("/pricing", (c) => c.html(pricingPage()));

app.get("/app/costs", (c) => {
  const scenario = c.req.query("scenario") as keyof typeof PRICING_SCENARIOS | undefined;
  const preset = scenario && PRICING_SCENARIOS[scenario];
  const values = preset
    ? {
        platformEnabled: preset.input.platformEnabled,
        plaidAccountCount: preset.input.plaidAccountCount,
        snaptradeUserCount: preset.input.snaptradeUserCount,
        cloudOcrPages: preset.input.cloudOcrPages,
      }
    : undefined;

  return c.html(
    layout(
      "Cost estimator",
      `<section><h1>Monthly cost estimator</h1><p>Adjust inputs — pass-through items are billed at vendor cost.</p>${costEstimatorForm(values)}</section>`,
    ),
  );
});

app.post("/api/costs/estimate", async (c) => {
  const values = await parseCostForm(c);
  const est = estimateMonthlyCost({
    ...values,
    cloudLlmTokensM: 0.5,
    r2StorageGb: 2,
  });
  return c.html(renderCostReceipt(est));
});

app.get("/api/costs/estimate.json", async (c) => {
  const values = await parseCostForm(c);
  const est = estimateMonthlyCost({
    ...values,
    cloudLlmTokensM: Number(c.req.query("cloudLlmTokensM") ?? 0.5),
    r2StorageGb: Number(c.req.query("r2StorageGb") ?? 2),
  });
  return c.json(est);
});

const port = Number(process.env.PORT ?? 8780);
if (process.env.ATTACHE_SERVER_AUTOSTART !== "0") {
  if (hasKeyfile() && !isDatabaseUnlocked()) {
    console.warn(
      "Attache: encrypted database is locked — open /vault/unlock or set ATTACHE_PASSPHRASE",
    );
  } else {
    console.log(`Attache → http://localhost:${port}`);
  }
  serve({ fetch: app.fetch, port });
}

export { app };
