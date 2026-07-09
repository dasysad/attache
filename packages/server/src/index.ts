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
  updateManualAccount,
  updateObligation,
} from "@attache/core";
import {
  accountsPage,
  appHomePage,
  billReviewPage,
  costEstimatorForm,
  ingestPage,
  layout,
  notificationsPage,
  obligationsPage,
  onboardAccountPage,
  onboardObligationPage,
  onboardPage,
  parseCostForm,
  plaidPage,
  pricingPage,
  renderCostReceipt,
  setNavUnreadCount,
  setTransferPendingCount,
  transfersPage,
  vaultUnlockPage,
} from "./views.js";
import { syncNotificationsSync } from "./notify-sync.js";
import { resolvePublicRoot } from "./paths.js";
import { getVapidPublicKey, isPushConfigured } from "./push.js";

const app = new Hono();

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

function obligationsWithStatus(db: ReturnType<typeof openDatabase>) {
  return listObligations(db).map((o) => ({
    ...o,
    status: obligationDisplayStatus(o),
  }));
}

/** Redirect incomplete setup wizard unless path is allowed. */
function maybeSetupRedirect(
  db: ReturnType<typeof openDatabase>,
  allowPaths: string[],
  currentPath: string,
): Response | null {
  const next = setupWizardPath(db);
  if (next && !allowPaths.includes(currentPath)) {
    return new Response(null, {
      status: 302,
      headers: { Location: next },
    });
  }
  return null;
}

app.get("/", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const redirect = maybeSetupRedirect(db, [], "/");
    if (redirect) return redirect;
    const tenant = getTenant(db)!;
    const accounts = listAccounts(db);
    const obligations = listObligations(db);
    const forecast = computeSolvencyForecast(accounts, obligations);
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
      return c.redirect("/onboard/account");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create household";
      return c.html(onboardPage(msg), 400);
    }
  });
});

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
      return c.redirect("/onboard/obligation");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not add account";
      return c.html(onboardAccountPage(msg), 400);
    }
  });
});

app.get("/onboard/obligation", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    if (listAccounts(db).length === 0) return c.redirect("/onboard/account");
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
    const redirect = maybeSetupRedirect(db, ["/onboard/account"], "/app/accounts");
    if (redirect) return redirect;
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
        kind: kind as "checking" | "savings" | "cash",
        balanceUsd,
      });
      if (setupWizardPath(db) === "/onboard/obligation") {
        return c.redirect("/onboard/obligation");
      }
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
        kind: String(body.kind ?? "checking") as "checking" | "savings" | "cash",
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
    const redirect = maybeSetupRedirect(
      db,
      ["/onboard/account", "/onboard/obligation"],
      "/app/obligations",
    );
    if (redirect) return redirect;
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
  return withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    try {
      const result = approveTransferProposal(db, id, note);
      const msg =
        result.status === "executed"
          ? "Transfer+executed+on+manual+accounts"
          : "Transfer+approved+(Plaid+legs+unchanged)";
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

app.get("/app/plaid", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const redirect = maybeSetupRedirect(db, ["/onboard/account", "/onboard/obligation"], "/app/plaid");
    if (redirect) return redirect;
    const msg = c.req.query("msg");
    const err = c.req.query("error");
    return c.html(
      plaidPage(
        listPlaidItems(db),
        countPlaidLinkedAccounts(db),
        msg ? String(msg) : undefined,
        err ? String(err) : undefined,
        isPlaidConfigured(),
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
      `/app/plaid?msg=${encodeURIComponent(`Connected — ${sync.transactionsNew} transactions imported`)}`,
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
      `/app/plaid?msg=${encodeURIComponent(`Connected — ${sync.transactionsNew} transactions imported`)}`,
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
    const newTx = results.reduce((s, r) => s + r.transactionsNew, 0);
    return c.redirect(
      `/app/plaid?msg=${encodeURIComponent(`Sync complete — ${newTx} new transactions`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync failed";
    return c.redirect(`/app/plaid?error=${encodeURIComponent(msg)}`);
  } finally {
    db.close();
  }
});

app.get("/app/ingest", (c) =>
  withDb((db) => {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const redirect = maybeSetupRedirect(
      db,
      ["/onboard/account", "/onboard/obligation"],
      "/app/ingest",
    );
    if (redirect) return redirect;
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

app.post("/app/ingest/poll-gmail", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const batch = await pollGmailIngest(db, getVault(), createDocumentAdapter());
    if (!batch.billsCreated) {
      return c.redirect(
        `/app/ingest?error=${encodeURIComponent(`No new Gmail bills (${batch.accountsPolled} account(s))`)}`,
      );
    }
    const first = batch.results[0]!;
    return c.redirect(
      `/app/ingest/review/${first.event.id}?msg=${encodeURIComponent(`Gmail: ${batch.billsCreated} bill(s)`)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gmail poll failed";
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

app.post("/app/ingest/poll-imap", async (c) => {
  const db = openDatabase();
  try {
    if (!isOnboarded(db)) return c.redirect("/onboard");
    const batch = await pollImapIngest(db, getVault(), createDocumentAdapter());
    if (!batch.billsCreated) {
      return c.redirect(
        `/app/ingest?error=${encodeURIComponent(`No new bills (${batch.accountsPolled} account(s) polled)`)}`,
      );
    }
    const first = batch.results[0]!;
    return c.redirect(
      `/app/ingest/review/${first.event.id}?msg=${encodeURIComponent(`IMAP: ${batch.billsCreated} bill(s) imported`)}`,
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
