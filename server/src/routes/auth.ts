// ──────────────────────────────────────────────
// CreditBridge — Consumer Authorization Routes
// ──────────────────────────────────────────────
//
// POST /api/auth/authorize    — initiate OAuth authorization
// GET  /api/auth/callback     — OAuth callback endpoint
// POST /api/auth/disconnect   — disconnect a provider
// GET  /api/auth/status/:id/:provider — current auth status
// ──────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { getDb } from "../db/connection.js";
import {
  buildAuthorizationUrl,
  handleCallback,
  disconnectProvider,
} from "../auth/oauth.js";
import { decryptToken } from "../auth/crypto.js";

const router = Router();

// ── POST /api/auth/authorize ─────────────────

/**
 * Initiate OAuth authorization for a consumer to connect a provider.
 *
 * Body: { providerName, consumerId, scopes? }
 * Returns: { redirectUrl, state }
 *
 * Creates a consumer_authorizations record with status='pending'.
 */
router.post("/authorize", (req: Request, res: Response) => {
  try {
    const { providerName, consumerId, scopes } = req.body as {
      providerName: string;
      consumerId: string;
      scopes?: string[];
    };

    if (!providerName || !consumerId) {
      res.status(400).json({
        error: "providerName and consumerId are required",
      });
      return;
    }

    const db = getDb();

    // Create a pending consumer_authorizations record
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO consumer_authorizations
       (consumer_id, provider_name, scope_authorized, consent_text_version,
        consent_timestamp, authorization_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        consumerId,
        providerName,
        JSON.stringify(scopes || []),
        "1.0",
        now,
        now,
        now,
      ]
    );

    // Build the OAuth authorization URL
    const { url, state } = buildAuthorizationUrl(
      providerName,
      consumerId,
      scopes
    );

    res.json({ redirectUrl: url, state });
  } catch (err) {
    console.error("[auth] authorize error:", (err as Error).message);
    res.status(500).json({
      error: "Failed to initiate authorization",
      detail: (err as Error).message,
    });
  }
});

// ── GET /api/auth/callback ───────────────────

/**
 * OAuth callback endpoint — the provider redirects here after the
 * consumer authorizes access.
 *
 * Query: ?code=xxx&state=yyy&provider=SmartCredit
 *
 * Validates state, exchanges code for tokens, stores encrypted tokens,
 * updates consumer_authorizations to 'active'.
 */
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const { code, state, provider } = req.query as {
      code?: string;
      state?: string;
      provider?: string;
    };

    if (!code || !state || !provider) {
      res.status(400).json({
        error: "Missing required parameters: code, state, and provider are required",
      });
      return;
    }

    const db = getDb();

    // Exchange code for tokens (or generate mock tokens for sandbox providers)
    const result = await handleCallback(db, provider, code, state);

    // Find the pending consumer_authorizations record for this provider
    // (we need to find the consumer_id from the PKCE session, which happened
    // inside handleCallback — let's use a query to find the pending auth)
    const pendingAuth = db
      .prepare(
        `SELECT consumer_id FROM consumer_authorizations
         WHERE provider_name = ? AND authorization_status = 'pending'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(provider) as { consumer_id: string } | undefined;

    if (pendingAuth) {
      const now = new Date().toISOString();
      const deviceInfo = req.headers["user-agent"] || null;
      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        null;

      db.run(
        `UPDATE consumer_authorizations
         SET authorization_status = 'active',
             consent_timestamp = ?,
             ip_address = ?,
             device_info = ?,
             scope_authorized = ?,
             updated_at = ?
         WHERE consumer_id = ? AND provider_name = ? AND authorization_status = 'pending'`,
        [
          now,
          ipAddress,
          deviceInfo,
          JSON.stringify(result.scopes),
          now,
          pendingAuth.consumer_id,
          provider,
        ]
      );
    }

    // Return success — do NOT include tokens in the response
    res.json({
      success: true,
      provider,
      scopes: result.scopes,
    });
  } catch (err) {
    console.error("[auth] callback error:", (err as Error).message);
    res.status(400).json({
      error: "Authorization failed",
      detail: (err as Error).message,
    });
  }
});

// ── POST /api/auth/disconnect ────────────────

/**
 * Disconnect a consumer from a provider. Revokes tokens, overwrites
 * encrypted values, and marks the connection as disconnected.
 *
 * Body: { consumerId, providerName }
 */
router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    const { consumerId, providerName } = req.body as {
      consumerId: string;
      providerName: string;
    };

    if (!consumerId || !providerName) {
      res.status(400).json({
        error: "consumerId and providerName are required",
      });
      return;
    }

    const db = getDb();

    await disconnectProvider(db, consumerId, providerName);

    res.json({ success: true });
  } catch (err) {
    console.error("[auth] disconnect error:", (err as Error).message);
    res.status(500).json({
      error: "Failed to disconnect provider",
      detail: (err as Error).message,
    });
  }
});

// ── GET /api/auth/status/:consumerId/:providerName ─

/**
 * Get the current authorization status for a consumer + provider.
 *
 * Returns: { status, authorizedScopes, connectedAt, lastRefresh, consentVersion }
 */
router.get("/status/:consumerId/:providerName", (req: Request, res: Response) => {
  try {
    const { consumerId, providerName } = req.params;
    const db = getDb();

    // Get authorization record
    const auth = db
      .prepare(
        `SELECT * FROM consumer_authorizations
         WHERE consumer_id = ? AND provider_name = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(consumerId, providerName) as Record<string, unknown> | undefined;

    // Get token record
    const token = db
      .prepare(
        `SELECT authorization_timestamp, token_scopes, consent_version, expires_at, status
         FROM oauth_tokens
         WHERE consumer_id = ? AND provider_name = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(consumerId, providerName) as Record<string, unknown> | undefined;

    if (!auth && !token) {
      res.json({
        status: "not_connected",
        authorizedScopes: [],
        connectedAt: null,
        lastRefresh: null,
        consentVersion: null,
      });
      return;
    }

    const scopes: string[] = token?.token_scopes
      ? JSON.parse(token.token_scopes as string)
      : auth?.scope_authorized
        ? JSON.parse(auth.scope_authorized as string)
        : [];

    res.json({
      status: auth?.authorization_status || token?.status || "unknown",
      authorizedScopes: scopes,
      connectedAt: token?.authorization_timestamp || auth?.consent_timestamp || null,
      lastRefresh: token?.authorization_timestamp || null,
      consentVersion: token?.consent_version || auth?.consent_text_version || null,
    });
  } catch (err) {
    console.error("[auth] status error:", (err as Error).message);
    res.status(500).json({
      error: "Failed to retrieve authorization status",
      detail: (err as Error).message,
    });
  }
});

export default router;
