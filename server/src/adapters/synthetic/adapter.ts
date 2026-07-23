// ──────────────────────────────────────────────
// CreditBridge — Synthetic Provider Adapter
// ──────────────────────────────────────────────
//
// The Synthetic provider (provider_status='active', production_approval_status
// ='approved' in the DB) is a fully-functional test adapter that generates
// realistic but clearly-labeled synthetic credit data for all three bureaus.
//
// This is the "Continue using synthetic test data" option from onboarding.
// All user-facing data fields are prefixed with "[SYNTHETIC]" to prevent
// any confusion with real consumer credit data.
//
// Capabilities:
//   - Single-bureau report retrieval
//   - Three-bureau report retrieval
//   - Score retrieval (FICO 8 + VantageScore 4.0 per bureau)
//   - Report refresh (generates fresh synthetic data)
//   - Monitoring alerts (synthetic)
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
  Inquiry,
  MonitoringAlert,
  ProviderCapabilitiesRow,
  ReportResult,
  ScoreResult,
  ThreeBureauReportResult,
  Tradeline,
  WebhookResult,
} from "@creditbridge/shared";
import type { ProviderAdapter } from "../types.js";

// ── Constants ───────────────────────────────

const SYNTHETIC = "[SYNTHETIC]";

// ── Tradeline Templates ─────────────────────

interface TradelineTemplate {
  accountName: string;
  accountType: string;
  creditLimit: number;
  paymentStatus: string;
}

const TRADELINE_TEMPLATES: TradelineTemplate[] = [
  {
    accountName: "Synthetic Bank Visa Signature",
    accountType: "Credit Card",
    creditLimit: 15000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Mastercard Platinum",
    accountType: "Credit Card",
    creditLimit: 8000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Auto Loan",
    accountType: "Auto Loan",
    creditLimit: 25000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Home Mortgage",
    accountType: "Mortgage",
    creditLimit: 320000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Student Loan",
    accountType: "Student Loan",
    creditLimit: 45000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Retail Card",
    accountType: "Credit Card",
    creditLimit: 3000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Personal Loan",
    accountType: "Personal Loan",
    creditLimit: 10000,
    paymentStatus: "Current",
  },
  {
    accountName: "Synthetic Home Equity Line",
    accountType: "HELOC",
    creditLimit: 75000,
    paymentStatus: "Current",
  },
];

const INQUIRY_COMPANIES = [
  "Synthetic Auto Finance Co.",
  "Synthetic Mortgage Lenders Inc.",
  "Synthetic Credit Union",
  "Synthetic Retail Bank",
  "Synthetic Card Services",
];

// ── Data Generators ─────────────────────────

function generatePaymentHistory(months: number): string[] {
  const statuses = ["OK", "OK", "OK", "OK", "OK", "OK", "OK", "OK", "30", "OK"];
  const history: string[] = [];
  for (let i = 0; i < months; i++) {
    history.push(statuses[Math.floor(Math.random() * statuses.length)]);
  }
  return history;
}

function generateTradelines(bureau: Bureau, count: number): Tradeline[] {
  const result: Tradeline[] = [];
  const shuffled = [...TRADELINE_TEMPLATES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  for (let i = 0; i < selected.length; i++) {
    const tmpl = selected[i];
    const dateOpened = new Date();
    dateOpened.setFullYear(dateOpened.getFullYear() - Math.floor(Math.random() * 8 + 1));
    dateOpened.setMonth(Math.floor(Math.random() * 12));

    result.push({
      id: `${SYNTHETIC}_TL_${bureau}_${i}_${Date.now()}`,
      accountName: `${SYNTHETIC} ${tmpl.accountName}`,
      accountNumber: `${SYNTHETIC}_****${Math.floor(1000 + Math.random() * 9000)}`,
      accountType: tmpl.accountType,
      dateOpened: dateOpened.toISOString().split("T")[0],
      creditLimit: tmpl.creditLimit,
      highBalance: Math.floor(tmpl.creditLimit * (0.3 + Math.random() * 0.6)),
      currentBalance: Math.floor(tmpl.creditLimit * Math.random() * 0.5),
      monthlyPayment: Math.floor(tmpl.creditLimit * 0.02 + Math.random() * 200),
      paymentStatus: tmpl.paymentStatus,
      paymentHistory: generatePaymentHistory(24),
      isDisputed: false,
      bureau,
      dataLabel: SYNTHETIC,
    });
  }

  return result;
}

function generateInquiries(bureau: Bureau, count: number): Inquiry[] {
  const result: Inquiry[] = [];
  const shuffled = [...INQUIRY_COMPANIES].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const inquiryDate = new Date();
    inquiryDate.setMonth(inquiryDate.getMonth() - Math.floor(Math.random() * 12));

    result.push({
      id: `${SYNTHETIC}_INQ_${bureau}_${i}_${Date.now()}`,
      inquiryDate: inquiryDate.toISOString().split("T")[0],
      inquiringCompany: `${SYNTHETIC} ${shuffled[i]}`,
      inquiryType: Math.random() > 0.3 ? "hard" : "soft",
      bureau,
      dataLabel: SYNTHETIC,
    });
  }

  return result;
}

