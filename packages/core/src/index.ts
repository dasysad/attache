/** @attache/core — local-first household finance domain logic. */
export { openDatabase, defaultDataDir, defaultVaultDir, defaultDocumentsDir, defaultInboxDir } from "./db.js";
export {
  createKeyfile,
  readKeyfile,
  writeKeyfile,
  hasKeyfile,
  keyfilePath,
  unwrapDek,
  rewrapDek,
  deriveKek,
  DEFAULT_SCRYPT_PARAMS,
  WrongPassphraseError,
  KeyfileError,
  type Keyfile,
  type ScryptParams,
} from "./crypto/keyring.js";
export {
  resolveKey,
  resolveKeyForDir,
  setSessionDek,
  clearSessionDek,
  DatabaseLockedError,
  type KeySource,
  type ResolvedKey,
  type ResolveKeyOptions,
} from "./crypto/key-provider.js";
export {
  isDatabaseUnlocked,
  assertDatabaseUnlocked,
  unlockDatabaseWithPassphrase,
  databaseLockedHelp,
} from "./crypto/unlock.js";
export {
  encryptPlaintextDatabase,
  MigrationError,
  DB_FILENAME,
} from "./crypto/migrate.js";
export {
  encryptPlaintextSecrets,
  countSecretFiles,
  SecretMigrationError,
  type SecretMigrationResult,
} from "./vault/migrate-secrets.js";
export {
  isEncryptedSecretFile,
  sealSecretUtf8,
  openSecretUtf8,
  VaultSecretError,
} from "./crypto/secret-file.js";
export { vaultStatus, type VaultStatus } from "./crypto/status.js";
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
  parseFundingKind,
  isLiquidKind,
  isLiabilityKind,
  sumLiquidBalanceUsd,
  sumLiabilityUsd,
  findAccountByPlaidId,
  upsertPlaidFundingAccount,
  findAccountBySnapTradeId,
  upsertSnapTradeFundingAccount,
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
  computeNetWorth,
  type NetWorthSnapshot,
} from "./net-worth.js";
export {
  computeCashflow,
  computeCashflowTrend,
  defaultCashflowRange,
  priorCashflowRange,
  type CashflowBucket,
  type CashflowReport,
  type CashflowTrend,
  type CashflowDayPoint,
  type CashflowCategoryDelta,
} from "./cashflow.js";
export {
  isSetupComplete,
  markSetupComplete,
  isSetupDiscoverDone,
  markSetupDiscoverDone,
  isSetupConnectHintsDone,
  markSetupConnectHintsDone,
  maybeMarkSetupComplete,
  setupWizardPath,
  setupAllowedAppPaths,
  setupOnboardNextHint,
  setupWizardStepNumber,
  SETUP_WIZARD_TOTAL,
  SETUP_WIZARD_LABELS,
} from "./setup.js";
export {
  getSetupCoverage,
  listSetupGaps,
  type SetupCoverage,
  type SetupCoverageItem,
  type SetupCoverageId,
} from "./setup-coverage.js";
export {
  listMembers,
  getMember,
  addMember,
  removeMember,
  parseMemberKind,
  type HouseholdMember,
  type MemberKind,
  type MemberAuthLevel,
} from "./member.js";
export {
  listIncomeStreams,
  getIncomeStream,
  createIncomeStream,
  deleteIncomeStream,
  expandIncomeStream,
  sumIncomeInRange,
  type IncomeStream,
  type IncomeCadence,
  type IncomeOccurrence,
} from "./income-stream.js";
export {
  listStatementEvents,
  getStatementRegister,
  type StatementListItem,
  type StatementRegister,
} from "./statements.js";
export {
  getVault,
  LocalVaultPort,
  setVaultForTests,
  type VaultPort,
} from "./vault/local-vault.js";
export { FakePlaidAdapter } from "./ingest/fake-plaid-adapter.js";
export { LivePlaidAdapter } from "./ingest/live-plaid-adapter.js";
export { createPlaidAdapter, isPlaidConfigured } from "./plaid/create-adapter.js";
export type { PlaidIngestPort, PlaidSyncSnapshot, PlaidLinkedAccount } from "./ingest/plaid-port.js";
export {
  PlaidError,
  mapPlaidApiError,
  plaidErrorHelp,
  type PlaidErrorCode,
} from "./plaid/errors.js";
export { loadPlaidConfig, type PlaidConfig } from "./plaid/config.js";
export {
  connectSandboxPlaid,
  connectLivePlaid,
  createPlaidLinkToken,
  syncAllPlaidItems,
  syncPlaidItem,
  accountLabelForTransaction,
  type SyncResult,
} from "./plaid/sync.js";
export {
  connectPlaidViaLoopback,
  plaidLoopbackRedirectUri,
  PLAID_LOOPBACK_CALLBACK_PATH,
  DEFAULT_PLAID_LOOPBACK_PORT,
} from "./plaid/loopback-connect.js";
export { plaidHostedLinkUrl } from "./net/loopback.js";
export {
  listPlaidItems,
  listRecentTransactions,
  listTransactions,
  getBankTransaction,
  setTransactionCategory,
  countPlaidLinkedAccounts,
  listAccountsForPlaidItem,
  type ListTransactionsFilter,
} from "./plaid/store.js";
export { unlinkPlaidItem, type UnlinkPlaidResult } from "./plaid/unlink.js";
export {
  mapPlaidAccountKind,
  fundingKindFromPlaid,
} from "./plaid/kind-map.js";
export type {
  SnapTradeIngestPort,
  SnapTradeSyncSnapshot,
  SnapTradeLinkedAccount,
  SnapTradePosition,
} from "./snaptrade/port.js";
export { FakeSnapTradeAdapter } from "./snaptrade/fake-adapter.js";
export { LiveSnapTradeAdapter } from "./snaptrade/live-adapter.js";
export {
  createSnapTradeAdapter,
  isSnapTradeConfigured,
} from "./snaptrade/create-adapter.js";
export { loadSnapTradeConfig, type SnapTradeConfig } from "./snaptrade/config.js";
export { listActivity, type ActivityFilter, type ActivityRow } from "./activity.js";
export {
  listSnapTradeConnections,
  getSnapTradeConnection,
  countSnapTradeLinkedAccounts,
  createSnapTradeConnection,
  snaptradeVaultRef,
  listSnapTradePositions,
  replaceSnapTradePositions,
  type StoredSnapTradePosition,
} from "./snaptrade/store.js";
export {
  connectSandboxSnapTrade,
  connectLiveSnapTrade,
  syncAllSnapTradeConnections,
  syncSnapTradeConnection,
  type SnapTradeSyncResult,
} from "./snaptrade/sync.js";
export {
  unlinkSnapTradeConnection,
  type UnlinkSnapTradeResult,
} from "./snaptrade/unlink.js";
export {
  FakeDocumentAdapter,
  createDocumentAdapter,
  parseTextBill,
  parseTextDocument,
} from "./ingest/fake-document-adapter.js";
export { RemoteDocumentAdapter, ResilientDocumentAdapter } from "./ingest/remote-document-adapter.js";
export {
  runBillExtractionEval,
  loadEvalManifest,
  defaultEvalManifestPath,
  type EvalReport,
  type EvalCaseResult,
  type FieldScore,
} from "./eval/bill-extraction.js";
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
export {
  ingestMailgunWebhook,
  verifyMailgunSignature,
  mailgunFormToPayload,
  signMailgunWebhook,
  mailgunSigningKeyFromEnv,
  isMailgunIngressConfigured,
  MailgunWebhookError,
} from "./ingest/mailgun.js";
export {
  hostedIngressStatus,
  HOSTED_INGRESS_HONESTY,
  type HostedIngressStatus,
} from "./ingest/ingress-status.js";
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
  discoverMailCandidates,
  listDiscoverCandidates,
  listUnsatisfiedConnectHints,
  countUnconfirmedAssetHints,
  formatDiscoverMessage,
  discoverNextCommands,
  unsatisfiedConnectHints,
  clampDiscoverBounds,
  DiscoverError,
  DISCOVER_DEFAULT_LOOKBACK_DAYS,
  DISCOVER_DEFAULT_LIMIT,
  DISCOVER_MAX_LOOKBACK_DAYS,
  DISCOVER_MAX_LIMIT,
  type DiscoverAction,
  type DiscoverCandidate,
  type DiscoverCandidateKind,
  type DiscoverOptions,
  type DiscoverResult,
  type DiscoverNextCommand,
  type LinkedInstitutions,
} from "./ingest/discover.js";
export {
  inferAssetHint,
  parseHouseholdAssetKind,
  HOUSEHOLD_ASSET_KINDS,
  type AssetHint,
  type HouseholdAssetKind,
} from "./ingest/asset-hint.js";
export {
  listHouseholdAssets,
  createHouseholdAsset,
  confirmAssetHint,
  deleteHouseholdAsset,
  getHouseholdAssetByEventId,
  type HouseholdAsset,
} from "./household-asset.js";
export {
  listHouseholdEntities,
  type HouseholdEntity,
  type HouseholdEntityKind,
} from "./household-entity.js";
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
  markImapAccountError,
  clearImapAccountError,
  unlinkImapAccount,
  type UnlinkImapResult,
} from "./imap/store.js";
export { FakeImapAdapter, createImapAdapter } from "./imap/fake-adapter.js";
export { LiveImapAdapter } from "./imap/live-adapter.js";
export type { ImapIngestPort, ImapFetchResult, ImapFetchedMessage } from "./imap/port.js";
export { pollImapIngest, type ImapPollResult } from "./imap/sync.js";
export type { MailAccountPollOutcome } from "./gmail/sync.js";
export { isLikelyBillEmail, isLikelyMarketingEmail } from "./imap/filter.js";
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
  markGmailAccountError,
  clearGmailAccountError,
  clearGmailHistoryId,
  unlinkGmailAccount,
  type UnlinkGmailResult,
} from "./gmail/store.js";
export { FakeGmailAdapter, createGmailAdapter } from "./gmail/fake-adapter.js";
export { LiveGmailAdapter } from "./gmail/live-adapter.js";
export type { GmailIngestPort, GmailFetchResult, GmailFetchedMessage, GmailFetchOptions } from "./gmail/port.js";
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
  ACCOUNT_KIND_LABEL,
  ACCOUNT_KIND_ORDER,
  buildAttention,
  collectAttention,
  commandCenterTotals,
  groupAccountsByKind,
  sumBrokerageUsd,
  type AccountKindGroup,
  type AttentionInput,
  type AttentionItem,
  type AttentionSeverity,
  type CommandCenterTotals,
} from "./command-center.js";
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
export {
  createTransferRule,
  getTransferRule,
  listTransferRules,
  disableTransferRule,
  listTransferRuleRuns,
  transferRulePeriodKey,
  transferRuleIdempotencyKey,
} from "./agent/transfer-rule-store.js";
export {
  evaluateTransferRules,
  type EvaluateTransferRulesOptions,
  type EvaluateTransferRulesResult,
} from "./agent/transfer-rules.js";
export {
  assertValidWhenCel,
  evaluateWhenCel,
  TransferRuleCelError,
  type TransferRuleCelSnapshot,
} from "./agent/transfer-rule-cel.js";
export {
  installTransferRulesSchedule,
  uninstallTransferRulesSchedule,
  transferRulesScheduleStatus,
  transferRulesEvaluateCommand,
  transferRulesCronLine,
  buildLaunchdPlist,
  TRANSFER_RULES_LAUNCHD_LABEL,
  type TransferRulesScheduleStatus,
} from "./agent/transfer-rule-schedule.js";
export type {
  TransferRule,
  TransferRuleTrigger,
  TransferRuleAction,
  TransferRulePolicy,
  TransferRuleAutonomy,
  TransferRuleRun,
  TransferRuleRunOutcome,
  CreateTransferRuleInput,
} from "./agent/transfer-rule-types.js";
export {
  transferHonesty,
  transferHonestyWarning,
  transferApprovalMessage,
  TRANSFER_HONESTY,
  type TransferHonesty,
  type TransferExecutionMode,
} from "./agent/transfer-honesty.js";
export type {
  TransferProposalRecord,
  TransferProposalStatus,
  TransferProposedBy,
  CreateTransferProposalInput,
  ListTransferProposalsOptions,
} from "./agent/transfer-types.js";
export type { LedgerPort } from "./ledger/port.js";
export {
  SqliteLedgerAdapter,
} from "./ledger/sqlite-adapter.js";
export {
  getLedger,
  setLedgerForTests,
  createLedgerFromEnv,
} from "./ledger/factory.js";
export { TigerBeetleLedgerAdapter } from "./ledger/tb-adapter.js";
export { FakeTigerBeetleClient } from "./ledger/fake-client.js";
export {
  ledgerBackendFromEnv,
  tigerbeetleConfigFromEnv,
  type LedgerBackend,
} from "./ledger/config.js";
export { ledgerStatus, type LedgerStatus } from "./ledger/status.js";
export {
  achBackendFromEnv,
  isAchEnabled,
  type AchBackend,
} from "./ach/config.js";
export { getAch, setAchForTests, createAchAdapter } from "./ach/create-adapter.js";
export { FakeAchAdapter } from "./ach/fake-adapter.js";
export { LivePlaidAchAdapter } from "./ach/live-adapter.js";
export { achStatus, type AchStatus } from "./ach/status.js";
export {
  submitAch,
  simulateAchPosted,
  syncAchTransfers,
  settleAchToLedgerForProposal,
  markProposalAchFailed,
} from "./ach/submit.js";
export {
  getAchTransferByProposal,
  getAchTransferByDebitId,
  listAchTransfers,
  type AchTransferRecord,
} from "./ach/store.js";
export {
  handleAchWebhook,
  achWebhookStatus,
  isAchWebhookConfigured,
  AchWebhookError,
  type AchWebhookPayload,
} from "./ach/webhook.js";
export type { AchPort, AchRailTransfer } from "./ach/port.js";
export {
  InsufficientFundsError,
  LedgerInvariantError,
} from "./ledger/errors.js";
export {
  usdToMinor,
  minorToUsd,
  type LedgerAccount,
  type LedgerTransfer,
  type LedgerEntry,
  type PostTransferInput,
  type PostTransferResult,
  type LedgerHistoryEntry,
} from "./ledger/types.js";
export { syncFundingBalanceProjection } from "./ledger/projection.js";
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
export {
  registerPushDevice,
  listPushDevices,
  getPushDevice,
  unlinkPushDevice,
  parsePushDevicePlatform,
  type PushDevice,
  type PushDevicePlatform,
  type RegisterPushDeviceInput,
} from "./notify/device.js";
export { fcmBackendFromEnv, isFcmEnabled, type FcmBackend } from "./fcm/config.js";
export { getFcm, setFcmForTests, createFcmAdapter } from "./fcm/create-adapter.js";
export { FakeFcmAdapter } from "./fcm/fake-adapter.js";
export { LiveFcmAdapter } from "./fcm/live-adapter.js";
export { fcmStatus, type FcmStatus } from "./fcm/status.js";
export { deliverFcmForNotification } from "./fcm/deliver.js";
export type { FcmPort, FcmPayload, FcmSendResult, FcmMode } from "./fcm/port.js";
export { listHighValueTargets, type HighValueTarget, type HighValueKind } from "./credentials/targets.js";
export { checkCredentialHygiene, type CredentialHygieneResult, type CredentialBreachHit } from "./credentials/check.js";
export { credentialAssist, generateSuggestedPassword, resolveAssistTarget, CREDENTIAL_ASSIST_HONESTY, type CredentialAssistInput, type CredentialAssistResult } from "./credentials/assist.js";
export { changePasswordUrlForEmail, changePasswordUrlForName } from "./credentials/change-password-url.js";
export { getHibp, setHibpForTests, createHibpAdapter, hibpApiKeyFromEnv } from "./credentials/create-adapter.js";
export { FakeHibpAdapter, SANDBOX_HIBP_EMAIL } from "./credentials/fake-adapter.js";
export { LiveHibpAdapter } from "./credentials/live-adapter.js";
export type { HibpPort, HibpBreach, HibpMode } from "./credentials/hibp-port.js";
export type {
  Notification,
  NotificationSeverity,
  NotificationKind,
  ListNotificationsOptions,
  UpsertNotificationInput,
  PushSubscriptionRecord,
  PushSubscriptionInput,
} from "./notify/types.js";
export {
  LIQUID_ACCOUNT_KINDS,
  LIABILITY_ACCOUNT_KINDS,
  FUNDING_ACCOUNT_KINDS,
} from "./domain.js";
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
  SnapTradeConnection,
} from "./domain.js";
