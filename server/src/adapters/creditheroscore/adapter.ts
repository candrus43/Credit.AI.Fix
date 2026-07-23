// ──────────────────────────────────────────────
// CreditBridge — Credit Hero Score Provider Adapter
// ──────────────────────────────────────────────
//
// Mock adapter for Credit Hero Score.
// Starts in sandbox mode.
// Supports: enrollment (referral only), no direct report retrieval.
// three_bureau_supported = 0.
// Uses MockAdapterBase scenarios for testing.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import { MockAdapterBase } from "../testing/mock-base.js";

export class CreditHeroScoreAdapter extends MockAdapterBase {
  constructor(db?: Database) {
    super("Credit Hero Score", "sandbox", db);
  }

  protected defaultCapabilities(): ProviderCapabilitiesRow {
    return {
      id: 12,
      provider_name: "Credit Hero Score",
      provider_status: "sandbox",
      enrollment_supported: 1,
      authentication_supported: 0,
      oauth_supported: 0,
      report_retrieval_supported: 0,
      three_bureau_supported: 0,
      score_retrieval_supported: 1,
      monitoring_supported: 0,
      refresh_supported: 0,
      webhooks_supported: 0,
      sandbox_supported: 1,
      required_customer_consent: null,
      required_agreements: null,
      api_documentation_reference: "https://www.creditheroscore.com/",
      last_verification_date: null,
      production_approval_status: "pending",
      internal_notes:
        "[TEST] Credit Hero Score mock adapter. Referral-only enrollment, no direct report retrieval. Uses MockAdapterBase scenarios.",
      created_at: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString().split("T")[0],
    };
  }

  /**
   * Credit Hero Score only supports referral-based enrollment — no API enrollment.
   */
  async enroll(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").EnrollmentResult> {
    this.recordCall("enroll", [consumerId, params]);
    this.checkOutage();

    return {
      success: true,
      enrollmentId: `[TEST]_CHS_REFERRAL_${consumerId}_${Date.now()}`,
      referralLink:
        "https://www.creditheroscore.com/signup?ref=creditbridge&test=true",
      message:
        `[TEST] Credit Hero Score enrollment is referral-only. ` +
        `Consumer ${consumerId} referred to creditheroscore.com. No API enrollment available.`,
      providerName: this.providerName,
      mode: this.mode,
    };
  }

  /**
   * Credit Hero Score does not support report retrieval.
   */
  async retrieveReport(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").ReportResult> {
    this.recordCall("retrieveReport", [consumerId, params]);
    this.checkOutage();

    return {
      success: false,
      tradelines: [],
      inquiries: [],
      scores: [],
      message:
        `[TEST] Credit Hero Score does not support direct report retrieval. ` +
        "Use the referral link to sign up, then upload your PDF report. " +
        "[TEST: Credit Hero Score — no report retrieval]",
      providerName: this.providerName,
      mode: this.mode,
      requiresPdfUpload: true,
    };
  }

  /**
   * Credit Hero Score does not support three-bureau report retrieval.
   */
  async retrieveThreeBureauReport(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").ThreeBureauReportResult> {
    this.recordCall("retrieveThreeBureauReport", [consumerId, params]);
    this.checkOutage();

    return {
      success: false,
      reports: {},
      message:
        "[TEST] Credit Hero Score does not support three-bureau report retrieval. " +
        "Upload PDF reports individually.",
      providerName: this.providerName,
      mode: this.mode,
    };
  }
}
