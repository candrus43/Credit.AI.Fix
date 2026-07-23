// ──────────────────────────────────────────────
// CreditBridge — Mapping Version Store
// ──────────────────────────────────────────────
//
// Persistent version store for provider field mappings.
// Versions are kept in memory and synced to JSON files at
// server/storage/mappings/{providerName}.json.
// ──────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { FieldMapping } from "./mappings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ──────────────────────────────────────

export type MappingStatus = "draft" | "pending_approval" | "approved" | "rolled_back";

export interface MappingVersion {
  version: string;
  timestamp: string;
  approvedBy?: string;
  status: MappingStatus;
  changes: string;
  mapping: FieldMapping;
}

// ── Storage ────────────────────────────────────

const STORAGE_DIR = path.resolve(__dirname, "../../storage/mappings");

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function getStoragePath(providerName: string): string {
  return path.join(STORAGE_DIR, `${providerName}.json`);
}

// ── In-Memory Cache ────────────────────────────

const versionCache: Map<string, MappingVersion[]> = new Map();

// ── Helpers ────────────────────────────────────

function nextVersion(existing: MappingVersion[]): string {
  if (existing.length === 0) return "1.0.0";
  const last = existing[existing.length - 1].version;
  const parts = last.split(".").map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join(".");
}

function loadFromDisk(providerName: string): MappingVersion[] {
  const filePath = getStoragePath(providerName);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw) as MappingVersion[];
    }
  } catch (err) {
    console.error(`[mapping-store] Failed to load ${providerName}:`, err);
  }
  return [];
}

function saveToDisk(providerName: string, versions: MappingVersion[]): void {
  ensureStorageDir();
  const filePath = getStoragePath(providerName);
  try {
    fs.writeFileSync(filePath, JSON.stringify(versions, null, 2), "utf-8");
  } catch (err) {
    console.error(`[mapping-store] Failed to save ${providerName}:`, err);
  }
}

function getCached(providerName: string): MappingVersion[] {
  const key = providerName.toLowerCase();
  if (!versionCache.has(key)) {
    versionCache.set(key, loadFromDisk(providerName));
  }
  return versionCache.get(key)!;
}

// ── Public API ──────────────────────────────────

/**
 * Save a new mapping version for a provider.
 * If a version with status 'draft' already exists as the latest, it will be
 * overwritten (convenience for iterative editing). Otherwise creates a new version.
 */
export function saveMappingVersion(
  providerName: string,
  mapping: FieldMapping,
  approvedBy?: string,
  status: MappingStatus = "draft",
  changes: string = "Manual mapping update"
): MappingVersion {
  const versions = getCached(providerName);

  // If latest version is a draft, overwrite it instead of creating a new one
  if (
    versions.length > 0 &&
    versions[versions.length - 1].status === "draft" &&
    status === "draft"
  ) {
    const updated = versions[versions.length - 1];
    updated.mapping = mapping;
    updated.timestamp = new Date().toISOString();
    updated.changes = changes;
    updated.approvedBy = approvedBy;
    saveToDisk(providerName, versions);
    return updated;
  }

  const newVersion: MappingVersion = {
    version: nextVersion(versions),
    timestamp: new Date().toISOString(),
    approvedBy,
    status,
    changes,
    mapping: JSON.parse(JSON.stringify(mapping)), // deep clone
  };

  versions.push(newVersion);
  saveToDisk(providerName, versions);
  return newVersion;
}

/**
 * Get all versions for a provider, newest last.
 */
export function getMappingVersions(providerName: string): MappingVersion[] {
  return getCached(providerName);
}

/**
 * Get a specific version's mapping.
 */
export function getMappingVersion(
  providerName: string,
  version: string
): FieldMapping | null {
  const versions = getCached(providerName);
  const found = versions.find((v) => v.version === version);
  return found ? found.mapping : null;
}

/**
 * Roll back to a specific version by creating a new version that
 * copies the mapping from the target version.
 */
export function rollbackMapping(
  providerName: string,
  targetVersion: string,
  approvedBy?: string
): FieldMapping | null {
  const versions = getCached(providerName);
  const target = versions.find((v) => v.version === targetVersion);
  if (!target) return null;

  const rollbackVersion: MappingVersion = {
    version: nextVersion(versions),
    timestamp: new Date().toISOString(),
    approvedBy,
    status: "approved",
    changes: `Rolled back to version ${targetVersion}`,
    mapping: JSON.parse(JSON.stringify(target.mapping)),
  };

  versions.push(rollbackVersion);
  saveToDisk(providerName, versions);
  return rollbackVersion.mapping;
}

/**
 * Seed the store with an initial version for a provider if no versions exist yet.
 */
export function seedInitialVersion(
  providerName: string,
  mapping: FieldMapping
): void {
  const versions = getCached(providerName);
  if (versions.length === 0) {
    const initial: MappingVersion = {
      version: mapping.version,
      timestamp: mapping.lastUpdated
        ? new Date(mapping.lastUpdated).toISOString()
        : new Date().toISOString(),
      approvedBy: "system",
      status: "approved",
      changes: "Initial mapping definition",
      mapping: JSON.parse(JSON.stringify(mapping)),
    };
    versions.push(initial);
    saveToDisk(providerName, versions);
  }
}

/**
 * Get the latest approved mapping for a provider, or the latest draft
 * if no approved version exists.
 */
export function getLatestMapping(providerName: string): FieldMapping | null {
  const versions = getCached(providerName);
  // Search from newest to oldest for an approved version
  for (let i = versions.length - 1; i >= 0; i--) {
    if (versions[i].status === "approved") {
      return versions[i].mapping;
    }
  }
  // Fallback to the newest version overall
  if (versions.length > 0) {
    return versions[versions.length - 1].mapping;
  }
  return null;
}

/**
 * Get the current (latest) version string and status.
 */
export function getCurrentVersionInfo(
  providerName: string
): { version: string; status: MappingStatus; timestamp: string } | null {
  const versions = getCached(providerName);
  if (versions.length === 0) return null;
  const latest = versions[versions.length - 1];
  return {
    version: latest.version,
    status: latest.status,
    timestamp: latest.timestamp,
  };
}
