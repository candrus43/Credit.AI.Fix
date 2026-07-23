// ──────────────────────────────────────────────
// CreditBridge — Test Scenario Definitions
// ──────────────────────────────────────────────
//
// Each scenario modifies mock adapter behavior to simulate
// specific real-world conditions. Scenarios are activatable
// via setScenario() on MockAdapterBase.
// ──────────────────────────────────────────────

export interface ScenarioConfig {
  /** Human-readable name for the scenario */
  name: string;
  /** Description of what this scenario tests */
  description: string;
  /** Which methods are affected */
  affectedMethods: string[];
}

/**
 * All 15 named test scenarios.
 * Ordered as specified in the test suite spec.
 */
export const TEST_SCENARIOS: ScenarioConfig[] = [
  {
    name: "successful_three_bureau_connection",
    description:
      "All methods succeed. retrieveThreeBureauReport() returns complete 3-bureau data with all fields marked [TEST].",
    affectedMethods: [
      "getProviderName",
      "getCapabilities",
      "getMode",
      "enroll",
      "authorize",
      "verifyIdentity",
      "retrieveReport",
      "retrieveThreeBureauReport",
      "retrieveScores",
      "getMonitoringAlerts",
      "refreshReport",
      "disconnect",
      "handleWebhook",
      "handleError",
      "revokeConsent",
      "deleteProviderData",
    ],
  },
  {
    name: "partial_bureau_data",
    description:
      "Only 2 of 3 bureaus return data in retrieveThreeBureauReport(). The third bureau (TransUnion) returns an empty report with a partial-data message.",
    affectedMethods: ["retrieveThreeBureauReport"],
  },
  {
    name: "identity_verification_failure",
    description:
      'verifyIdentity() throws with "ID verification failed [TEST]" and remainingAttempts=0.',
    affectedMethods: ["verifyIdentity"],
  },
  {
    name: "expired_authorization",
    description:
      "authorize() succeeds on first call but subsequent calls throw an auth-expired error. Tracks call count internally.",
    affectedMethods: ["authorize", "retrieveReport", "retrieveThreeBureauReport", "retrieveScores"],
  },
  {
    name: "revoked_consent",
    description:
      "revokeConsent() succeeds. All subsequent data-access methods (retrieveReport, retrieveThreeBureauReport, retrieveScores) return consent-revoked errors.",
    affectedMethods: ["revokeConsent", "retrieveReport", "retrieveThreeBureauReport", "retrieveScores"],
  },
  {
    name: "provider_outage",
    description:
      'All methods throw a 503-like error with "Provider unavailable [TEST SCENARIO]".',
    affectedMethods: ["*"],
  },
  {
    name: "invalid_callback",
    description:
      'handleWebhook() throws "Invalid callback signature [TEST]" to simulate a compromised or misconfigured webhook.',
    affectedMethods: ["handleWebhook"],
  },
  {
    name: "duplicate_report",
    description:
      "retrieveReport() returns a report flagged as duplicate — same reportId on consecutive calls, with a duplicate-detected message.",
    affectedMethods: ["retrieveReport"],
  },
  {
    name: "malformed_response",
    description:
      "retrieveReport() returns data with missing required fields (null reportDate, empty tradelines array, null scores).",
    affectedMethods: ["retrieveReport"],
  },
  {
    name: "report_refresh",
    description:
      "refreshReport() returns a new report version with updated dates and a new reportId.",
    affectedMethods: ["refreshReport"],
  },
  {
    name: "monitoring_alert",
    description:
      "getMonitoringAlerts() returns 3 alerts with changes detected across bureaus, including a high-severity alert.",
    affectedMethods: ["getMonitoringAlerts"],
  },
  {
    name: "user_disconnection",
    description:
      'disconnect() succeeds on first call. Subsequent calls to any data method return "Not connected [TEST]".',
    affectedMethods: ["disconnect", "retrieveReport", "retrieveThreeBureauReport", "retrieveScores", "getMonitoringAlerts"],
  },
  {
    name: "pdf_upload_fallback",
    description:
      "Adapter reports report_retrieval_supported=0 in capabilities. retrieveReport() throws directing consumer to PDF upload path. requiresPdfUpload=true in the error response.",
    affectedMethods: ["getCapabilities", "retrieveReport"],
  },
  {
    name: "provider_without_report_retrieval",
    description:
      "Adapter is registered but report_retrieval_supported=false (0) in capabilities. retrieveReport() throws with clear unsupported-operation message.",
    affectedMethods: ["getCapabilities", "retrieveReport"],
  },
  {
    name: "cross_tenant_token_attempt",
    description:
      "Accessing consumer2 data with consumer1 token throws an authorization error. The adapter tracks which consumerId was authorized and rejects mismatched IDs on data-access methods.",
    affectedMethods: ["authorize", "retrieveReport", "retrieveThreeBureauReport", "retrieveScores"],
  },
];

/**
 * Look up a scenario by name. Returns undefined if not found.
 */
export function getScenario(name: string): ScenarioConfig | undefined {
  return TEST_SCENARIOS.find((s) => s.name === name);
}

/**
 * List all scenario names.
 */
export function listScenarioNames(): string[] {
  return TEST_SCENARIOS.map((s) => s.name);
}
