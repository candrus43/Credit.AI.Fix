-- Migration 004: Normalized Credit Report Schema
-- Stores imported credit reports and their parsed contents across bureaus.

-- ── reports ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumer_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('direct_provider', 'consumer_uploaded', 'licensed_api', 'manual_entry', 'synthetic')),
  report_date TEXT,                     -- date on the report
  import_date TEXT NOT NULL,            -- when we received it
  last_refresh_date TEXT,
  connection_status TEXT NOT NULL DEFAULT 'imported'
    CHECK (connection_status IN ('imported', 'live_connected', 'disconnected', 'error')),
  three_bureau_available INTEGER DEFAULT 0,
  score_model TEXT,                     -- e.g. "FICO 8", "VantageScore 3.0"
  consumer_confirmed INTEGER DEFAULT 0,
  eligible_for_automated_analysis INTEGER DEFAULT 1,
  parser_version TEXT,
  mapping_version TEXT,
  original_response_path TEXT,          -- path to stored original provider response
  authorization_id INTEGER REFERENCES consumer_authorizations(id),
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_reports_consumer_id ON reports(consumer_id);
CREATE INDEX IF NOT EXISTS idx_reports_provider_name ON reports(provider_name);

-- ── report_personal_info ────────────────────────────────
CREATE TABLE IF NOT EXISTS report_personal_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  full_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  ssn_last4 TEXT,
  date_of_birth TEXT,
  phone TEXT,
  employer TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

-- ── report_scores ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  bureau TEXT NOT NULL,                 -- Equifax, Experian, TransUnion
  score INTEGER,
  score_model TEXT,
  score_date TEXT,
  factors TEXT,                         -- JSON array
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

-- ── report_tradelines ───────────────────────────────────
CREATE TABLE IF NOT EXISTS report_tradelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  bureau TEXT NOT NULL,
  creditor_name TEXT,
  original_creditor_name TEXT,          -- provider's raw name before normalization
  masked_account_number TEXT,
  account_type TEXT                     -- revolving, installment, mortgage, open, collection, other
    CHECK (account_type IN ('revolving', 'installment', 'mortgage', 'open', 'collection', 'other')),
  ownership TEXT                        -- individual, joint, authorized_user
    CHECK (ownership IN ('individual', 'joint', 'authorized_user')),
  account_status TEXT,                  -- open, closed, paid, charged_off, collections, etc.
  payment_status TEXT,                  -- current, 30, 60, 90, 120, 180, collection
  balance REAL,
  credit_limit REAL,
  past_due_amount REAL,
  high_balance REAL,
  monthly_payment REAL,
  date_opened TEXT,
  date_closed TEXT,
  date_reported TEXT,
  date_of_last_activity TEXT,
  first_delinquency_date TEXT,
  payment_history TEXT,                 -- JSON, e.g. ["OK","OK","30","OK"]
  remarks TEXT,
  dispute_indicator INTEGER DEFAULT 0,
  provider_specific_id TEXT,            -- provider's internal identifier
  confidence REAL,                      -- 0.0 to 1.0 for parsed data
  extraction_raw TEXT,                  -- JSON of raw provider data pre-normalization
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

CREATE INDEX IF NOT EXISTS idx_tradelines_report_id ON report_tradelines(report_id);
CREATE INDEX IF NOT EXISTS idx_tradelines_report_bureau ON report_tradelines(report_id, bureau);

-- ── report_collections ──────────────────────────────────
CREATE TABLE IF NOT EXISTS report_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  bureau TEXT NOT NULL,
  collection_agency TEXT,
  original_creditor TEXT,
  amount REAL,
  account_number TEXT,
  date_assigned TEXT,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

-- ── report_inquiries ────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  bureau TEXT NOT NULL,
  inquiry_date TEXT,
  company_name TEXT,
  inquiry_type TEXT                     -- hard, soft
    CHECK (inquiry_type IN ('hard', 'soft')),
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

-- ── report_public_records ───────────────────────────────
CREATE TABLE IF NOT EXISTS report_public_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  bureau TEXT NOT NULL,
  record_type TEXT                      -- bankruptcy, judgment, tax_lien
    CHECK (record_type IN ('bankruptcy', 'judgment', 'tax_lien')),
  record_date TEXT,
  court TEXT,
  reference_number TEXT,
  amount REAL,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp
);

-- ── report_personal_statements ──────────────────────────
CREATE TABLE IF NOT EXISTS report_personal_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id),
  bureau TEXT,
  statement_text TEXT,
  statement_date TEXT,
  created_at TEXT NOT NULL DEFAULT current_timestamp
);
