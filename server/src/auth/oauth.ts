// ──────────────────────────────────────────────
// CreditBridge — OAuth Service
// ──────────────────────────────────────────────
//
// Manages OAuth authorization flows for provider connections.
// Uses in-memory storage for PKCE state/code_verifier (these are
// short-lived during the auth flow).
// Tokens are encrypted before storage in the oauth_tokens table.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import {
  generatePKCEVerifier,
  generatePKCEChallenge,
  generateState,
  encryptToken,
  decryptToken,
} from "./crypto.js";

// ── In-Memory PKCE State Store ──────────────

interface PkceSession {
  state: string;
  codeVerifier: string;
  consumerId: string;
  providerName: string;
  scopes: string[];
  createdAt: number;
}

const pkceSessions = new Map<string, PkceSession>();

// Clean up expired PKCE sessions every 10 minutes (TTL: 10 minutes)
const PKCE_TTL_MS = 10 * 60 * 1000;

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [key, session] of pkceSessions) {
    if (now - session.createdAt > PKCE_TTL_MS) {
      pkceSessions.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000).unref();

// ── Provider OAuth Configuration ─────────────

interface ProviderOAuthConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint?: string;
  defaultScopes: string[];
}

/**
 * Known provider OAuth configurations.
 * For providers without real OAuth (sandbox/mocked), we use synthetic endpoints.
 */
const PROVIDER_OAUTH_CONFIGS: Record<string, ProviderOAuthConfig> = {
  SmartCredit: {
    authorizationEndpoint: "https://auth.smartcredit.com/oauth/authorize",
    tokenEndpoint: "https://auth.smartcredit.com/oauth/token",
    revokeEndpoint: "https://auth.smartcredit.com/oauth/revoke",
    defaultScopes: ["credit_report", "credit_score", "identity"],
  },
  MyScoreIQ: {
    authorizationEndpoint: "https://auth.myscoreiq.com/oauth/authorize",
    tokenEndpoint: "https://auth.myscoreiq.com/oauth/token",
    defaultScopes: ["credit_report", "credit_score"],
  },
  IdentityIQ: {
    authorizationEndpoint: "https://auth.identityiq.com/oauth/authorize",
    tokenEndpoint: "https://auth.identityiq.com/oauth/token",
    defaultScopes: ["credit_report", "identity"],
  },
  Synthetic: {
    authorizationEndpoint: "https://auth.synthetic.local/oauth/authorize",
    tokenEndpoint: "https://auth.synthetic.local/oauth/token",
    defaultScopes: ["synthetic_data", "credit_report", "credit_score"],
  },
};

function getProviderConfig(providerName: string): ProviderOAuthConfig {
  const config = PROVIDER_OAUTH_CONFIGS[providerName];
  if (config) return config;
  // Default synthetic config for unknown providers
  return {
    authorizationEndpoint: `https://auth.${providerName.toLowerCase()}.local/oauth/authorize`,
    tokenEndpoint: `https://auth.${providerName.toLowerCase()}.local/oauth/token`,
    defaultScopes: ["credit_report"],
  };
}

// ── Callback URL ─────────────────────────────

function getCallbackUrl(providerName: string): string {
  const base = process.env.CALLBACK_BASE_URL || "http://localhost:3001";
  return `${base}/api/auth/callback?provider=${encodeURIComponent(providerName)}`;
}

// ── Public API ───────────────────────────────

/**
 * Build the authorization URL for a provider.
 *
 * For synthetic/mocked providers (SmartCredit sandbox, Synthetic, etc),
 * constructs a local mock auth URL that redirects to our callback with
 * a test authorization code.
 *
 * Returns the URL the consumer should be redirected to, plus the
 * state and code verifier for the callback to validate.
 */
export function buildAuthorizationUrl(
  providerName: string,
  consumerId: string,
  scopes?: string[]
): { url: string; state: string; codeVerifier: string } {
  const config = getProviderConfig(providerName);
  const codeVerifier = generatePKCEVerifier();
  const codeChallenge = generatePKCEChallenge(codeVerifier);
  const state = generateState();
  const finalScopes = scopes && scopes.length > 0 ? scopes : config.defaultScopes;

  // Store PKCE session for callback validation
  const sessionKey = `${consumerId}:${providerName}:${state}`;
  pkceSessions.set(sessionKey, {
    state,
    codeVerifier,
    consumerId,
    providerName,
    scopes: finalScopes,
    createdAt: Date.now(),
  });

  const callbackUrl = getCallbackUrl(providerName);
  const scopeParam = finalScopes.join(" ");

  // For synthetic/mocked providers, generate a mock auth URL
  // that the callback handler will process with a synthetic code exchange.
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "creditbridge");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", scopeParam);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  // Sandbox / synthetic mode: attach a flag so the callback handler knows
  // to use mock token exchange
  const isSynthetic =
    providerName === "Synthetic" ||
    process.env[`${providerName.toUpperCase().replace(/\s/g, "_")}_MODE`] === "sandbox" ||
    process.env.NODE_ENV !== "production";

  if (isSynthetic) {
    url.searchParams.set("synthetic", "1");
  }

  return { url: url.toString(), state, codeVerifier };
}

/**
 * Handle the OAuth callback after the provider redirects back.
 *
 * For synthetic/mock providers, generates mock tokens.
 * For production providers, this would exchange the code for real tokens.
 * Tokens are encrypted before storage.
 */
