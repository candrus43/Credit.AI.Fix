// ──────────────────────────────────────────────
// CreditBridge — IdentityIQ Provider Adapter
// ──────────────────────────────────────────────
//
// Mock adapter for IdentityIQ (identityiq.com).
// Starts in sandbox mode.
// Supports: enrollment, authentication, report retrieval (simulated).
// three_bureau_supported = 1.
// Uses MockAdapterBase scenarios for testing.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import { MockAdapterBase } from "../testing/mock-base.js";

export class IdentityIQAdapter extends MockAdapterBase {
  constructor(db?: Database) {
    super("IdentityIQ", "sandbox", db);
  }

  protected defaultCapabilities(): ProviderCapabilitiesRow {
    return {
      id: 11,
      provider_name: "IdentityIQ",
      provider_status: "sandbox",
      enrollment_supported: 1,
      authentication_supported: 1,
      oauth_supported: 0,
      report_retrieval_supported: 1,
      three_bureau_supported: 1,
      score_retrieval_supported: 0,
      monitoring_supported: 0,
      refresh_supported: 0,
      webhooks_supported: 0,
      sandbox_supported: 1,
      required_customer_consent: null,
      required_agreements: null,
      api_documentation_reference: "https://www.identityiq.com/",
      last_verification_date: null,
      production_approval_status: "pending",
      internal_notes:
        "[TEST] IdentityIQ mock adapter. Uses MockAdapterBase scenarios.",
      created_at: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString().split("T")[0],
    };
  }
}
