// ──────────────────────────────────────────────
// CreditBridge — Provider Adapter Factory
// ──────────────────────────────────────────────
//
// Lazy-registry that maps provider names to adapter constructors.
// Adapters are instantiated only when first requested, then cached.
//
// To register a new adapter, add it to the ADAPTER_REGISTRY map.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { ProviderAdapter } from "./types.js";
import { SmartCreditAdapter } from "./smartcredit/adapter.js";
import { SyntheticAdapter } from "./synthetic/adapter.js";

type AdapterConstructor = new (db: Database) => ProviderAdapter;

/**
 * Registry of all known adapter constructors, keyed by provider name.
 * Names must match provider_capabilities.provider_name exactly.
 */
const ADAPTER_REGISTRY: Map<string, AdapterConstructor> = new Map<string, AdapterConstructor>([
  ["SmartCredit", SmartCreditAdapter],
  ["Synthetic", SyntheticAdapter],
]);

/**
 * Cache of instantiated adapters. Lazy — only created when first accessed.
 */
const adapterCache: Map<string, ProviderAdapter> = new Map();

/**
 * Get an adapter instance for a given provider name.
 *
 * Throws if no adapter is registered for the provider.
 * Adapters are instantiated lazily (only when first requested) and cached
 * for the lifetime of the process.
 *
 * @param providerName - Canonical provider name (matches DB provider_name).
 * @param db - Database connection (used by adapters for capability reads).
 * @returns The ProviderAdapter instance.
 */
export function getAdapter(
  providerName: string,
  db: Database
): ProviderAdapter {
  // Return cached instance if available
  const cached = adapterCache.get(providerName);
  if (cached) return cached;

  // Look up constructor
  const Constructor = ADAPTER_REGISTRY.get(providerName);
  if (!Constructor) {
    throw new Error(
      `No adapter available for ${providerName}. ` +
        "Adapters must be explicitly registered in the ADAPTER_REGISTRY map. " +
        `Available adapters: ${Array.from(ADAPTER_REGISTRY.keys()).join(", ")}`
    );
  }

  // Instantiate and cache
  const instance = new Constructor(db);
  adapterCache.set(providerName, instance);

  console.log(`[factory] Instantiated adapter: ${providerName}`);
  return instance;
}

/**
 * Check whether an adapter is registered for the given provider name.
 */
export function hasAdapter(providerName: string): boolean {
  return ADAPTER_REGISTRY.has(providerName);
}

/**
 * List all registered adapter names.
 */
export function listAdapters(): string[] {
  return Array.from(ADAPTER_REGISTRY.keys());
}
