// ──────────────────────────────────────────────
// CreditBridge — Normalization API Routes
// ──────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { normalizeReport } from "../normalization/engine.js";
import { matchAccountsByBureau } from "../normalization/matcher.js";
import {
  detectDiscrepancies,
  detectMissingAccounts,
  detectScoreDiscrepancies,
} from "../normalization/discrepancies.js";
import { saveNormalizedReport, getNormalizedReport } from "../normalization/store.js";
import { hasMapping, listMappings } from "../normalization/mappings.js";
import type {
  NormalizedReport,
  ExtractedReportData,
  CrossBureauMatch,
  Discrepancy,
} from "../normalization/schema.js";

const router = Router();

/**
 * POST /api/reports/normalize
 *
 * Accepts raw extracted credit report data and a provider name,
 * normalizes it into the canonical CreditBridge schema, performs
 * cross-bureau matching, and detects discrepancies.
 *
 * Request body:
 *   { providerName: string, rawData: ExtractedReportData }
 *
 * Response:
 *   { normalizedReport: NormalizedReport, crossBureauMatches: CrossBureauMatch[] }
 */
router.post("/normalize", (req: Request, res: Response) => {
  try {
    const { providerName, rawData } = req.body as {
      providerName: string;
      rawData: ExtractedReportData;
    };

    if (!providerName || !rawData) {
      res.status(400).json({
        error: "Missing required fields",
        message: "Request body must include 'providerName' and 'rawData'.",
      });
      return;
    }

    // Check if we have a mapping for this provider
    if (!hasMapping(providerName)) {
      res.status(400).json({
        error: "Unknown provider",
        message: `No field mapping registered for provider "${providerName}". Available mappings: ${listMappings().join(", ")}`,
      });
      return;
    }

    // Override the provider name in rawData if not already set
    const data: ExtractedReportData = {
      ...rawData,
      providerName: rawData.providerName || providerName,
    };

    // Run normalization
    const normalizedReport = normalizeReport(data, providerName);

    // Run cross-bureau matching
    // Build per-bureau tradeline map
    const bureauTradelines: Record<string, import("../normalization/schema.js").NormalizedTradeline[]> = {};
    for (const section of normalizedReport.bureauSections) {
      bureauTradelines[section.bureau] = section.tradelines;
    }

    const crossBureauMatches = matchAccountsByBureau(bureauTradelines);

    // Detect discrepancies within matched groups
    for (const match of crossBureauMatches) {
      match.discrepancies = detectDiscrepancies(match);
    }

    // Detect missing accounts
    const missingDiscrepancies = detectMissingAccounts(bureauTradelines, crossBureauMatches);

    // Detect score discrepancies
    const bureauScores: Record<string, import("../normalization/schema.js").NormalizedScore[]> = {};
    for (const section of normalizedReport.bureauSections) {
      bureauScores[section.bureau] = section.scores;
    }
    const scoreDiscrepancies = detectScoreDiscrepancies(bureauScores);

    // Attach cross-bureau results to the report
    normalizedReport.crossBureauMatches = crossBureauMatches;

    // Combine all discrepancies for the response
    const allDiscrepancies: Discrepancy[] = [
      ...missingDiscrepancies,
      ...scoreDiscrepancies,
    ];
    for (const match of crossBureauMatches) {
      allDiscrepancies.push(...match.discrepancies);
    }

    res.json({
      normalizedReport,
      crossBureauMatches,
      allDiscrepancies,
      stats: {
        bureauCount: normalizedReport.bureauSections.length,
        totalTradelines: normalizedReport.bureauSections.reduce(
          (sum, s) => sum + s.tradelines.length, 0
        ),
        totalScores: normalizedReport.bureauSections.reduce(
          (sum, s) => sum + s.scores.length, 0
        ),
        totalMatches: crossBureauMatches.length,
        totalDiscrepancies: allDiscrepancies.length,
        mappingVersion: normalizedReport.mappingVersion,
      },
    });
  } catch (err: any) {
    console.error("[normalize] Error normalizing report:", err);
    res.status(500).json({
      error: "Normalization failed",
      message: err.message || "An unexpected error occurred during normalization.",
    });
  }
});

