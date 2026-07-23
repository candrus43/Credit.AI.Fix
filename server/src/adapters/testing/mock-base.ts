// ──────────────────────────────────────────────
// CreditBridge — Mock Adapter Base
// ──────────────────────────────────────────────
//
// Implements the full ProviderAdapter interface with overridable
// methods. Each method returns a sensible default mock response
// and stores call history. Named test scenarios modify behavior
// to simulate specific real-world conditions.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type {
  AdapterMode,
  AuthorizationResult,
  ConsentRevocationResult,
  CreditScore,
  DataDeletionResult,
  DisconnectResult,
  EnrollmentResult,
  ErrorHandlingResult,
  IdentityVerificationResult,
  Inquiry,
  MonitoringAlert,
  ProviderCapabilitiesRow,
  ReportResult,
  ScoreResult,
  ThreeBureauReportResult,
  Tradeline,
  WebhookResult,
} from "@creditbridge/shared";
import { Bureau } from "@creditbridge/shared";
import type { ProviderAdapter } from "../types.js";
import { getScenario, type ScenarioConfig } from "./scenarios.js";

// ── Call History ─────────────────────────────

export interface CallRecord {
  method: string;
  args: any[];
  timestamp: string;
}

// ── Helpers ──────────────────────────────────

const TEST_LABEL = "[TEST]";
const SANDBOX_LABEL = "[SANDBOX]";