function generateScores(bureau: Bureau): CreditScore[] {
  const baseScore =
    bureau === "EQUIFAX" ? 720 : bureau === "EXPERIAN" ? 735 : 708;

  return [
    {
      score: baseScore + Math.floor(Math.random() * 10 - 5),
      scoreType: "FICO",
      scoreModel: "FICO 8",
      bureau,
      date: new Date().toISOString().split("T")[0],
      dataLabel: SYNTHETIC,
    },
    {
      score: baseScore - 5 + Math.floor(Math.random() * 10),
      scoreType: "VantageScore",
      scoreModel: "VantageScore 4.0",
      bureau,
      date: new Date().toISOString().split("T")[0],
      dataLabel: SYNTHETIC,
    },
  ];
}

function generateReport(bureau: Bureau): ReportResult {
  return {
    success: true,
    reportId: `${SYNTHETIC}_RPT_${bureau}_${Date.now()}`,
    bureau,
    reportDate: new Date().toISOString().split("T")[0],
    tradelines: generateTradelines(bureau, 5 + Math.floor(Math.random() * 4)),
    inquiries: generateInquiries(bureau, 1 + Math.floor(Math.random() * 3)),
    scores: generateScores(bureau),
    message: `[SYNTHETIC] Synthetic ${bureau} credit report for development and testing only. Not real consumer data.`,
    providerName: "Synthetic",
    mode: "sandbox",
  };
}

// ── Adapter Class ───────────────────────────

export class SyntheticAdapter implements ProviderAdapter {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // ── Identity ──────────────────────────────

  async getProviderName(): Promise<string> {
    return "Synthetic";
  }

