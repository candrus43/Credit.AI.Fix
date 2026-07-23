/**
 * API client for CreditBridge backend.
 */

import type { ProviderCapabilitiesRow } from "@creditbridge/shared";

const BASE_URL = "/api";

export async function getHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch all active + sandbox providers from the CapabilityRegistry.
 */
export async function fetchProviders(): Promise<ProviderCapabilitiesRow[]> {
  const res = await fetch(`${BASE_URL}/providers`);
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`);
  return res.json();
}

/**
 * Fetch a single provider's capabilities by name.
 */
export async function fetchProvider(name: string): Promise<ProviderCapabilitiesRow> {
  const res = await fetch(`${BASE_URL}/providers/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to fetch provider "${name}": ${res.status}`);
  return res.json();
}

// ── Auth API ──────────────────────────────────

export interface AuthStatus {
  status: string;
  authorizedScopes: string[];
  connectedAt: string | null;
  lastRefresh: string | null;
  consentVersion: string | null;
}

/**
 * Fetch authorization status for a consumer + provider.
 */
export async function fetchAuthStatus(
  consumerId: string,
  providerName: string
): Promise<AuthStatus> {
  const res = await fetch(
    `${BASE_URL}/auth/status/${encodeURIComponent(consumerId)}/${encodeURIComponent(providerName)}`
  );
  if (!res.ok) throw new Error(`Failed to fetch auth status: ${res.status}`);
  return res.json();
}

/**
 * Disconnect a consumer from a provider.
 */
export async function disconnectProvider(
  consumerId: string,
  providerName: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/auth/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consumerId, providerName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `Disconnect failed (${res.status})`);
  }
  return res.json();
}

// ── Report API ──────────────────────────────────

export interface ReportMetadata {
  id: number;
  consumer_id: string;
  provider_name: string;
  source_type: string;
  report_date: string | null;
  import_date: string;
  connection_status: string;
  three_bureau_available: number;
  consumer_confirmed: number;
  eligible_for_automated_analysis: number;
  parser_version: string;
  original_response_path: string | null;
}

/**
 * Fetch report metadata by ID.
 */
export async function fetchReport(id: number | string): Promise<ReportMetadata> {
  const res = await fetch(`${BASE_URL}/reports/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to fetch report: ${res.status}`);
  }
  return res.json();
}

/**
 * Confirm report data with optional field corrections.
 */
export async function confirmReport(
  id: number | string,
  correctedFields?: Record<string, unknown>
): Promise<{ reportId: number; confirmed: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/reports/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correctedFields }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Confirmation failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Normalize extracted report data (cross-bureau matching + discrepancies).
 */
export async function normalizeReportData(rawData: Record<string, unknown>, providerName: string) {
  const res = await fetch(`${BASE_URL}/reports/normalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerName, rawData }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Normalization failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Upload a PDF credit report.
 */
export async function uploadReport(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}/reports/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Upload failed: ${res.status}`);
  }
  return res.json();
}
