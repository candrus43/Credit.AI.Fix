-- Migration 005: OAuth Token Storage
-- Encrypted OAuth token storage per consumer per provider.

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumer_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,          -- AES-256-GCM encrypted, base64
  refresh_token_encrypted TEXT,                  -- AES-256-GCM encrypted, base64
  token_scopes TEXT,                             -- JSON array
  authorization_timestamp TEXT NOT NULL,         -- ISO 8601
  consent_version TEXT,
  expires_at TEXT,                               -- ISO 8601
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  metadata_encrypted TEXT,                       -- encrypted JSON for provider-specific data
  created_at TEXT NOT NULL DEFAULT current_timestamp,
  updated_at TEXT NOT NULL DEFAULT current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_oauth_consumer_provider
  ON oauth_tokens(consumer_id, provider_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_consumer_provider_unique
  ON oauth_tokens(consumer_id, provider_name);
