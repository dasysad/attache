/**
 * Plaid error taxonomy (v1 hardening slice 3).
 *
 * WHAT: typed, agent-friendly errors from Plaid API failures.
 * WHY: sync/connect surfaces need distinct handling for re-link vs retry vs support.
 */

/** Subset of Plaid error codes we handle explicitly. */
export type PlaidErrorCode =
  | "ITEM_LOGIN_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "INVALID_ACCESS_TOKEN"
  | "INSTITUTION_DOWN"
  | "INSTITUTION_NOT_RESPONDING"
  | "RATE_LIMIT_EXCEEDED"
  | "PRODUCT_NOT_READY"
  | "UNKNOWN";

export class PlaidError extends Error {
  readonly code: PlaidErrorCode;
  /** True when user/agent should re-run Link (update mode). */
  readonly needsRelink: boolean;
  /** True when a later retry may succeed without user action. */
  readonly retryable: boolean;

  constructor(code: PlaidErrorCode, message: string) {
    super(message);
    this.name = "PlaidError";
    this.code = code;
    this.needsRelink =
      code === "ITEM_LOGIN_REQUIRED" ||
      code === "INVALID_CREDENTIALS" ||
      code === "INVALID_ACCESS_TOKEN";
    this.retryable =
      code === "INSTITUTION_DOWN" ||
      code === "INSTITUTION_NOT_RESPONDING" ||
      code === "RATE_LIMIT_EXCEEDED" ||
      code === "PRODUCT_NOT_READY";
  }
}

/** Map Plaid SDK / HTTP errors into our taxonomy. */
export function mapPlaidApiError(err: unknown): PlaidError {
  const data = extractPlaidErrorBody(err);
  const rawCode = String(data?.error_code ?? "UNKNOWN");
  const message = String(data?.error_message ?? "Plaid request failed");
  const code = isKnownCode(rawCode) ? rawCode : "UNKNOWN";
  return new PlaidError(code, message);
}

function extractPlaidErrorBody(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  const response = (err as { response?: { data?: unknown } }).response;
  if (response?.data && typeof response.data === "object") {
    return response.data as Record<string, unknown>;
  }
  return null;
}

function isKnownCode(code: string): code is PlaidErrorCode {
  return (
    code === "ITEM_LOGIN_REQUIRED" ||
    code === "INVALID_CREDENTIALS" ||
    code === "INVALID_ACCESS_TOKEN" ||
    code === "INSTITUTION_DOWN" ||
    code === "INSTITUTION_NOT_RESPONDING" ||
    code === "RATE_LIMIT_EXCEEDED" ||
    code === "PRODUCT_NOT_READY" ||
    code === "UNKNOWN"
  );
}

/** Agent/human guidance for CLI and MCP surfaces. */
export function plaidErrorHelp(err: PlaidError): string {
  if (err.needsRelink) {
    return `${err.message} — run \`attache plaid link-token\` and complete Link update mode.`;
  }
  if (err.retryable) {
    return `${err.message} — transient Plaid error; retry sync later.`;
  }
  return err.message;
}