  async getCapabilities(): Promise<ProviderCapabilitiesRow> {
    const row = this.db
      .prepare("SELECT * FROM provider_capabilities WHERE provider_name = ?")
      .get("Synthetic") as ProviderCapabilitiesRow | undefined;

    return (
      row ?? {
        id: 8,
        provider_name: "Synthetic",
        provider_status: "active",
        enrollment_supported: 0,
        authentication_supported: 0,
        oauth_supported: 0,
        report_retrieval_supported: 1,
        three_bureau_supported: 1,
        score_retrieval_supported: 1,
        monitoring_supported: 0,
        refresh_supported: 1,
        webhooks_supported: 0,
        sandbox_supported: 1,
        required_customer_consent: null,
        required_agreements: null,
        api_documentation_reference: null,
        last_verification_date: null,
        production_approval_status: "approved",
        internal_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );
  }

  async getMode(): Promise<AdapterMode> {
    return "sandbox";
  }

  // ── Lifecycle ─────────────────────────────

  /**
   * Synthetic provider does not support real enrollment.
   * It's always available as a test data source.
   */
  async enroll?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<EnrollmentResult> {
    return {
      success: false,
      message: "[SYNTHETIC] Synthetic provider does not require enrollment — it is always available for testing.",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  async authorize?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<AuthorizationResult> {
    return {
      success: true,
      authorized: true,
      message: "[SYNTHETIC] Synthetic provider is always authorized. No real credentials needed.",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  async verifyIdentity?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<IdentityVerificationResult> {
    return {
      success: true,
      verified: true,
      verificationId: `${SYNTHETIC}_VERIFY_${Date.now()}`,
      message: "[SYNTHETIC] Identity verification bypassed for synthetic provider.",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  // ── Data Retrieval ────────────────────────

  /**
   * Retrieve a single synthetic credit report for a given bureau.
   * Defaults to EQUIFAX if no bureau specified.
   */
  async retrieveReport?(
    _consumerId: string,
    params: Record<string, unknown>
  ): Promise<ReportResult> {
    const bureau: Bureau =
      (params.bureau as Bureau) ?? "EQUIFAX";
    return generateReport(bureau);
  }

  /**
   * Retrieve synthetic reports for all three bureaus at once.
   */
  async retrieveThreeBureauReport?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<ThreeBureauReportResult> {
    return {
      success: true,
      reports: {
        EQUIFAX: generateReport("EQUIFAX"),
        EXPERIAN: generateReport("EXPERIAN"),
        TRANSUNION: generateReport("TRANSUNION"),
      },
      message:
        "[SYNTHETIC] Synthetic three-bureau credit report. " +
        "All data is computer-generated for development and testing only.",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  /**
   * Retrieve synthetic FICO 8 and VantageScore 4.0 scores for all 3 bureaus.
   */
  async retrieveScores?(
    _consumerId: string,
    _params: Record<string, unknown>
  ): Promise<ScoreResult> {
    const bureaus: Bureau[] = ["EQUIFAX", "EXPERIAN", "TRANSUNION"];
    const allScores: CreditScore[] = [];
    for (const b of bureaus) {
      allScores.push(...generateScores(b));
    }

    return {
      success: true,
      scores: allScores,
      message: "[SYNTHETIC] Synthetic credit scores for all 3 bureaus.",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  // ── Monitoring ────────────────────────────

  /**
   * Return synthetic monitoring alerts.
   */
  async getMonitoringAlerts?(_consumerId: string): Promise<MonitoringAlert[]> {
    return [
      {
        id: `${SYNTHETIC}_ALERT_1_${Date.now()}`,
        alertType: "score_change",
        severity: "low",
        title: "[SYNTHETIC] Score Change Detected",
        description:
          "[SYNTHETIC] Your Experian FICO 8 score increased by 3 points. This is synthetic test data.",
        detectedAt: new Date().toISOString(),
        bureau: "EXPERIAN",
        providerName: "Synthetic",
        dataLabel: SYNTHETIC,
      },
      {
        id: `${SYNTHETIC}_ALERT_2_${Date.now()}`,
        alertType: "new_inquiry",
        severity: "medium",
        title: "[SYNTHETIC] New Inquiry Detected",
        description:
          "[SYNTHETIC] A new hard inquiry was reported on your TransUnion report. This is synthetic test data.",
        detectedAt: new Date(Date.now() - 86400000).toISOString(),
        bureau: "TRANSUNION",
        providerName: "Synthetic",
        dataLabel: SYNTHETIC,
      },
    ];
  }

  // ── Maintenance ───────────────────────────

  /**
   * Refresh — generates fresh synthetic data for the given report.
   */
  async refreshReport?(
    _consumerId: string,
    _reportId: string
  ): Promise<ReportResult> {
    return generateReport("EQUIFAX");
  }

  async disconnect?(_consumerId: string): Promise<DisconnectResult> {
    return {
      success: true,
      message:
        "[SYNTHETIC] Synthetic provider disconnected (noop — no real connection existed).",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  // ── Webhooks ──────────────────────────────

  async handleWebhook?(
    _payload: Record<string, unknown>
  ): Promise<WebhookResult> {
    return {
      success: false,
      acknowledged: false,
      message: "[SYNTHETIC] Synthetic provider does not support webhooks.",
      providerName: "Synthetic",
    };
  }

  // ── Error Handling ────────────────────────

  async handleError?(
    error: Error,
    _context: Record<string, unknown>
  ): Promise<ErrorHandlingResult> {
    return {
      handled: true,
      recovered: true,
      message: `[SYNTHETIC] Synthetic provider error handled (noop): ${error.message}`,
      providerName: "Synthetic",
    };
  }

  // ── Privacy / Compliance ──────────────────

  async revokeConsent?(_consumerId: string): Promise<ConsentRevocationResult> {
    return {
      success: true,
      revokedAt: new Date().toISOString(),
      message:
        "[SYNTHETIC] Synthetic provider consent revoked (noop — no real consent was stored).",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }

  async deleteProviderData?(_consumerId: string): Promise<DataDeletionResult> {
    return {
      success: true,
      deletedAt: new Date().toISOString(),
      recordsDeleted: 0,
      message:
        "[SYNTHETIC] Synthetic provider data deleted (noop — no real data was stored).",
      providerName: "Synthetic",
      mode: "sandbox",
    };
  }
}
