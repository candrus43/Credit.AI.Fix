// ──────────────────────────────────────────────
// CreditBridge — Mapping Admin API Routes
// ──────────────────────────────────────────────
//
// Super-admin endpoints for viewing and editing provider
// field mappings. No authentication middleware for initial release.
// ──────────────────────────────────────────────

import { Router, Request, Response } from "express";
import {
  getMapping,
  getAllMappings,
  hasMapping,
  setMapping,
  applyMappingEntry,
  FieldMapping,
  FieldMappingEntry,
} from "../normalization/mappings.js";
import {
  saveMappingVersion,
  getMappingVersions,
  getMappingVersion,
  rollbackMapping,
  getLatestMapping,
  getCurrentVersionInfo,
  seedInitialVersion,
  MappingStatus,
} from "../normalization/mapping-store.js";

const router = Router();

// ── Category names for the mapping domain ───────

const SECTION_NAMES: Record<string, string> = {
  personalInfo: "Personal Info",
  scores: "Scores",
  tradelines: "Tradelines",
  collections: "Collections",
  inquiries: "Inquiries",
  publicRecords: "Public Records",
};

// Canonical field list — all possible canonical field names across all sections,
// used for the field-selector dropdown.
const ALL_CANONICAL_FIELDS: string[] = [
  // personalInfo
  "fullName", "addressLine1", "addressLine2", "city", "state", "zip",
  "ssnLast4", "dateOfBirth", "phone", "employer",
  // scores
  "bureau", "score", "model", "date", "factors",
  // tradelines
  "creditorName", "originalCreditorName", "maskedAccountNumber", "accountType",
  "ownership", "accountStatus", "paymentStatus", "balance", "creditLimit",
  "pastDueAmount", "highBalance", "monthlyPayment", "dateOpened", "dateClosed",
  "dateReported", "dateOfLastActivity", "firstDelinquencyDate", "paymentHistory",
  "remarks", "disputeIndicator", "providerSpecificId",
  // collections
  "collectionAgency", "originalCreditor", "amount", "accountNumber",
  "dateAssigned", "status",
  // inquiries
  "inquiryDate", "companyName", "inquiryType",
  // publicRecords
  "recordType", "recordDate", "court", "referenceNumber",
];

// Transform function names
const TRANSFORM_NAMES: string[] = [
  "passthrough",
  "parseCurrency",
  "normalizeAccountType",
  "normalizeAccountStatus",
  "normalizePaymentStatus",
  "normalizeOwnership",
  "normalizeInquiryType",
  "normalizeRecordType",
  "parsePaymentHistory",
  "parseBoolean",
  "toDateString",
];

// ── Helpers ────────────────────────────────────

/** Extract the raw field names used by extraction patterns for a given provider.
 *  These are the "providerFieldNames" from the mapping entries, grouped by section. */
function extractRawFields(mapping: FieldMapping): Record<string, { fieldName: string; sampleValue: string | null; confidence: number }[]> {
  const result: Record<string, { fieldName: string; sampleValue: string | null; confidence: number }[]> = {};

  const sections: (keyof FieldMapping)[] = ["personalInfo", "scores", "tradelines", "collections", "inquiries", "publicRecords"];
  for (const section of sections) {
    const entries = mapping[section] as FieldMappingEntry[];
    result[section] = entries.map((entry) => ({
      fieldName: entry.providerFieldNames[0] || entry.canonicalField,
      sampleValue: null,
      confidence: 0.85,
    }));
  }

  return result;
}

/** Derive a user-friendly transform name from a FieldMappingEntry */
function getTransformName(entry: FieldMappingEntry): string {
  if (!entry.transformFn) return "passthrough";
  // We can't directly inspect the function name at runtime easily since
  // they are closures. Use a heuristic based on the canonical field.
  const cf = entry.canonicalField;
  if (cf === "balance" || cf === "creditLimit" || cf === "pastDueAmount" ||
      cf === "highBalance" || cf === "monthlyPayment" || cf === "amount") {
    return "parseCurrency";
  }
  if (cf === "accountType") return "normalizeAccountType";
  if (cf === "accountStatus") return "normalizeAccountStatus";
  if (cf === "paymentStatus") return "normalizePaymentStatus";
  if (cf === "ownership") return "normalizeOwnership";
  if (cf === "inquiryType") return "normalizeInquiryType";
  if (cf === "recordType") return "normalizeRecordType";
  if (cf === "paymentHistory") return "parsePaymentHistory";
  if (cf === "disputeIndicator") return "parseBoolean";
  if (cf === "dateOpened" || cf === "dateClosed" || cf === "dateReported" ||
      cf === "dateOfLastActivity" || cf === "firstDelinquencyDate" ||
      cf === "date" || cf === "dateAssigned" || cf === "inquiryDate" ||
      cf === "recordDate" || cf === "dateOfBirth") {
    return "toDateString";
  }
  if (cf === "score") return "parseCurrency";
  return "passthrough";
}

