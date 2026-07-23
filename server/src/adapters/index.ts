// ──────────────────────────────────────────────
// CreditBridge — Adapters Barrel Export
// ──────────────────────────────────────────────

export type { ProviderAdapter } from "./types.js";
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
} from "./types.js";

export { CapabilityRegistry } from "./registry.js";
export { getAdapter, hasAdapter, listAdapters } from "./factory.js";
export { SmartCreditAdapter } from "./smartcredit/adapter.js";
export { SyntheticAdapter } from "./synthetic/adapter.js";