export async function handleCallback(
  db: Database,
  providerName: string,
  code: string,
  state: string
): Promise<{ accessToken: string; refreshToken?: string; scopes: string[] }> {
  // Find the PKCE session by scanning for matching state
  let session: PkceSession | undefined;
  for (const [, s] of pkceSessions) {
    if (s.state === state && s.providerName === providerName) {
      session = s;
      break;
    }
  }

  if (!session) {
    throw new Error("Invalid or expired state parameter. Authorization denied.");
  }

  // Clean up the session now that we've validated it
  const sessionKey = `${session.consumerId}:${session.providerName}:${session.state}`;
  pkceSessions.delete(sessionKey);

  // Determine if this is a synthetic/mock exchange
  const isSynthetic =
    providerName === "Synthetic" ||
    code.startsWith("mock_") ||
    process.env[`${providerName.toUpperCase().replace(/\s/g, "_")}_MODE`] === "sandbox" ||
    process.env.NODE_ENV !== "production";

  let accessToken: string;
  let refreshToken: string | undefined;

  if (isSynthetic) {
    // Generate mock tokens for sandbox/synthetic providers
    const mockId = `synth_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    accessToken = `mock_access_${mockId}`;
    refreshToken = `mock_refresh_${mockId}`;
  } else {
    // Production: exchange code for real tokens
    // NOTE: Real HTTP exchange to provider token endpoint would go here.
    // Currently, all providers are in sandbox/inactive mode.
    throw new Error(
      `Production token exchange for ${providerName} is not yet implemented. ` +
        "Provider must be approved and configured for production use."
    );
  }

  // Encrypt tokens before storage
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

  // Store in oauth_tokens table
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour

  db.run(
    `INSERT OR REPLACE INTO oauth_tokens
     (consumer_id, provider_name, access_token_encrypted, refresh_token_encrypted,
      token_scopes, authorization_timestamp, consent_version, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      session.consumerId,
      providerName,
      encryptedAccessToken,
      encryptedRefreshToken,
      JSON.stringify(session.scopes),
      now,
      "1.0",
      expiresAt,
    ]
  );

  return {
    accessToken,
    refreshToken,
    scopes: session.scopes,
  };
}

/**
 * Refresh an access token using the stored refresh token.
 * Decrypts the refresh token, exchanges it, stores the new access token.
 */
export async function refreshAccessToken(
  db: Database,
  consumerId: string,
  providerName: string
): Promise<string> {
  const row = db
    .prepare(
      `SELECT refresh_token_encrypted, status FROM oauth_tokens
       WHERE consumer_id = ? AND provider_name = ? AND status = 'active'`
    )
    .get(consumerId, providerName) as
    | { refresh_token_encrypted: string | null; status: string }
    | undefined;

  if (!row || !row.refresh_token_encrypted) {
    throw new Error(`No active refresh token found for ${providerName}`);
  }

  const refreshToken = decryptToken(row.refresh_token_encrypted);

  // For synthetic/mock, generate a new mock token
  const isSynthetic =
    providerName === "Synthetic" || refreshToken.startsWith("mock_refresh_");

  let newAccessToken: string;
  if (isSynthetic) {
    newAccessToken = `mock_access_synth_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  } else {
    // Production: call provider's token endpoint with refresh_token grant
    throw new Error(
      `Production token refresh for ${providerName} is not yet implemented.`
    );
  }

  // Update stored access token
  const encryptedAccessToken = encryptToken(newAccessToken);
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

  db.run(
    `UPDATE oauth_tokens
     SET access_token_encrypted = ?, expires_at = ?, updated_at = ?
     WHERE consumer_id = ? AND provider_name = ? AND status = 'active'`,
    [encryptedAccessToken, expiresAt, new Date().toISOString(), consumerId, providerName]
  );

  return newAccessToken;
}

/**
 * Revoke provider access — marks tokens as revoked and updates
 * the consumer_authorizations record.
 */
export async function revokeProviderAccess(
  db: Database,
  consumerId: string,
  providerName: string
): Promise<void> {
  const config = getProviderConfig(providerName);

  // If provider has a revoke endpoint and we're in production, call it
  if (config.revokeEndpoint && process.env.NODE_ENV === "production") {
    // Production: call provider's revoke endpoint with the access token
    // Not yet implemented for any provider.
  }

  // Update oauth_tokens status
  db.run(
    `UPDATE oauth_tokens
     SET status = 'revoked', updated_at = ?
     WHERE consumer_id = ? AND provider_name = ?`,
    [new Date().toISOString(), consumerId, providerName]
  );

  // Update consumer_authorizations status
  db.run(
    `UPDATE consumer_authorizations
     SET authorization_status = 'revoked', revocation_date = ?, updated_at = ?
     WHERE consumer_id = ? AND provider_name = ?`,
    [new Date().toISOString(), new Date().toISOString(), consumerId, providerName]
  );
}

/**
 * Disconnect a provider — revokes tokens, overwrites encrypted values,
 * and marks the connection as disconnected.
 */
export async function disconnectProvider(
  db: Database,
  consumerId: string,
  providerName: string
): Promise<void> {
  // Revoke first (updates statuses)
  await revokeProviderAccess(db, consumerId, providerName);

  // Overwrite encrypted token values with placeholder (security measure)
  const redacted = encryptToken("REDACTED_DISCONNECTED");
  db.run(
    `UPDATE oauth_tokens
     SET access_token_encrypted = ?,
         refresh_token_encrypted = ?,
         metadata_encrypted = NULL,
         updated_at = ?
     WHERE consumer_id = ? AND provider_name = ?`,
    [redacted, redacted, new Date().toISOString(), consumerId, providerName]
  );
}
