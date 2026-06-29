/** Gmail API read-only + email for account identity (ADR-008). */
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GOOGLE_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

export const GMAIL_OAUTH_SCOPES = [GMAIL_READONLY_SCOPE, GOOGLE_EMAIL_SCOPE];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface GmailOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Operator OAuth app credentials — not user secrets. */
export function getGoogleOAuthConfig(
  redirectUri = process.env.GOOGLE_REDIRECT_URI ??
    "http://localhost:8780/app/ingest/gmail/callback",
): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}

export function buildGoogleAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed: ${res.status} ${detail}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("failed to fetch Google user profile");
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("Google profile missing email");
  return data.email;
}

export function tokensFromGoogleResponse(
  data: GoogleTokenResponse,
  existingRefresh?: string,
): GmailOAuthTokens {
  const refreshToken = data.refresh_token ?? existingRefresh;
  if (!refreshToken) {
    throw new Error("no refresh token — revoke app access and reconnect with consent");
  }
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  };
}

export function serializeVaultTokens(tokens: GmailOAuthTokens): string {
  return JSON.stringify(tokens);
}

export function parseVaultTokens(raw: string): GmailOAuthTokens {
  return JSON.parse(raw) as GmailOAuthTokens;
}
