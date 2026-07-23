// ──────────────────────────────────────────────
// CreditBridge — SmartCredit Provider Adapter
// ──────────────────────────────────────────────
//
// SmartCredit (smartcredit.com) is a credit-monitoring service that provides
// consumers with access to their credit reports and scores. This adapter
// operates in three modes:
//
//   not_configured — SMARTCREDIT_MODE is unset or "not_configured".
//                    Every method returns a safe "not configured" result.
//
//   sandbox        — SMARTCREDIT_MODE=sandbox.
//                    Returns realistic mock data for testing and demos.
//                    All user-facing fields contain "[SANDBOX]" labels.
//                    Enrollment returns a referral link to SmartCredit.
//                    Report retrieval THROWS — directs users to PDF upload.
//
//   production     — SMARTCREDIT_MODE=production.
//                    THROWS on any data-access method: the production
//                    integration is not yet authorized. No endpoints are
//                    invented, no credentials are stored, no scraping occurs.
//
// IMPORTANT: This adapter does NOT store passwords, does NOT scrape
// SmartCredit's website, and does NOT invent API endpoints. Production
// integration requires contractual access, documented API endpoints,
// and explicit authorization.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type {
  AdapterMode,
  AuthorizationResult,
  Bureau,
  ConsentRevocationResult,
  CreditScore,
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
import type { ProviderAdapter } from "../types.js";

// ── Helpers ─────────────────────────────────

function resolveMode(): AdapterMode {
  const env = process.env.SMARTCREDIT_MODE;
  if (!env || env === "not_configured") return "not_configured";
  if (env === "sandbox") return "sandbox";
  if (env === "production") return "production";
  return "not_configured";
}

/**
 * Throw when a production endpoint is called before authorization.
 */
function productionBlocked(): never {
  throw new Error(
    "SmartCredit production integration is not yet authorized. " +
      "Required: valid contractual access, API credentials, and documented " +
      "report-retrieval endpoints."
  );
}

/**
 * Default capabilities matching the DB seed for SmartCredit.
 */
