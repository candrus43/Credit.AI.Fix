// ──────────────────────────────────────────────
// CreditBridge — MyScoreIQ Provider Adapter
// ──────────────────────────────────────────────
//
// Mock adapter for MyScoreIQ (myscoreiq.com).
// Starts in sandbox mode.
// Supports: enrollment, authentication, report retrieval (simulated),
//           score retrieval.
// three_bureau_supported = 1.
// Uses MockAdapterBase scenarios for testing.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import { MockAdapterBase } from "../testing/mock-base.js";

export class MyScoreIQAdapter extends MockAdapterBase {
  constructor(db?: Database) {
    super("MyScoreIQ", "sandbox", db);
  }

  protected defaultCapabilities(): ProviderCapabilitiesRow {
    return {
      id: 10,
      provider_name: "MyScoreIQ",
      provider_status: "sandbox",
      enrollment_supported: 1,
      authentication_supported: 1,
      oauth_supported: 0,
      report_retrieval_supported: 1,
      three_bureau_supported: 1,
      score_retrieval_supported: 1,
      monitoring_supported: 1,
      refresh_supported: 1,
      webhooks_supported: 0,
      sandbox_supported: 1,
      required_customer_consent: null,
      required_agreements: null,
      api_documentation_reference: "https://www.myscoreiq.com/",
      last_verification_date: null,
      production_approval_status: "pending",
      internal_notes:
        "[TEST] MyScoreIQ mock adapter. Uses MockAdapterBase scenarios.",
      created_at: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString().split("T")[0],
    };
  }
}
