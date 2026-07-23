// ──────────────────────────────────────────────
// CreditBridge — Provider Capability Registry
// ──────────────────────────────────────────────
//
// Reads provider capabilities from the provider_capabilities database table
// and caches them in memory. Provides filtered, safe access to provider
// metadata for routing, capability checks, and UI display.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";

/**
 * In-memory cache of provider capability rows, keyed by provider_name.
 */
type CapabilityCache = Map<string, ProviderCapabilitiesRow>;

/**
 * The CapabilityRegistry reads provider capability records from the
 * database and caches them in memory for fast, repeated access.
 *
 * Usage:
 *   const registry = new CapabilityRegistry(getDb());
 *   await registry.refreshRegistry();
 *   const caps = registry.getProviderCapabilities("SmartCredit");
 */
export class CapabilityRegistry {
  private db: Database;
  private cache: CapabilityCache = new Map();

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Get capabilities for a single provider. Returns undefined if the
   * provider is not found in the registry.
   */
  getProviderCapabilities(providerName: string): ProviderCapabilitiesRow | undefined {
    return this.cache.get(providerName);
  }

  /**
   * Get all providers, optionally filtered by status.
   * By default returns only "active" and "sandbox" providers.
   * Pass `includeAll = true` to include inactive, pending, and deprecated.
   */
  getAllProviders(includeAll = false): ProviderCapabilitiesRow[] {
    const all = Array.from(this.cache.values());
    if (includeAll) return all;
    return all.filter(
      (r) => r.provider_status === "active" || r.provider_status === "sandbox"
    );
  }

  /**
   * Get only providers that are "active" (production-ready).
   */
  getActiveProviders(): ProviderCapabilitiesRow[] {
    return Array.from(this.cache.values()).filter(
      (r) => r.provider_status === "active"
    );
  }

  /**
   * Refresh the entire cache from the database.
   * Call on startup and whenever provider capabilities are updated.
   */
  refreshRegistry(): void {
    const rows = this.db
      .prepare("SELECT * FROM provider_capabilities")
      .all() as ProviderCapabilitiesRow[];

    const newCache: CapabilityCache = new Map();
    for (const row of rows) {
      newCache.set(row.provider_name, row);
    }
    this.cache = newCache;

    console.log(
      `[registry] Refreshed provider capabilities: ${rows.length} providers loaded`
    );
  }

  /**
   * Reload a single provider's capabilities from the database.
   */
  refreshProvider(providerName: string): ProviderCapabilitiesRow | undefined {
    const row = this.db
      .prepare("SELECT * FROM provider_capabilities WHERE provider_name = ?")
      .get(providerName) as ProviderCapabilitiesRow | undefined;

    if (row) {
      this.cache.set(row.provider_name, row);
    }

    return row;
  }
}
