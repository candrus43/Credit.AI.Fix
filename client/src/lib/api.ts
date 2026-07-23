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
