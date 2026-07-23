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
