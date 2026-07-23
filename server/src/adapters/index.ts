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
export { MyScoreIQAdapter } from "./myscoreiq/adapter.js";
export { IdentityIQAdapter } from "./identityiq/adapter.js";
export { CreditHeroScoreAdapter } from "./creditheroscore/adapter.js";
export { EquifaxAdapter } from "./equifax/adapter.js";
export { TransUnionAdapter } from "./transunion/adapter.js";
export { ExperianAdapter } from "./experian/adapter.js";
export { MockAdapterBase } from "./testing/mock-base.js";
export type { CallRecord } from "./testing/mock-base.js";
export { TEST_SCENARIOS, getScenario, listScenarioNames } from "./testing/scenarios.js";
export type { ScenarioConfig } from "./testing/scenarios.js";