function nowISO(): string {
  return new Date().toISOString();
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Default Tradeline / Score Generators ─────

function defaultTradeline(bureau: string, idx: number): Tradeline {
  return {
    id: `${TEST_LABEL}_TL_${bureau}_${idx}_${Date.now()}`,
    accountName: `${TEST_LABEL} Mock ${bureau} Account ${idx + 1}`,
    accountNumber: `${TEST_LABEL}_****${1000 + idx}`,
    accountType: idx === 0 ? "Credit Card" : idx === 1 ? "Auto Loan" : "Mortgage",
    dateOpened: "2020-03-15",
    creditLimit: 10000 + idx * 5000,
    highBalance: 3500 + idx * 2000,
    currentBalance: 1200 + idx * 800,
    monthlyPayment: 150 + idx * 100,
    paymentStatus: "Current",
    paymentHistory: Array(24).fill("OK"),
    isDisputed: false,
    bureau: bureau as any,
    dataLabel: TEST_LABEL,
  };
}

function defaultInquiry(bureau: string, idx: number): Inquiry {
  return {
    id: `${TEST_LABEL}_INQ_${bureau}_${idx}_${Date.now()}`,
    inquiryDate: todayISO(),
    inquiringCompany: `${TEST_LABEL} Mock Inquiry Co. ${idx + 1}`,
    inquiryType: "hard",
    bureau: bureau as any,
    dataLabel: TEST_LABEL,
  };
}

function defaultScore(bureau: string, idx: number): CreditScore {
  const models = [
    { type: "FICO", model: "FICO 8" },
    { type: "VantageScore", model: "VantageScore 4.0" },
  ];
  const baseScores: Record<string, number> = {
    EQUIFAX: 710,
    EXPERIAN: 725,
    TRANSUNION: 698,
  };
  return {
    score: (baseScores[bureau] ?? 700) + idx * 2,
    scoreType: models[idx]?.type ?? "FICO",
    scoreModel: models[idx]?.model ?? "FICO 8",
    bureau: bureau as any,
    date: todayISO(),
    dataLabel: TEST_LABEL,
  };
}

// ── MockAdapterBase ──────────────────────────

export class MockAdapterBase implements ProviderAdapter {
  protected db?: Database;
  protected providerName: string;
  protected mode: AdapterMode;
  protected capabilities: ProviderCapabilitiesRow;

  /** Call history for inspection in tests */
  public callHistory: CallRecord[] = [];

  /** Current active scenario name (empty string = default) */
  protected currentScenario: string = "";

  /** Scenario config for the active scenario */
  protected scenarioConfig: ScenarioConfig | undefined;

  // ── Scenario state tracking ─────────────
  /** Tracks how many times authorize() has been called (for expired_authorization) */
  protected authorizeCallCount: number = 0;
  /** Tracks whether consent has been revoked (for revoked_consent) */
  protected consentRevoked: boolean = false;
  /** Tracks whether disconnected (for user_disconnection) */
  protected isDisconnected: boolean = false;
  /** Authorized consumer ID for cross-tenant checks */
  protected authorizedConsumerId: string | null = null;
  /** Fixed report ID for duplicate_report scenario */
  protected duplicateReportId: string = `${TEST_LABEL}_RPT_DUPLICATE_FIXED`;
  /** Last refresh date for report_refresh */
  protected lastRefreshDate: string = todayISO();

  constructor(
    providerName: string,
    mode: AdapterMode = "sandbox",
    db?: Database
  ) {
    this.providerName = providerName;
    this.mode = mode;
    this.db = db;
    this.capabilities = this.defaultCapabilities();
  }

  // ── Call History ──────────────────────────

  protected recordCall(method: string, args: any[]): void {
    this.callHistory.push({
      method,
      args,
      timestamp: nowISO(),
    });
  }

  // ── Scenario Management ──────────────────

  /**
   * Activate a named test scenario.
   * Throws if the scenario name is not recognized.
   */
  setScenario(name: string): void {
    const config = getScenario(name);
    if (!config) {
      throw new Error(
        `Unknown test scenario: "${name}". Available: ${getScenario("") ? "" : "check /api/testing/scenarios"}`
      );
    }
    this.currentScenario = name;
    this.scenarioConfig = config;
    // Reset scenario-specific state
    this.authorizeCallCount = 0;
    this.consentRevoked = false;
    this.isDisconnected = false;
    this.authorizedConsumerId = null;
    console.log(`[mock-base] ${this.providerName}: activated scenario "${name}"`);
  }

  /**
   * Reset call history and clear active scenario.
   */
  reset(): void {
    this.callHistory = [];
    this.currentScenario = "";
    this.scenarioConfig = undefined;
    this.authorizeCallCount = 0;
    this.consentRevoked = false;
    this.isDisconnected = false;
    this.authorizedConsumerId = null;
    console.log(`[mock-base] ${this.providerName}: reset — call history cleared, scenario cleared`);
  }

  /**
   * Get the name of the currently active scenario.
   */
  getScenario(): string {
    return this.currentScenario;
  }

  // ── Default Capabilities ──────────────────

  protected defaultCapabilities(): ProviderCapabilitiesRow {
    const name = this.providerName;
    // Generate a deterministic-ish id from the provider name
    let id = 100;
    for (let i = 0; i < name.length; i++) id += name.charCodeAt(i);
    id = id % 900 + 100;

    const isSandbox = this.mode === "sandbox";

    return {
      id,
      provider_name: name,
      provider_status: isSandbox ? "sandbox" : "inactive",
      enrollment_supported: 1,
      authentication_supported: 1,
      oauth_supported: 0,
      report_retrieval_supported: 1,
      three_bureau_supported: 1,
      score_retrieval_supported: 1,
      monitoring_supported: 1,
      refresh_supported: 1,
      webhooks_supported: 1,
      sandbox_supported: isSandbox ? 1 : 0,
      required_customer_consent: null,
      required_agreements: null,
      api_documentation_reference: null,
      last_verification_date: null,
      production_approval_status: isSandbox ? "approved" : "not_approved",
      internal_notes: `[TEST] Mock adapter for ${name}`,
      created_at: todayISO(),
      updated_at: todayISO(),
    };
  }

  // ── Identity ────────────────────────────────

  async getProviderName(): Promise<string> {
    this.recordCall("getProviderName", []);
    this.checkOutage();
    return `${TEST_LABEL} ${this.providerName}`;
  }

  async getCapabilities(): Promise<ProviderCapabilitiesRow> {
    this.recordCall("getCapabilities", []);
    this.checkOutage();
    this.checkDisconnected();

    // Scenario: pdf_upload_fallback or provider_without_report_retrieval
    if (
      this.currentScenario === "pdf_upload_fallback" ||
      this.currentScenario === "provider_without_report_retrieval"
    ) {
      return {
        ...this.capabilities,
        report_retrieval_supported: 0,
        three_bureau_supported: 0,
        internal_notes: `[TEST] report_retrieval_supported forced to 0 for scenario "${this.currentScenario}"`,
      };
    }

    return { ...this.capabilities };
  }

  async getMode(): Promise<AdapterMode> {
    this.recordCall("getMode", []);
    this.checkOutage();
    return this.mode;
  }

  // ── Lifecycle ───────────────────────────────

  async enroll(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<EnrollmentResult> {
    this.recordCall("enroll", [consumerId, params]);
    this.checkOutage();

    if (this.mode === "not_configured") {
      return {
        success: false,
        message: `[TEST] ${this.providerName} is not configured.`,
        providerName: this.providerName,
        mode: "not_configured",
      };
    }

    return {
      success: true,
      enrollmentId: `${TEST_LABEL}_ENROLL_${consumerId}_${Date.now()}`,
      referralLink: `https://example.com/${this.providerName.toLowerCase().replace(/\s+/g, "-")}/enroll?test=true`,
      message: `[TEST] Mock enrollment for consumer ${consumerId} with ${this.providerName}.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  async authorize(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<AuthorizationResult> {
    this.recordCall("authorize", [consumerId, params]);
    this.checkOutage();
    this.checkDisconnected();

    this.authorizeCallCount++;

    // Scenario: expired_authorization — first call succeeds, subsequent fail
    if (this.currentScenario === "expired_authorization") {
      if (this.authorizeCallCount === 1) {
        this.authorizedConsumerId = consumerId;
        return {
          success: true,
          authorized: true,
          tokenId: `${TEST_LABEL}_TOKEN_${consumerId}_${Date.now()}`,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          message: `[TEST] Authorization successful for ${consumerId}.`,
          providerName: this.providerName,
          mode: this.mode,
        };
      }
      throw new Error(
        `[TEST] Authorization expired for ${consumerId}. ` +
          "Token has expired. Please re-authorize. [TEST SCENARIO: expired_authorization]"
      );
    }

    // Scenario: cross_tenant_token_attempt — only authorize consumer1
    if (this.currentScenario === "cross_tenant_token_attempt") {
      if (this.authorizedConsumerId === null) {
        // First authorization — store as consumer1
        this.authorizedConsumerId = consumerId;
        return {
          success: true,
          authorized: true,
          tokenId: `${TEST_LABEL}_TOKEN_${consumerId}_${Date.now()}`,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
          message: `[TEST] Authorization successful for ${consumerId} (tenant anchor).`,
          providerName: this.providerName,
          mode: this.mode,
        };
      }
      // Attempting to authorize a different consumer
      if (consumerId !== this.authorizedConsumerId) {
        throw new Error(
          `[TEST] Cross-tenant authorization denied. ` +
            `Token was issued for ${this.authorizedConsumerId}, but request is for ${consumerId}. ` +
            "[TEST SCENARIO: cross_tenant_token_attempt]"
        );
      }
    }

    // Default: success
    this.authorizedConsumerId = consumerId;
    return {
      success: true,
      authorized: true,
      tokenId: `${TEST_LABEL}_TOKEN_${consumerId}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      message: `[TEST] Mock authorization for ${consumerId}.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  async verifyIdentity(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<IdentityVerificationResult> {
    this.recordCall("verifyIdentity", [consumerId, params]);
    this.checkOutage();
    this.checkDisconnected();

    // Scenario: identity_verification_failure
    if (this.currentScenario === "identity_verification_failure") {
      return {
        success: false,
        verified: false,
        remainingAttempts: 0,
        message: `[TEST] ID verification failed for ${consumerId}. [TEST SCENARIO: identity_verification_failure]`,
        providerName: this.providerName,
        mode: this.mode,
      };
    }

    return {
      success: true,
      verified: true,
      verificationId: `${TEST_LABEL}_VERIFY_${consumerId}_${Date.now()}`,
      remainingAttempts: 3,
      message: `[TEST] Identity verified for ${consumerId}.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  // ── Data Retrieval ──────────────────────────

  async retrieveReport(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<ReportResult> {
    this.recordCall("retrieveReport", [consumerId, params]);
    this.checkOutage();
    this.checkDisconnected();
    this.checkConsentRevoked();
    this.checkCrossTenant(consumerId);

    const bureau: string = (params.bureau as string) ?? "EQUIFAX";

    // Scenario: pdf_upload_fallback
    if (this.currentScenario === "pdf_upload_fallback") {
      return {
        success: false,
        tradelines: [],
        inquiries: [],
        scores: [],
        bureau: bureau as any,
        message:
          `[TEST] ${this.providerName} does not support programmatic report retrieval. ` +
          "Please upload your PDF credit report instead. [TEST SCENARIO: pdf_upload_fallback]",
        providerName: this.providerName,
        mode: this.mode,
        requiresPdfUpload: true,
      };
    }

    // Scenario: provider_without_report_retrieval
    if (this.currentScenario === "provider_without_report_retrieval") {
      throw new Error(
        `[TEST] Report retrieval is not supported by ${this.providerName}. ` +
          "This provider does not expose a report retrieval API. [TEST SCENARIO: provider_without_report_retrieval]"
      );
    }

    // Scenario: duplicate_report — always return same reportId
    if (this.currentScenario === "duplicate_report") {
      return {
        success: true,
        reportId: this.duplicateReportId,
        bureau: bureau as any,
        reportDate: todayISO(),
        tradelines: [defaultTradeline(bureau, 0), defaultTradeline(bureau, 1)],
        inquiries: [defaultInquiry(bureau, 0)],
        scores: [defaultScore(bureau, 0), defaultScore(bureau, 1)],
        message:
          `[TEST] Duplicate report detected. Report ${this.duplicateReportId} was already retrieved. ` +
          "[TEST SCENARIO: duplicate_report]",
        providerName: this.providerName,
        mode: this.mode,
      };
    }

    // Scenario: malformed_response
    if (this.currentScenario === "malformed_response") {
      return {
        success: true,
        reportId: `${TEST_LABEL}_RPT_MALFORMED_${Date.now()}`,
        bureau: bureau as any,
        reportDate: undefined,
        tradelines: [],
        inquiries: [],
        scores: [],
        message:
          `[TEST] Malformed report response — missing required fields and null values. ` +
          "[TEST SCENARIO: malformed_response]",
        providerName: this.providerName,
        mode: this.mode,
      };
    }

    // Scenario: partial_bureau_data (single report still works ok)
    // Default: success
    return {
      success: true,
      reportId: `${TEST_LABEL}_RPT_${bureau}_${Date.now()}`,
      bureau: bureau as any,
      reportDate: todayISO(),
      tradelines: [defaultTradeline(bureau, 0), defaultTradeline(bureau, 1), defaultTradeline(bureau, 2)],
      inquiries: [defaultInquiry(bureau, 0)],
      scores: [defaultScore(bureau, 0), defaultScore(bureau, 1)],
      message: `[TEST] Mock ${bureau} credit report for ${consumerId}.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  async retrieveThreeBureauReport(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<ThreeBureauReportResult> {
    this.recordCall("retrieveThreeBureauReport", [consumerId, params]);
    this.checkOutage();
    this.checkDisconnected();
    this.checkConsentRevoked();
    this.checkCrossTenant(consumerId);

    const makeReport = (bureau: string): ReportResult => ({
      success: true,
      reportId: `${TEST_LABEL}_RPT_${bureau}_${Date.now()}`,
      bureau: bureau as any,
      reportDate: todayISO(),
      tradelines: [defaultTradeline(bureau, 0), defaultTradeline(bureau, 1)],
      inquiries: [defaultInquiry(bureau, 0)],
      scores: [defaultScore(bureau, 0), defaultScore(bureau, 1)],
      message: `[TEST] Mock ${bureau} report — part of 3-bureau retrieval.`,
      providerName: this.providerName,
      mode: this.mode,
    });

    const emptyReport = (bureau: string): ReportResult => ({
      success: false,
      reportId: undefined,
      bureau: bureau as any,
      reportDate: undefined,
      tradelines: [],
      inquiries: [],
      scores: [],
      message:
        `[TEST] ${bureau} data unavailable. ` +
        "This bureau did not return data. [TEST SCENARIO: partial_bureau_data]",
      providerName: this.providerName,
      mode: this.mode,
    });

    // Scenario: partial_bureau_data — TransUnion is empty
    if (this.currentScenario === "partial_bureau_data") {
      return {
        success: true,
        reports: {
          [Bureau.EQUIFAX]: makeReport("EQUIFAX"),
          [Bureau.EXPERIAN]: makeReport("EXPERIAN"),
          [Bureau.TRANSUNION]: emptyReport("TRANSUNION"),
        },
        message:
          "[TEST] Partial 3-bureau report — only 2 of 3 bureaus returned data. " +
          "TransUnion data is missing. [TEST SCENARIO: partial_bureau_data]",
        providerName: this.providerName,
        mode: this.mode,
      };
    }

    // Scenario: pdf_upload_fallback or provider_without_report_retrieval
    if (
      this.currentScenario === "pdf_upload_fallback" ||
      this.currentScenario === "provider_without_report_retrieval"
    ) {
      return {
        success: false,
        reports: {},
        message:
          `[TEST] Three-bureau report retrieval is not supported by ${this.providerName}. ` +
          `[TEST SCENARIO: ${this.currentScenario}]`,
        providerName: this.providerName,
        mode: this.mode,
      };
    }

    // Default: all three bureaus succeed
    return {
      success: true,
      reports: {
        [Bureau.EQUIFAX]: makeReport("EQUIFAX"),
        [Bureau.EXPERIAN]: makeReport("EXPERIAN"),
        [Bureau.TRANSUNION]: makeReport("TRANSUNION"),
      },
      message:
        "[TEST] Mock three-bureau credit report. All data is labeled [TEST] for development and testing only.",
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  async retrieveScores(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<ScoreResult> {
    this.recordCall("retrieveScores", [consumerId, params]);
    this.checkOutage();
    this.checkDisconnected();
    this.checkConsentRevoked();
    this.checkCrossTenant(consumerId);

    const allScores: CreditScore[] = [];
    for (const bureau of ["EQUIFAX", "EXPERIAN", "TRANSUNION"]) {
      allScores.push(defaultScore(bureau, 0));
      allScores.push(defaultScore(bureau, 1));
    }

    return {
      success: true,
      scores: allScores,
      message: `[TEST] Mock credit scores for all 3 bureaus for ${consumerId}.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  // ── Monitoring ──────────────────────────────

  async getMonitoringAlerts(consumerId: string): Promise<MonitoringAlert[]> {
    this.recordCall("getMonitoringAlerts", [consumerId]);
    this.checkOutage();
    this.checkDisconnected();

    // Scenario: monitoring_alert — return rich alerts
    if (this.currentScenario === "monitoring_alert") {
      return [
        {
          id: `${TEST_LABEL}_ALERT_HIGH_${Date.now()}`,
          alertType: "new_account",
          severity: "high",
          title: "[TEST] New Account Opened — Potential Fraud",
          description:
            "[TEST] A new credit card account was opened in your name at Test Bank. " +
            "If you did not authorize this, contact the issuer immediately. [TEST SCENARIO: monitoring_alert]",
          detectedAt: nowISO(),
          bureau: "EQUIFAX",
          providerName: this.providerName,
          dataLabel: TEST_LABEL,
        },
        {
          id: `${TEST_LABEL}_ALERT_MED_${Date.now()}`,
          alertType: "score_change",
          severity: "medium",
          title: "[TEST] Score Change — 15 Point Drop",
          description:
            "[TEST] Your Experian FICO 8 score decreased by 15 points. " +
            "This may be due to a new inquiry or increased utilization. [TEST SCENARIO: monitoring_alert]",
          detectedAt: new Date(Date.now() - 3600000).toISOString(),
          bureau: "EXPERIAN",
          providerName: this.providerName,
          dataLabel: TEST_LABEL,
        },
        {
          id: `${TEST_LABEL}_ALERT_LOW_${Date.now()}`,
          alertType: "address_change",
          severity: "low",
          title: "[TEST] Address Change Detected",
          description:
            "[TEST] A change of address was reported on your TransUnion file. " +
            "[TEST SCENARIO: monitoring_alert]",
          detectedAt: new Date(Date.now() - 86400000).toISOString(),
          bureau: "TRANSUNION",
          providerName: this.providerName,
          dataLabel: TEST_LABEL,
        },
      ];
    }

    // Default: empty alerts
    return [];
  }

  // ── Maintenance ─────────────────────────────

  async refreshReport(
    consumerId: string,
    reportId: string
  ): Promise<ReportResult> {
    this.recordCall("refreshReport", [consumerId, reportId]);
    this.checkOutage();
    this.checkDisconnected();

    // Scenario: report_refresh — new report version
    const refreshDate = new Date();
    refreshDate.setDate(refreshDate.getDate() + 1);
    const newReportDate = refreshDate.toISOString().split("T")[0];

    if (this.currentScenario === "report_refresh") {
      this.lastRefreshDate = newReportDate;
      return {
        success: true,
        reportId: `${TEST_LABEL}_RPT_REFRESHED_${Date.now()}`,
        bureau: "EQUIFAX",
        reportDate: newReportDate,
        tradelines: [
          defaultTradeline("EQUIFAX", 0),
          defaultTradeline("EQUIFAX", 1),
          defaultTradeline("EQUIFAX", 2),
        ],
        inquiries: [defaultInquiry("EQUIFAX", 0)],
        scores: [defaultScore("EQUIFAX", 0), defaultScore("EQUIFAX", 1)],
        message:
          `[TEST] Report refreshed. New version generated. ` +
          `Previous reportId: ${reportId}. Report date updated to ${newReportDate}. ` +
          "[TEST SCENARIO: report_refresh]",
        providerName: this.providerName,
        mode: this.mode,
      };
    }

    // Default refresh
    return {
      success: true,
      reportId: `${TEST_LABEL}_RPT_REFRESHED_${Date.now()}`,
      bureau: "EQUIFAX",
      reportDate: newReportDate,
      tradelines: [defaultTradeline("EQUIFAX", 0), defaultTradeline("EQUIFAX", 1)],
      inquiries: [defaultInquiry("EQUIFAX", 0)],
      scores: [defaultScore("EQUIFAX", 0), defaultScore("EQUIFAX", 1)],
      message: `[TEST] Mock report refresh for ${consumerId} (report ${reportId}).`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  async disconnect(consumerId: string): Promise<DisconnectResult> {
    this.recordCall("disconnect", [consumerId]);
    this.checkOutage();

    this.isDisconnected = true;

    return {
      success: true,
      message:
        `[TEST] Mock disconnect for consumer ${consumerId} from ${this.providerName}. ` +
        (this.currentScenario === "user_disconnection"
          ? "[TEST SCENARIO: user_disconnection]"
          : ""),
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  // ── Webhooks ────────────────────────────────

  async handleWebhook(
    payload: Record<string, unknown>
  ): Promise<WebhookResult> {
    this.recordCall("handleWebhook", [payload]);
    this.checkOutage();

    // Scenario: invalid_callback
    if (this.currentScenario === "invalid_callback") {
      return {
        success: false,
        acknowledged: false,
        message:
          "[TEST] Invalid callback signature — webhook could not be verified. " +
          "[TEST SCENARIO: invalid_callback]",
        providerName: this.providerName,
      };
    }

    return {
      success: true,
      acknowledged: true,
      eventType: (payload.eventType as string) ?? "test.event",
      message: `[TEST] Mock webhook handled for ${this.providerName}.`,
      providerName: this.providerName,
    };
  }

  // ── Error Handling ──────────────────────────

  async handleError(
    error: Error,
    context: Record<string, unknown>
  ): Promise<ErrorHandlingResult> {
    this.recordCall("handleError", [error, context]);

    return {
      handled: true,
      recovered: true,
      message: `[TEST] Mock error handled for ${this.providerName}: ${error.message}`,
      providerName: this.providerName,
    };
  }

  // ── Privacy / Compliance ────────────────────

  async revokeConsent(consumerId: string): Promise<ConsentRevocationResult> {
    this.recordCall("revokeConsent", [consumerId]);
    this.checkOutage();

    this.consentRevoked = true;

    return {
      success: true,
      revokedAt: nowISO(),
      message:
        `[TEST] Mock consent revocation for ${consumerId} with ${this.providerName}. ` +
        (this.currentScenario === "revoked_consent"
          ? "[TEST SCENARIO: revoked_consent]"
          : ""),
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  async deleteProviderData(consumerId: string): Promise<DataDeletionResult> {
    this.recordCall("deleteProviderData", [consumerId]);
    this.checkOutage();

    return {
      success: true,
      deletedAt: nowISO(),
      recordsDeleted: 0,
      message: `[TEST] Mock data deletion for ${consumerId} — no real data to delete.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  // ── Internal Check Helpers ─────────────────

  /**
   * Throw if provider_outage scenario is active.
   */
  protected checkOutage(): void {
    if (this.currentScenario === "provider_outage") {
      throw new Error(
        `[TEST] Provider unavailable — ${this.providerName} is experiencing an outage. ` +
          "[TEST SCENARIO: provider_outage] " +
          "HTTP 503 — Service Unavailable. Please try again later."
      );
    }
  }

  /**
   * Throw if user_disconnection scenario is active and we've been disconnected.
   */
  protected checkDisconnected(): void {
    if (this.currentScenario === "user_disconnection" && this.isDisconnected) {
      throw new Error(
        `[TEST] Not connected — consumer has been disconnected from ${this.providerName}. ` +
          "[TEST SCENARIO: user_disconnection]"
      );
    }
  }

  /**
   * Throw if revoked_consent scenario is active and consent has been revoked.
   */
  protected checkConsentRevoked(): void {
    if (this.currentScenario === "revoked_consent" && this.consentRevoked) {
      throw new Error(
        `[TEST] Consent revoked — data access denied for ${this.providerName}. ` +
          "Consumer consent has been revoked. Re-authorization required. " +
          "[TEST SCENARIO: revoked_consent]"
      );
    }
  }

  /**
   * Throw if cross_tenant_token_attempt scenario and consumerId doesn't match.
   */
  protected checkCrossTenant(consumerId: string): void {
    if (
      this.currentScenario === "cross_tenant_token_attempt" &&
      this.authorizedConsumerId !== null &&
      consumerId !== this.authorizedConsumerId
    ) {
      throw new Error(
        `[TEST] Cross-tenant access denied. ` +
          `Token is for consumer ${this.authorizedConsumerId} but request is for ${consumerId}. ` +
          "[TEST SCENARIO: cross_tenant_token_attempt]"
      );
    }
  }
}
