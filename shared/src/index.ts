// ──────────────────────────────────────────────
// CreditBridge — Shared Types & Enums
// ──────────────────────────────────────────────

// ── Enums ─────────────────────────────────────

/**
 * Capabilities that a provider adapter may support.
 */
export enum ProviderCapability {
  /** Can pull credit reports directly via API or screen-scraping */
  FETCH_REPORT = "FETCH_REPORT",
  /** Can import a PDF credit report for parsing */
  PARSE_PDF = "PARSE_PDF",
  /** Supports OAuth-based authentication */
  OAUTH = "OAUTH",
  /** Supports refresh on a schedule */
  SCHEDULED_REFRESH = "SCHEDULED_REFRESH",
  /** Can monitor for changes and push alerts */
  CHANGE_MONITORING = "CHANGE_MONITORING",
  /** Can provide identity-theft insurance info */
  ID_THEFT_INSURANCE = "ID_THEFT_INSURANCE",
}

/**
 * Current status of a provider connection or adapter.
 */
export enum ProviderStatus {
  /** Connected and operational */
  CONNECTED = "CONNECTED",
  /** Connection failed or token expired */
  DISCONNECTED = "DISCONNECTED",
  /** Provider reported an error */
  ERROR = "ERROR",
  /** Awaiting user action (MFA, re-auth) */
  PENDING = "PENDING",
  /** Adapter is registered but not yet configured */
  UNCONFIGURED = "UNCONFIGURED",
}

/**
 * Source of a credit report that was imported.
 */
export enum ReportSource {
  /** Direct API pull from the bureau via a provider */
  PROVIDER_API = "PROVIDER_API",
  /** Manually uploaded PDF report */
  PDF_UPLOAD = "PDF_UPLOAD",
  /** Manually entered data */
  MANUAL_ENTRY = "MANUAL_ENTRY",
}

/**
 * The three major US credit bureaus.
 */
export enum Bureau {
  EQUIFAX = "EQUIFAX",
  EXPERIAN = "EXPERIAN",
  TRANSUNION = "TRANSUNION",
}

// ── Adapter Mode ─────────────────────────────

/**
 * The operational mode of a provider adapter.
 */
export type AdapterMode = "sandbox" | "production" | "not_configured";

// ── Provider Info ────────────────────────────

/**
 * Metadata about a registered provider adapter.
 */
export interface ProviderInfo {
  /** Unique adapter identifier, e.g. "smartcredit" */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Capabilities this adapter supports */
  capabilities: ProviderCapability[];
  /** Current connection status */
  status: ProviderStatus;
}

/**
 * Summary of an imported credit report.
 */
export interface ReportSummary {
  id: string;
  bureau: Bureau;
  source: ReportSource;
  providerId?: string;
  importedAt: string;
  reportDate?: string;
  score?: number;
}

// ── Provider Capabilities Row (DB schema) ────

/**
 * Mirror of the provider_capabilities database table row.
 */
export interface ProviderCapabilitiesRow {
  id: number;
  provider_name: string;
  provider_status: "active" | "inactive" | "sandbox" | "pending_approval" | "deprecated";
  enrollment_supported: number;
  authentication_supported: number;
  oauth_supported: number;
  report_retrieval_supported: number;
  three_bureau_supported: number;
  score_retrieval_supported: number;
  monitoring_supported: number;
  refresh_supported: number;
  webhooks_supported: number;
  sandbox_supported: number;
  required_customer_consent: string | null;
  required_agreements: string | null;
  api_documentation_reference: string | null;
  last_verification_date: string | null;
  production_approval_status: "not_approved" | "pending" | "approved" | "suspended";
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Adapter Result Types ─────────────────────

/**
 * Result returned when a consumer enrolls with a provider.
 */
export interface EnrollmentResult {
  success: boolean;
  enrollmentId?: string;
  redirectUrl?: string;
  referralLink?: string;
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * Result returned when authenticating a consumer with a provider.
 */
export interface AuthorizationResult {
  success: boolean;
  authorized: boolean;
  tokenId?: string;
  expiresAt?: string;
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * Result returned from identity verification.
 */
export interface IdentityVerificationResult {
  success: boolean;
  verified: boolean;
  verificationId?: string;
  remainingAttempts?: number;
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * A single tradeline (credit account) on a report.
 */
export interface Tradeline {
  id: string;
  accountName: string;
  accountNumber: string;
  accountType: string;
  dateOpened: string;
  creditLimit?: number;
  highBalance?: number;
  currentBalance: number;
  monthlyPayment: number;
  paymentStatus: string;
  paymentHistory: string[];
  isDisputed: boolean;
  bureau: Bureau;
  /** "[SYNTHETIC]" or "[SANDBOX]" marker if applicable */
  dataLabel: string;
}

/**
 * A credit inquiry on a report.
 */
export interface Inquiry {
  id: string;
  inquiryDate: string;
  inquiringCompany: string;
  inquiryType: "hard" | "soft";
  bureau: Bureau;
  dataLabel: string;
}

/**
 * A credit score from a report.
 */
export interface CreditScore {
  score: number;
  scoreType: string;
  scoreModel: string;
  bureau: Bureau;
  date: string;
  dataLabel: string;
}

/**
 * Result returned from a single-bureau report retrieval.
 */
export interface ReportResult {
  success: boolean;
  reportId?: string;
  bureau?: Bureau;
  reportDate?: string;
  tradelines: Tradeline[];
  inquiries: Inquiry[];
  scores: CreditScore[];
  message: string;
  providerName: string;
  mode: AdapterMode;
  /** When true, the consumer should use PDF upload instead */
  requiresPdfUpload?: boolean;
}

/**
 * Result returned from a three-bureau report retrieval.
 */
export interface ThreeBureauReportResult {
  success: boolean;
  reports: {
    [Bureau.EQUIFAX]?: ReportResult;
    [Bureau.EXPERIAN]?: ReportResult;
    [Bureau.TRANSUNION]?: ReportResult;
  };
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * Result returned from score retrieval.
 */
export interface ScoreResult {
  success: boolean;
  scores: CreditScore[];
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * A monitoring alert from a provider.
 */
export interface MonitoringAlert {
  id: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  detectedAt: string;
  bureau?: Bureau;
  providerName: string;
  dataLabel: string;
}

/**
 * Result returned when disconnecting from a provider.
 */
export interface DisconnectResult {
  success: boolean;
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * Result returned from handling a provider webhook.
 */
export interface WebhookResult {
  success: boolean;
  acknowledged: boolean;
  eventType?: string;
  message: string;
  providerName: string;
}

/**
 * Result returned from adapter-level error handling.
 */
export interface ErrorHandlingResult {
  handled: boolean;
  recovered: boolean;
  retryAfter?: number;
  message: string;
  providerName: string;
}

/**
 * Result returned when revoking consumer consent with a provider.
 */
export interface ConsentRevocationResult {
  success: boolean;
  revokedAt: string;
  message: string;
  providerName: string;
  mode: AdapterMode;
}

/**
 * Result returned when deleting provider data for a consumer.
 */
export interface DataDeletionResult {
  success: boolean;
  deletedAt: string;
  recordsDeleted: number;
  message: string;
  providerName: string;
  mode: AdapterMode;
}
