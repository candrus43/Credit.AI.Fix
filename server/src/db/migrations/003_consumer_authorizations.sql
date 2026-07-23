-- Migration 003: Consumer Authorization Records
-- Records consumer opt-in / consent for each provider connection.

CREATE TABLE IF NOT EXISTS consumer_authorizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumer_id TEXT NOT NULL,               -- UUID
  provider_name TEXT NOT NULL,             -- FK reference to provider_capabilities
  scope_authorized TEXT NOT NULL,          -- JSON array of scopes
  consent_text_version TEXT NOT NULL,
  consent_timestamp TEXT NOT NULL,         -- ISO 8601
  ip_address TEXT,
  device_info TEXT,
  authorization_status TEXT NOT NULL DEFAULT 'active'
    CHECK (authorization_status IN ('active', 'expired', 'revoked', 'pending')),
  revocation_date TEXT,                    -- ISO 8601
  provider_confirmation_id TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp,
  updated_at TEXT NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (provider_name) REFERENCES provider_capabilities(provider_name)
);

CREATE INDEX IF NOT EXISTS idx_consumer_auth_consumer_id
  ON consumer_authorizations(consumer_id);

CREATE INDEX IF NOT EXISTS idx_consumer_auth_provider_name
  ON consumer_authorizations(provider_name);