/**
 * POST /api/reports/normalize-and-save
 *
 * Normalizes and persists the report in a single call.
 * Request body includes consumerId and reportId for DB persistence.
 */
router.post("/normalize-and-save", (req: Request, res: Response) => {
  try {
    const { providerName, rawData, consumerId, reportId } = req.body as {
      providerName: string;
      rawData: ExtractedReportData;
      consumerId: string;
      reportId?: number;
    };

    if (!providerName || !rawData) {
      res.status(400).json({
        error: "Missing required fields",
        message: "Request body must include 'providerName' and 'rawData'.",
      });
      return;
    }

    const db = getDb();
    const effectiveConsumerId = consumerId || "default";

    // If no reportId, create a reports row first
    let effectiveReportId = reportId;
    if (!effectiveReportId) {
      const insertReport = db.prepare(`
        INSERT INTO reports (
          consumer_id, provider_name, source_type, report_date, import_date,
          connection_status, three_bureau_available, consumer_confirmed,
          eligible_for_automated_analysis, parser_version
        ) VALUES (?, ?, ?, ?, datetime('now'), 'imported', ?, 0, 1, ?)
      `);

      const result = insertReport.run(
        effectiveConsumerId,
        providerName,
        "consumer_uploaded",
        rawData.reportDate || null,
        (rawData.bureauSections?.length ?? 0) >= 2 ? 1 : 0,
        "1.0.0"
      );
      effectiveReportId = Number(result.lastInsertRowid);
    }

    // Normalize
    const normalizedReport = normalizeReport(rawData, providerName);

    // Cross-bureau matching
    const bureauTradelines: Record<string, import("../normalization/schema.js").NormalizedTradeline[]> = {};
    for (const section of normalizedReport.bureauSections) {
      bureauTradelines[section.bureau] = section.tradelines;
    }
    const crossBureauMatches = matchAccountsByBureau(bureauTradelines);

    // Save to DB
    saveNormalizedReport(db, normalizedReport, effectiveConsumerId, effectiveReportId);

    res.json({
      reportId: effectiveReportId,
      normalized: true,
      saved: true,
      message: `Report #${effectiveReportId} normalized and saved.`,
      stats: {
        bureauCount: normalizedReport.bureauSections.length,
        totalTradelines: normalizedReport.bureauSections.reduce(
          (sum, s) => sum + s.tradelines.length, 0
        ),
        totalMatches: crossBureauMatches.length,
      },
    });
  } catch (err: any) {
    console.error("[normalize] Error in normalize-and-save:", err);
    res.status(500).json({
      error: "Normalization failed",
      message: err.message || "An unexpected error occurred.",
    });
  }
});

/**
 * GET /api/reports/:id/normalized
 *
 * Retrieves a previously normalized report from the database.
 */
router.get("/:id/normalized", (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const reportId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
    if (isNaN(reportId)) {
      res.status(400).json({ error: "Invalid report ID" });
      return;
    }

    const db = getDb();
    const report = getNormalizedReport(db, reportId);

    if (!report) {
      res.status(404).json({ error: "Normalized report not found" });
      return;
    }

    // Run cross-bureau matching on the retrieved report
    const bureauTradelines: Record<string, import("../normalization/schema.js").NormalizedTradeline[]> = {};
    for (const section of report.bureauSections) {
      bureauTradelines[section.bureau] = section.tradelines;
    }
    const crossBureauMatches = matchAccountsByBureau(bureauTradelines);
    for (const match of crossBureauMatches) {
      match.discrepancies = detectDiscrepancies(match);
    }
    report.crossBureauMatches = crossBureauMatches;

    res.json({ report });
  } catch (err: any) {
    console.error("[normalize] Error retrieving report:", err);
    res.status(500).json({
      error: "Retrieval failed",
      message: err.message || "An unexpected error occurred.",
    });
  }
});

export default router;