function defaultCapabilities(): ProviderCapabilitiesRow {
  return {
    id: 1,
    provider_name: "SmartCredit",
    provider_status: "sandbox",
    enrollment_supported: 1,
    authentication_supported: 0,
    oauth_supported: 0,
    report_retrieval_supported: 0,
    three_bureau_supported: 0,
    score_retrieval_supported: 0,
    monitoring_supported: 0,
    refresh_supported: 0,
    webhooks_supported: 0,
    sandbox_supported: 0,
    required_customer_consent: null,
    required_agreements: null,
    api_documentation_reference: null,
    last_verification_date: null,
    production_approval_status: "not_approved",
    internal_notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Mock Data (Sandbox Only) ───────────────

const SANDBOX = "[SANDBOX]";

function sandboxScores(bureau: Bureau): CreditScore[] {
  return [
    {
      score: bureau === "EQUIFAX" ? 692 : bureau === "EXPERIAN" ? 705 : 678,
      scoreType: "FICO",
      scoreModel: "FICO 8",
      bureau,
      date: new Date().toISOString().split("T")[0],
      dataLabel: SANDBOX,
    },
    {
      score: bureau === "EQUIFAX" ? 688 : bureau === "EXPERIAN" ? 710 : 672,
      scoreType: "VantageScore",
      scoreModel: "VantageScore 4.0",
      bureau,
      date: new Date().toISOString().split("T")[0],
      dataLabel: SANDBOX,
    },
  ];
}

// ── Adapter Class ───────────────────────────

export class SmartCreditAdapter implements ProviderAdapter {
  private db: Database;
  private mode: AdapterMode;

  constructor(db: Database) {
    this.db = db;
    this.mode = resolveMode();
  }

  // ── Identity ──────────────────────────────

  /**
   * Returns the canonical provider name.
   * Real: matches provider_capabilities.provider_name.
   */
  async getProviderName(): Promise<string> {
    return "SmartCredit";
  }

  /**
   * Reads capabilities from the database if available; falls back to defaults.
   * Real: database read. Cached at the registry level.
   */
  async getCapabilities(): Promise<ProviderCapabilitiesRow> {
    const row = this.db
      .prepare("SELECT * FROM provider_capabilities WHERE provider_name = ?")
      .get("SmartCredit") as ProviderCapabilitiesRow | undefined;
    return row ?? defaultCapabilities();
  }

  /**
   * Returns the current operating mode, driven by SMARTCREDIT_MODE env var.
   */
  async getMode(): Promise<AdapterMode> {
    return this.mode;
  }

  // ── Lifecycle ─────────────────────────────

  /**
   * Enroll a consumer with SmartCredit.
   *
   * Sandbox: returns a mock enrollment with a SmartCredit referral link.
   * Production: blocked until authorized.
   * Not configured: returns a "not configured" message.
   */
  async enroll(
    consumerId: string,
    _params: Record<string, unknown>
  ): Promise<EnrollmentResult> {
    if (this.mode === "not_configured") {
      return {
        success: false,
        message: "SmartCredit adapter is not configured. Set SMARTCREDIT_MODE to enable.",
        providerName: "SmartCredit",
        mode: "not_configured",
      };
    }

    if (this.mode === "production") {
      productionBlocked();
    }

    // Sandbox: mock enrollment with referral link
    return {
      success: true,
      enrollmentId: `SANDBOX_ENROLL_${consumerId}_${Date.now()}`,
      referralLink: "https://www.smartcredit.com/affiliate/creditbridge?sandbox=true",
      message:
        `[SANDBOX] Mock enrollment for consumer ${consumerId}. ` +
        "In production, this would redirect to SmartCredit's enrollment flow. " +
        "Use the referral link to sign up, then return to upload your PDF report.",
      providerName: "SmartCredit",
      mode: "sandbox",
    };
  }

  /**
   * SmartCredit does not support programmatic authentication (authentication_supported=0).
   * This adapter does NOT store passwords or credentials.
   */
  async authorize?(
    consumerId: string,
    _params: Record<string, unknown>
  ): Promise<AuthorizationResult> {
    if (this.mode === "production") productionBlocked();

    return {
      success: false,
      authorized: false,
      message:
        "[SANDBOX] SmartCredit does not support programmatic authentication. " +
        "Consumers must log in at smartcredit.com and download their PDF report.",
      providerName: "SmartCredit",
      mode: this.mode,
    };
  }

  /**
   * SmartCredit does not support identity verification through this adapter.
   */
  async verifyIdentity?(
    consumerId: string,
    _params: Record<string, unknown>
  ): Promise<IdentityVerificationResult> {
    if (this.mode === "production") productionBlocked();

    return {
      success: false,
      verified: false,
      message:
        "[SANDBOX] SmartCredit does not support external identity verification. " +
        "Use SmartCredit's own identity verification at smartcredit.com.",
      providerName: "SmartCredit",
      mode: this.mode,
    };
  }

  // ── Data Retrieval ────────────────────────

  /**
   * SmartCredit has report_retrieval_supported=0 in the database.
   * Report retrieval is NOT supported — the intended flow is PDF upload.
   *
   * Sandbox: returns a graceful result with requiresPdfUpload flag.
   * Production: blocked (throws with authorization message).
   * Not configured: returns "not configured" result.
   */
  async retrieveReport?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<ReportResult> {
    if (this.mode === "production") productionBlocked();

    if (this.mode === "not_configured") {
      return {
        success: false,
        tradelines: [],
        inquiries: [],
        scores: [],
        requiresPdfUpload: true,
        message: "SmartCredit adapter is not configured. Set SMARTCREDIT_MODE to enable.",
        providerName: "SmartCredit",
        mode: "not_configured",
      };
    }

    // Sandbox: return graceful result directing to PDF upload
    return {
      success: false,
      tradelines: [],
      inquiries: [],
      scores: [],
      requiresPdfUpload: true,
      message:
        "SmartCredit does not support direct report retrieval. " +
        "Please download your SmartCredit 3-bureau report as a PDF from smartcredit.com " +
        "and use the PDF upload feature on this page.",
      providerName: "SmartCredit",
      mode: "sandbox",
    };
  }

  /**
   * SmartCredit does not support three-bureau API retrieval (three_bureau_supported=0).
   */
  async retrieveThreeBureauReport?(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<ThreeBureauReportResult> {
    if (this.mode === "production") productionBlocked();
    if (this.mode === "not_configured") {
      return {
        success: false,
        reports: {},
        message: "SmartCredit adapter is not configured.",
        providerName: "SmartCredit",
        mode: "not_configured",
      };
    }

    return {
      success: false,
      reports: {},
      message:
        "[SANDBOX] SmartCredit does not support three-bureau API retrieval. " +
        "Upload PDF reports for each bureau individually.",
      providerName: "SmartCredit",
      mode: "sandbox",
    };
  }

  /**
   * Retrieve credit scores from SmartCredit.
   *
   * Sandbox: returns synthetic FICO 8 and VantageScore 4.0 scores for all 3 bureaus.
   * Production: blocked until authorized.
   * Not configured: returns "not configured".
   */
  async retrieveScores?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<ScoreResult> {
    if (this.mode === "not_configured") {
      return {
        success: false,
        scores: [],
        message: "SmartCredit adapter is not configured.",
        providerName: "SmartCredit",
        mode: "not_configured",
      };
    }

    if (this.mode === "production") {
      productionBlocked();
    }

    // Sandbox: synthetic scores for all 3 bureaus
    const bureaus: Bureau[] = ["EQUIFAX", "EXPERIAN", "TRANSUNION"];
    const allScores: CreditScore[] = [];
    for (const b of bureaus) {
      allScores.push(...sandboxScores(b));
    }

    return {
      success: true,
      scores: allScores,
      message:
        "[SANDBOX] Synthetic SmartCredit scores for all 3 bureaus. " +
        "These are mock data for development and testing only.",
      providerName: "SmartCredit",
      mode: "sandbox",
    };
  }

  // ── Monitoring ────────────────────────────

  /**
   * SmartCredit does not support monitoring through this adapter.
   */
  async getMonitoringAlerts?(consumerId: string): Promise<MonitoringAlert[]> {
    return [];
  }

  // ── Maintenance ───────────────────────────

  /**
   * SmartCredit does not support report refresh (refresh_supported=0).
   */
  async refreshReport?(
    _consumerId: string,
    _reportId: string
  ): Promise<ReportResult> {
    if (this.mode === "production") productionBlocked();

    throw new Error(
      "SmartCredit does not support report refresh. " +
        "Download a new report from smartcredit.com and upload the PDF."
    );
  }

  /**
   * Disconnect a consumer from SmartCredit.
   *
   * Sandbox: mock disconnect.
   * Production: blocked.
   * Not configured: no-op message.
   */
  async disconnect?(consumerId: string): Promise<DisconnectResult> {
    if (this.mode === "production") productionBlocked();

    return {
      success: true,
      message:
        this.mode === "sandbox"
          ? `[SANDBOX] Mock disconnect for consumer ${consumerId}. No real connection to terminate.`
          : "SmartCredit adapter is not configured — nothing to disconnect.",
      providerName: "SmartCredit",
      mode: this.mode,
    };
  }

  // ── Webhooks ──────────────────────────────

  /**
   * SmartCredit does not support webhooks (webhooks_supported=0).
   */
  async handleWebhook?(
    _payload: Record<string, unknown>
  ): Promise<WebhookResult> {
    return {
      success: false,
      acknowledged: false,
      message: "SmartCredit does not support webhooks.",
      providerName: "SmartCredit",
    };
  }

  // ── Error Handling ────────────────────────

  /**
   * Handle adapter-level errors. Simple pass-through for now.
   */
  async handleError?(
    error: Error,
    _context: Record<string, unknown>
  ): Promise<ErrorHandlingResult> {
    return {
      handled: true,
      recovered: false,
      message: `SmartCredit adapter error: ${error.message}`,
      providerName: "SmartCredit",
    };
  }

  // ── Privacy / Compliance ──────────────────

  /**
   * Revoke consumer consent.
   */
  async revokeConsent?(consumerId: string): Promise<ConsentRevocationResult> {
    if (this.mode === "production") productionBlocked();

    return {
      success: true,
      revokedAt: new Date().toISOString(),
      message:
        this.mode === "sandbox"
          ? `[SANDBOX] Mock consent revocation for consumer ${consumerId}.`
          : "SmartCredit adapter is not configured.",
      providerName: "SmartCredit",
      mode: this.mode,
    };
  }

  /**
   * Delete provider data for a consumer.
   */
  async deleteProviderData?(consumerId: string): Promise<DataDeletionResult> {
    if (this.mode === "production") productionBlocked();

    return {
      success: true,
      deletedAt: new Date().toISOString(),
      recordsDeleted: 0,
      message:
        this.mode === "sandbox"
          ? `[SANDBOX] Mock data deletion for consumer ${consumerId}. No real data to delete.`
          : "SmartCredit adapter is not configured — no data to delete.",
      providerName: "SmartCredit",
      mode: this.mode,
    };
  }
}