// ── Routes ─────────────────────────────────────

/**
 * GET /api/admin/mappings
 * Returns all provider mappings with version and timestamp info.
 */
router.get("/mappings", (_req: Request, res: Response) => {
  const all = getAllMappings();
  const result = all.map((mapping) => {
    const info = getCurrentVersionInfo(mapping.providerName);
    return {
      providerName: mapping.providerName,
      version: info?.version ?? mapping.version,
      lastUpdated: info?.timestamp ?? mapping.lastUpdated,
      status: info?.status ?? "approved",
      fieldCount: countFields(mapping),
    };
  });
  res.json(result);
});

/**
 * GET /api/admin/mappings/:providerName
 * Returns a single provider mapping with all field entries.
 */
router.get("/mappings/:providerName", (req: Request, res: Response) => {
  const name = req.params.providerName as string;
  try {
    const mapping = getMapping(name);
    const info = getCurrentVersionInfo(name);
    // Flatten entries with section context
    const sections: Record<string, { sectionName: string; entries: any[] }> = {};
    const sectionKeys: (keyof FieldMapping)[] = ["personalInfo", "scores", "tradelines", "collections", "inquiries", "publicRecords"];
    for (const key of sectionKeys) {
      const entries = (mapping[key] as FieldMappingEntry[]).map((e) => ({
        canonicalField: e.canonicalField,
        providerFieldNames: e.providerFieldNames,
        transformFn: getTransformName(e),
      }));
      sections[key] = {
        sectionName: SECTION_NAMES[key] || key,
        entries,
      };
    }

    res.json({
      providerName: mapping.providerName,
      version: info?.version ?? mapping.version,
      lastUpdated: info?.timestamp ?? mapping.lastUpdated,
      status: info?.status ?? "approved",
      sections,
      rawMapping: mapping,
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * GET /api/admin/mappings/:providerName/raw-fields
 * Returns provider's raw extraction fields.
 */
router.get("/mappings/:providerName/raw-fields", (req: Request, res: Response) => {
  const name = req.params.providerName as string;
  try {
    const mapping = getMapping(name);
    const rawFields = extractRawFields(mapping);

    // Flatten into a unified list with section context
    const flatFields: any[] = [];
    for (const [section, fields] of Object.entries(rawFields)) {
      for (const f of fields) {
        flatFields.push({
          section,
          sectionName: SECTION_NAMES[section] || section,
          fieldName: f.fieldName,
          sampleValue: f.sampleValue,
          confidence: f.confidence,
        });
      }
    }

    res.json({
      providerName: name,
      rawFields: flatFields,
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /api/admin/mappings/:providerName/test
 * Accepts raw data sample, applies current mapping, returns side-by-side result.
 */
router.post("/mappings/:providerName/test", (req: Request, res: Response) => {
  const name = req.params.providerName as string;
  const { sampleData, section } = req.body;

  if (!sampleData) {
    res.status(400).json({ error: "Missing sampleData in request body" });
    return;
  }

  try {
    const mapping = getMapping(name);
    const sectionKey = (section || "tradelines") as keyof FieldMapping;
    const entries = mapping[sectionKey] as FieldMappingEntry[];

    const results: { rawField: string; rawValue: unknown; transformedValue: unknown; canonicalField: string }[] = [];

    if (Array.isArray(sampleData)) {
      for (const record of sampleData) {
        for (const entry of entries) {
          const rawValue = findRawValue(record, entry.providerFieldNames);
          const transformed = rawValue !== undefined && entry.transformFn
            ? applyMappingEntry(record, entry)
            : rawValue;
          results.push({
            rawField: entry.providerFieldNames[0] || entry.canonicalField,
            rawValue: rawValue ?? null,
            transformedValue: transformed ?? null,
            canonicalField: entry.canonicalField,
          });
        }
      }
    } else {
      // Single record
      for (const entry of entries) {
        const rawValue = findRawValue(sampleData, entry.providerFieldNames);
        const transformed = rawValue !== undefined
          ? applyMappingEntry(sampleData, entry)
          : null;
        results.push({
          rawField: entry.providerFieldNames[0] || entry.canonicalField,
          rawValue: rawValue ?? null,
          transformedValue: transformed ?? null,
          canonicalField: entry.canonicalField,
        });
      }
    }

    res.json({ providerName: name, results });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/mappings/:providerName/update
 * Updates a provider's field mappings (in-memory + persisted version).
 */
router.post("/mappings/:providerName/update", (req: Request, res: Response) => {
  const name = req.params.providerName as string;
  const { mapping, status, changes, approvedBy } = req.body;

  if (!mapping) {
    res.status(400).json({ error: "Missing mapping in request body" });
    return;
  }

  try {
    // Update in-memory registry
    setMapping(mapping);

    // Persist version
    const mappingStatus: MappingStatus = status || "draft";
    const version = saveMappingVersion(
      name,
      mapping,
      approvedBy || "admin",
      mappingStatus,
      changes || "Manual mapping update"
    );

    res.json({
      success: true,
      providerName: name,
      version: version.version,
      status: version.status,
      timestamp: version.timestamp,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/mappings/:providerName/rollback
 * Rolls back to a previous mapping version.
 */
router.post("/mappings/:providerName/rollback", (req: Request, res: Response) => {
  const name = req.params.providerName as string;
  const { targetVersion } = req.body;

  if (!targetVersion) {
    res.status(400).json({ error: "Missing targetVersion in request body" });
    return;
  }

  try {
    const rolledBack = rollbackMapping(name, targetVersion, "admin");
    if (!rolledBack) {
      res.status(404).json({ error: `Version "${targetVersion}" not found for ${name}` });
      return;
    }

    // Update in-memory registry with rolled-back mapping
    setMapping(rolledBack);

    const info = getCurrentVersionInfo(name);

    res.json({
      success: true,
      providerName: name,
      version: info?.version,
      status: info?.status,
      timestamp: info?.timestamp,
      mapping: rolledBack,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/mappings/:providerName/versions
 * Lists all versions of a provider's mappings.
 */
router.get("/mappings/:providerName/versions", (req: Request, res: Response) => {
  const name = req.params.providerName as string;
  try {
    const versions = getMappingVersions(name);
    res.json({
      providerName: name,
      versions: versions.map((v) => ({
        version: v.version,
        timestamp: v.timestamp,
        status: v.status,
        changes: v.changes,
        approvedBy: v.approvedBy,
      })),
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * GET /api/admin/extraction-failures
 * Simulated extraction failures (for now).
 */
router.get("/extraction-failures", (_req: Request, res: Response) => {
  const simulatedFailures = [
    {
      id: "fail-001",
      providerName: "MyScoreIQ",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      section: "tradelines",
      rawText: "Balance: N/A",
      reason: "Could not parse currency value: 'N/A'",
      status: "unresolved",
    },
    {
      id: "fail-002",
      providerName: "IdentityIQ",
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      section: "personalInfo",
      rawText: "SSN: Not Provided",
      reason: "SSN pattern not matched",
      status: "unresolved",
    },
    {
      id: "fail-003",
      providerName: "SmartCredit",
      timestamp: new Date(Date.now() - 10800000).toISOString(),
      section: "scores",
      rawText: "Score: ---",
      reason: "Score field empty or malformed",
      status: "resolved",
    },
  ];

  res.json({
    failures: simulatedFailures,
    total: simulatedFailures.length,
  });
});

// ── Internal Helpers ───────────────────────────

function findRawValue(record: Record<string, unknown>, fieldNames: string[]): unknown {
  for (const fn of fieldNames) {
    if (fn in record && record[fn] !== undefined) {
      return record[fn];
    }
  }
  return undefined;
}

function countFields(mapping: FieldMapping): number {
  let count = 0;
  const sections: (keyof FieldMapping)[] = ["personalInfo", "scores", "tradelines", "collections", "inquiries", "publicRecords"];
  for (const s of sections) {
    const entries = mapping[s] as FieldMappingEntry[];
    count += entries.length;
  }
  return count;
}

export default router;
