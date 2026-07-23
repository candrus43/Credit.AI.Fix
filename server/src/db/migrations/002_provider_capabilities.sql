-- Migration 002: Provider Capability Registry
-- Tracks which capabilities each credit-report provider adapter supports.

CREATE TABLE IF NOT EXISTS provider_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_name TEXT NOT NULL UNIQUE,
  provider_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (provider_status IN ('active', 'inactive', 'sandbox', 'pending_approval', 'deprecated')),
  enrollment_supported INTEGER DEFAULT 0,
  authentication_supported INTEGER DEFAULT 0,
  oauth_supported INTEGER DEFAULT 0,
  report_retrieval_supported INTEGER DEFAULT 0,
  three_bureau_supported INTEGER DEFAULT 0,
  score_retrieval_supported INTEGER DEFAULT 0,
  monitoring_supported INTEGER DEFAULT 0,
  refresh_supported INTEGER DEFAULT 0,
  webhooks_supported INTEGER DEFAULT 0,
  sandbox_supported INTEGER DEFAULT 0,
  required_customer_consent TEXT,
  required_agreements TEXT,        -- JSON array of agreement names
  api_documentation_reference TEXT,
  last_verification_date TEXT,     -- ISO 8601
  production_approval_status TEXT NOT NULL DEFAULT 'not_approved'
    CHECK (production_approval_status IN ('not_approved', 'pending', 'approved', 'suspended')),
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp,
  updated_at TEXT NOT NULL DEFAULT current_timestamp
);

-- Seed provider capability records (idempotent via INSERT OR IGNORE)
INSERT OR IGNORE INTO provider_capabilities
  (provider_name, provider_status, enrollment_supported, authentication_supported,
   oauth_supported, report_retrieval_supported, three_bureau_supported,
   score_retrieval_supported, monitoring_supported, refresh_supported,
   webhooks_supported, sandbox_supported, production_approval_status)
VALUES
  ('SmartCredit',        'sandbox',          1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'not_approved'),
  ('MyScoreIQ',          'inactive',         1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 'not_approved'),
  ('IdentityIQ',         'inactive',         1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 'not_approved'),
  ('Credit Hero Score',  'inactive',         0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'not_approved'),
  ('Equifax Consumer',   'inactive',         0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 'not_approved'),
  ('TransUnion Consumer','inactive',         0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 'not_approved'),
  ('Experian Consumer',  'inactive',         0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 'not_approved'),
  ('Synthetic',          'active',           0, 0, 0, 1, 1, 1, 0, 1, 0, 1, 'approved');
