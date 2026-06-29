/** @attache/core — local-first household finance domain logic. */
export { openDatabase, defaultDataDir, defaultVaultDir, defaultDocumentsDir, defaultInboxDir } from "./db.js";
export {
  getOrCreateSiteId,
  registerPeer,
  touchPeer,
  bootstrapSiteId,
  type PeerRecord,
} from "./peer.js";
export {
  createTenant,
  getTenant,
  isOnboarded,
  bootstrapTenantCheck,
  type Tenant,
  type Member,
  type TenantScope,
  type BillingPlan,
} from "./tenant.js";
export {
  estimateMonthlyCost,
  CostEstimateInputSchema,
  PASS_THROUGH_RATES,
  PLATFORM_PRICING,
  PRICING_SCENARIOS,
  type CostEstimate,
  type CostEstimateInput,
  type CostLineItem,
} from "./pricing.js";
export {
  createAccount,
  listAccounts,
  getAccount,
  updateManualAccount,
  deleteManualAccount,
  sumLiquidBalanceUsd,
  findAccountByPlaidId,
  upsertPlaidFundingAccount,
} from "./account.js";
export {
  createObligation,
  createObligationFromIngest,
  listObligations,
  getObligation,
  updateObligation,
  deleteObligation,
  markObligationPaid,
  obligationDisplayStatus,
} from "./obligation.js";
export {
  computeSolvencyForecast,
  expandObligation,
} from "./forecast.js";
export {
  isSetupComplete,
  markSetupComplete,
  setupWizardPath,
} from "./setup.js";
export {
  getVault,
  LocalVaultPort,
  setVaultForTests,
  type VaultPort,
} from "./vault/local-vault.js";
export { FakePlaidAdapter, createPlaidAdapter } from "./ingest/fake-plaid-adapter.js";
export type { PlaidIngestPort, PlaidSyncSnapshot, PlaidLinkedAccount } from "./ingest/plaid-port.js";
export {
  connectSandboxPlaid,
  syncAllPlaidItems,
  syncPlaidItem,
  accountLabelForTransaction,
  type SyncResult,
} from "./plaid/sync.js";
export {
  listPlaidItems,
  listRecentTransactions,
  countPlaidLinkedAccounts,
} from "./plaid/store.js";
export {
  FakeDocumentAdapter,
  createDocumentAdapter,
  parseTextBill,
} from "./ingest/fake-document-adapter.js";
export { RemoteDocumentAdapter, ResilientDocumentAdapter } from "./ingest/remote-document-adapter.js";
export type {
  DocumentExtractionPort,
  BillExtraction,
  DocumentExtractionInput,
} from "./ingest/document-port.js";
export { FakeEmailAdapter, createEmailAdapter, type EmailAdapterMode } from "./ingest/fake-email-adapter.js";
export { MaildropEmailAdapter, dropEmlIntoInbox } from "./ingest/maildrop-email-adapter.js";
export { parseEml } from "./ingest/eml.js";
export {
  ingestEmailWebhook,
  webhookToInboundMessage,
  assertWebhookIngestToken,
  type InboundEmailWebhookPayload,
} from "./ingest/email-webhook.js";
export type { EmailIngestPort, InboundEmailMessage } from "./ingest/email-port.js";
export {
  ingestDocumentBytes,
  ingestEmailBatch,
  ingestEmailMessages,
  listPendingBillReviews,
  getBillReview,
  confirmBillIngest,
  HITL_CONFIDENCE_THRESHOLD,
  type BillIngestResult,
  type EmailIngestResult,
} from "./ingest/bill.js";
export {
  getOrCreateIngestToken,
  ingestEmailAddress,
  parseIngestTokenFromAddress,
  inboxDirForToken,
} from "./ingest/token.js";
export { getDocumentArtifact, storeDocumentArtifact } from "./documents/store.js";
export {
  connectImapAccount,
  listImapAccounts,
  getImapAccount,
  imapVaultRef,
} from "./imap/store.js";
export { FakeImapAdapter, createImapAdapter } from "./imap/fake-adapter.js";
export { LiveImapAdapter } from "./imap/live-adapter.js";
export type { ImapIngestPort, ImapFetchResult, ImapFetchedMessage } from "./imap/port.js";
export { pollImapIngest, type ImapPollResult } from "./imap/sync.js";
export { isLikelyBillEmail } from "./imap/filter.js";
export {
  buildGoogleAuthUrl,
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured,
  GMAIL_READONLY_SCOPE,
} from "./gmail/oauth.js";
export {
  connectGmailAccount,
  connectGmailFromAuthCode,
  connectSandboxGmail,
  createGmailOAuthState,
  consumeGmailOAuthState,
  listGmailAccounts,
  getGmailAccount,
  gmailVaultRef,
} from "./gmail/store.js";
export { FakeGmailAdapter, createGmailAdapter } from "./gmail/fake-adapter.js";
export { LiveGmailAdapter } from "./gmail/live-adapter.js";
export type { GmailIngestPort, GmailFetchResult, GmailFetchedMessage } from "./gmail/port.js";
export { pollGmailIngest, type GmailPollResult } from "./gmail/sync.js";
export {
  connectGmailViaLoopback,
  findLoopbackPort,
  gmailLoopbackRedirectUri,
  DEFAULT_GMAIL_LOOPBACK_PORT,
  GMAIL_LOOPBACK_CALLBACK_PATH,
  type GmailLoopbackConnectOptions,
  type GmailLoopbackConnectResult,
} from "./gmail/loopback-connect.js";
export { getRunwaySnapshot, type RunwaySnapshot } from "./agent/runway.js";
export {
  listObligationsForAgent,
  type AgentObligationRow,
  type ObligationFilter,
} from "./agent/obligations.js";
export {
  proposeTransfer,
  type TransferProposalInput,
  type TransferProposalResult,
} from "./agent/transfer.js";
export {
  createTransferProposal,
  getTransferProposal,
  listTransferProposals,
  countPendingTransferProposals,
  approveTransferProposal,
  rejectTransferProposal,
} from "./agent/transfer-queue.js";
export type {
  TransferProposalRecord,
  TransferProposalStatus,
  TransferProposedBy,
  CreateTransferProposalInput,
  ListTransferProposalsOptions,
} from "./agent/transfer-types.js";
export {
  refreshNotifications,
  type RefreshNotificationsResult,
} from "./notify/evaluate.js";
export {
  upsertNotification,
  getNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  appendChannelDelivered,
  savePushSubscription,
  listPushSubscriptions,
} from "./notify/store.js";
export type {
  Notification,
  NotificationSeverity,
  NotificationKind,
  ListNotificationsOptions,
  UpsertNotificationInput,
  PushSubscriptionRecord,
  PushSubscriptionInput,
} from "./notify/types.js";
export type {
  Provenance,
  FundingAccount,
  FundingAccountKind,
  AccountSyncStatus,
  Obligation,
  ObligationCadence,
  ObligationDisplayStatus,
  ObligationOccurrence,
  ForecastDay,
  SolvencyForecast,
  IngestSource,
  IngestKind,
  IngestedEvent,
  BankTransaction,
  PlaidItem,
  PlaidTransactionPayload,
  PlaidBalancePayload,
  BillExtractPayload,
  DocumentArtifact,
  ImapAccount,
  GmailAccount,
} from "./domain.js";
