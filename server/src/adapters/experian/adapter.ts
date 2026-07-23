// ──────────────────────────────────────────────
// CreditBridge — Experian Consumer Provider Adapter
// ──────────────────────────────────────────────
//
// Placeholder adapter for Experian Consumer direct integration.
// Starts as inactive/not_configured.
// All methods throw "Experian consumer integration not yet authorized [TEST]".
// three_bureau_supported = 1 (capability registered, not yet live).
// Uses MockAdapterBase scenarios for testing.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import { MockAdapterBase } from "../testing/mock-base.js";

const NOT_AUTHORIZED_MSG =
  "Experian consumer integration not yet authorized [TEST]. " +
  "Direct Experian consumer API access requires contractual agreement and credential provisioning.";

export class ExperianAdapter extends MockAdapterBase {
  constructor(db?: Database) {
    super("Experian Consumer", "not_configured", db);
  }

  protected defaultCapabilities(): ProviderCapabilitiesRow {
    return {
      id: 15,
      provider_name: "Experian Consumer",
      provider_status: "inactive",
      enrollment_supported: 0,
      authentication_supported: 0,
      oauth_supported: 0,
      report_retrieval_supported: 0,
      three_bureau_supported: 1,
      score_retrieval_supported: 0,
      monitoring_supported: 0,
      refresh_supported: 0,
      webhooks_supported: 0,
      sandbox_supported: 1,
      required_customer_consent: "FCRA-compliant consumer consent required",
      required_agreements: "Experian developer agreement",
      api_documentation_reference: "https://developer.experian.com/",
      last_verification_date: null,
      production_approval_status: "not_approved",
      internal_notes:
        "[TEST] Experian Consumer mock adapter. Integration not yet authorized. " +
        "Capability registered but adapter is inactive. Uses MockAdapterBase scenarios.",
      created_at: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString().split("T")[0],
    };
  }

  async enroll(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").EnrollmentResult> {
    this.recordCall("enroll", [consumerId, params]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async authorize(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").AuthorizationResult> {
    this.recordCall("authorize", [consumerId, params]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async verifyIdentity(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").IdentityVerificationResult> {
    this.recordCall("verifyIdentity", [consumerId, params]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async retrieveReport(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").ReportResult> {
    this.recordCall("retrieveReport", [consumerId, params]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async retrieveThreeBureauReport(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").ThreeBureauReportResult> {
    this.recordCall("retrieveThreeBureauReport", [consumerId, params]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async retrieveScores(
    consumerId: string,
    params: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").ScoreResult> {
    this.recordCall("retrieveScores", [consumerId, params]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async getMonitoringAlerts(
    consumerId: string
  ): Promise<import("@creditbridge/shared").MonitoringAlert[]> {
    this.recordCall("getMonitoringAlerts", [consumerId]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async refreshReport(
    consumerId: string,
    reportId: string
  ): Promise<import("@creditbridge/shared").ReportResult> {
    this.recordCall("refreshReport", [consumerId, reportId]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async disconnect(
    consumerId: string
  ): Promise<import("@creditbridge/shared").DisconnectResult> {
    this.recordCall("disconnect", [consumerId]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async revokeConsent(
    consumerId: string
  ): Promise<import("@creditbridge/shared").ConsentRevocationResult> {
    this.recordCall("revokeConsent", [consumerId]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async deleteProviderData(
    consumerId: string
  ): Promise<import("@creditbridge/shared").DataDeletionResult> {
    this.recordCall("deleteProviderData", [consumerId]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }

  async handleWebhook(
    payload: Record<string, unknown>
  ): Promise<import("@creditbridge/shared").WebhookResult> {
    this.recordCall("handleWebhook", [payload]);
    this.checkOutage();
    throw new Error(NOT_AUTHORIZED_MSG);
  }
}
