// ──────────────────────────────────────────────
// CreditBridge — Provider Adapter Interface
// ──────────────────────────────────────────────

import type {
  AdapterMode,
  AuthorizationResult,
  ConsentRevocationResult,
  DataDeletionResult,
  DisconnectResult,
  EnrollmentResult,
  ErrorHandlingResult,
  IdentityVerificationResult,
  MonitoringAlert,
  ProviderCapabilitiesRow,
  ReportResult,
  ScoreResult,
  ThreeBureauReportResult,
  WebhookResult,
} from "@creditbridge/shared";

// Re-export everything for convenience
export type {
  AdapterMode,
  AuthorizationResult,
  ConsentRevocationResult,
  DataDeletionResult,
  DisconnectResult,
  EnrollmentResult,
  ErrorHandlingResult,
  IdentityVerificationResult,
  MonitoringAlert,
  ProviderCapabilitiesRow,
  ReportResult,
  ScoreResult,
  ThreeBureauReportResult,
  WebhookResult,
};

/**
 * Core interface that every provider adapter must implement.
 *
 * All methods return Promises. Optional methods (marked with `?`) may be
 * omitted if the provider's capabilities don't support that operation.
 * In that case, the adapter should still provide clear error messaging
 * through the base methods indicating lack of support.
 *
 * Each adapter operates in one of three modes determined by environment:
 * - `sandbox`: returns realistic-looking synthetic data labeled as such
 * - `production`: connects to real provider APIs (requires authorization)
 * - `not_configured`: adapter present but env vars not set; returns safe no-ops
 */
export interface ProviderAdapter {
  // ── Identity ──────────────────────────────

  /** Returns the canonical provider name (must match provider_capabilities.provider_name). */
  getProviderName(): Promise<string>;

  /** Returns the provider's capabilities record from the database (or a default). */
  getCapabilities(): Promise<ProviderCapabilitiesRow>;

  /** Returns the current operating mode of this adapter. */
  getMode(): Promise<AdapterMode>;

  // ── Lifecycle ─────────────────────────────

  /**
   * Enroll a consumer with this provider.
   * In sandbox mode returns a mock enrollment with a referral link.
   * In production mode performs actual enrollment.
   * Omit if the provider does not support self-service enrollment.
   */
  enroll?(consumerId: string, params: Record<string, unknown>): Promise<EnrollmentResult>;

  /**
   * Authorize the consumer to access their data through this provider.
   * May involve OAuth, credential exchange, or token management.
   * Omit if authorization is not required or handled externally.
   */
  authorize?(consumerId: string, params: Record<string, unknown>): Promise<AuthorizationResult>;

  /**
   * Verify the consumer's identity with this provider.
   * Omit if identity verification is not supported.
   */
  verifyIdentity?(consumerId: string, params: Record<string, unknown>): Promise<IdentityVerificationResult>;

  // ── Data Retrieval ────────────────────────

  /**
   * Retrieve a single credit report (specific bureau, or default).
   * Throws if report retrieval is not supported by this provider.
   */
  retrieveReport?(consumerId: string, params: Record<string, unknown>): Promise<ReportResult>;

  /**
   * Retrieve all three bureau reports in a single call.
   * Omit if the provider only supports single-bureau retrieval.
   */
  retrieveThreeBureauReport?(consumerId: string, params: Record<string, unknown>): Promise<ThreeBureauReportResult>;

  /**
   * Retrieve credit scores from this provider.
   * Omit if score retrieval is not supported.
   */
  retrieveScores?(consumerId: string, params: Record<string, unknown>): Promise<ScoreResult>;

  // ── Monitoring ────────────────────────────

  /**
   * Get outstanding monitoring alerts from this provider.
   * Omit if monitoring is not supported.
   */
  getMonitoringAlerts?(consumerId: string): Promise<MonitoringAlert[]>;

  // ── Maintenance ───────────────────────────

  /**
   * Refresh a previously retrieved report.
   * Omit if refresh is not supported.
   */
  refreshReport?(consumerId: string, reportId: string): Promise<ReportResult>;

  /**
   * Disconnect this consumer from the provider.
   * Omit if no explicit disconnect is needed.
   */
  disconnect?(consumerId: string): Promise<DisconnectResult>;

  // ── Webhooks ──────────────────────────────

  /**
   * Handle an incoming webhook payload from the provider.
   * Omit if webhooks are not supported.
   */
  handleWebhook?(payload: Record<string, unknown>): Promise<WebhookResult>;

  // ── Error Handling ────────────────────────

  /**
   * Handle an error that occurred during provider operations.
   * May trigger retry logic, circuit breaking, or alerting.
   * Omit for simple pass-through error handling.
   */
  handleError?(error: Error, context: Record<string, unknown>): Promise<ErrorHandlingResult>;

  // ── Privacy / Compliance ──────────────────

  /**
   * Revoke the consumer's consent / data-access grant with this provider.
   * Omit if consent is not managed through the adapter.
   */
  revokeConsent?(consumerId: string): Promise<ConsentRevocationResult>;

  /**
   * Delete all provider data stored for this consumer.
   * Omit if data deletion is not supported or handled elsewhere.
   */
  deleteProviderData?(consumerId: string): Promise<DataDeletionResult>;
}
