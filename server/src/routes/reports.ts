// ──────────────────────────────────────────────
// CreditBridge — Report Retrieval API Routes
// ──────────────────────────────────────────────
//
// POST /api/reports/retrieve — fetch a report from a provider adapter
// GET  /api/reports/:id/data  — return full normalized report data
// ──────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { getDb } from "../db/connection.js";
import { getAdapter, hasAdapter } from "../adapters/factory.js";
import { normalizeReport } from "../normalization/engine.js";
import { matchAccountsByBureau } from "../normalization/matcher.js";
import {
  detectDiscrepancies,
  detectMissingAccounts,
  detectScoreDiscrepancies,
} from "../normalization/discrepancies.js";
import { saveNormalizedReport, getNormalizedReport } from "../normalization/store.js";
import type {
  ExtractedReportData,
  Discrepancy,
  NormalizedTradeline,
  NormalizedScore,
} from "../normalization/schema.js";
import type {
  ThreeBureauReportResult,
  ReportResult,
  Bureau,
} from "@creditbridge/shared";

const router = Router();

/**
 * POST /api/reports/retrieve
 *
 * Fetches a credit report from a provider adapter, saves the raw result,
 * normalizes it into the canonical CreditBridge schema, performs cross-bureau
 * matching, detects discrepancies, and persists everything to the database.
 *
 * Request body:
 *   { providerName: string, consumerId?: string }
 *
 * Response:
 *   { reportId, report: NormalizedReport, matches, discrepancies, stats }
 */
router.post("/retrieve", async (req: Request, res: Response) => {
  try {
    const { providerName, consumerId } = req.body as {
      providerName: string;
      consumerId?: string;
    };

    if (!providerName) {
      res.status(400).json({
        error: "Missing required field",
        message: "Request body must include 'providerName'.",
      });
      return;
    }

    const db = getDb();
    const effectiveConsumerId = consumerId || "default";

    // Validate adapter exists
    if (!hasAdapter(providerName)) {
      res.status(400).json({
        error: "Unknown provider",
        message: `No adapter registered for "${providerName}".`,
      });
      return;
    }

    const adapter = getAdapter(providerName, db);

    // ── Call adapter ──────────────────────────

    let adapterResult: ThreeBureauReportResult | ReportResult;

    if (adapter.retrieveThreeBureauReport) {
      adapterResult = await adapter.retrieveThreeBureauReport(
        effectiveConsumerId,
        {}
      );

      if (!adapterResult.success) {
        res.status(502).json({
          error: "Report retrieval failed",
          message:
            adapterResult.message || "Provider returned unsuccessful response.",
        });
        return;
      }
    } else if (adapter.retrieveReport) {
      adapterResult = await adapter.retrieveReport(effectiveConsumerId, {});

      if (!adapterResult.success) {
        res.status(502).json({
          error: "Report retrieval failed",
          message:
            adapterResult.message || "Provider returned unsuccessful response.",
        });
        return;
      }
    } else {
      res.status(400).json({
        error: "Unsupported operation",
        message: `${providerName} does not support report retrieval.`,
      });
      return;
    }

    // ── Convert adapter result to ExtractedReportData ──

    const rawData = convertAdapterResult(adapterResult, providerName);

    // ── Insert parent reports row ─────────────

    const bureauCount = (rawData.bureauSections?.length ?? 0) || estimateBureauCount(rawData);
    const insertReport = db.prepare(`
      INSERT INTO reports (
        consumer_id, provider_name, source_type, report_date, import_date,
        connection_status, three_bureau_available, consumer_confirmed,
        eligible_for_automated_analysis, parser_version
      ) VALUES (?, ?, ?, ?, datetime('now'), 'live_connected', ?, 0, 1, ?)
    `);

    const insertResult = insertReport.run(
      effectiveConsumerId,
      providerName,
      "synthetic",
      rawData.reportDate || null,
      bureauCount >= 2 ? 1 : 0,
      "1.0.0"
    );
    const reportId = Number(insertResult.lastInsertRowid);

    // ── Normalize ─────────────────────────────

    const normalizedReport = normalizeReport(rawData, providerName);
    normalizedReport.reportId = reportId;

    // ── Cross-bureau matching ─────────────────

    const bureauTradelines: Record<string, NormalizedTradeline[]> = {};
    for (const section of normalizedReport.bureauSections) {
      bureauTradelines[section.bureau] = section.tradelines;
    }

    const crossBureauMatches = matchAccountsByBureau(bureauTradelines);
    for (const match of crossBureauMatches) {
      match.discrepancies = detectDiscrepancies(match);
    }

    // Detect missing accounts
    const missingDiscrepancies = detectMissingAccounts(
      bureauTradelines,
      crossBureauMatches
    );

    // Detect score discrepancies
    const bureauScores: Record<string, NormalizedScore[]> = {};
    for (const section of normalizedReport.bureauSections) {
      bureauScores[section.bureau] = section.scores;
    }
    const scoreDiscrepancies = detectScoreDiscrepancies(bureauScores);

    // Combine all discrepancies
    const allDiscrepancies: Discrepancy[] = [
      ...missingDiscrepancies,
      ...scoreDiscrepancies,
    ];
    for (const match of crossBureauMatches) {
      allDiscrepancies.push(...match.discrepancies);
    }

    normalizedReport.crossBureauMatches = crossBureauMatches;

    // ── Persist normalized data ───────────────

    saveNormalizedReport(db, normalizedReport, effectiveConsumerId, reportId);

    // ── Respond ───────────────────────────────

    res.json({
      reportId,
      report: normalizedReport,
      matches: crossBureauMatches,
      discrepancies: allDiscrepancies,
      stats: {
        bureauCount: normalizedReport.bureauSections.length,
        totalTradelines: normalizedReport.bureauSections.reduce(
          (s, sec) => s + sec.tradelines.length,
          0
        ),
        totalScores: normalizedReport.bureauSections.reduce(
          (s, sec) => s + sec.scores.length,
          0
        ),
        totalMatches: crossBureauMatches.length,
        totalDiscrepancies: allDiscrepancies.length,
      },
    });
  } catch (err: any) {
    console.error("[reports] Error retrieving report:", err);
    res.status(500).json({
      error: "Report retrieval failed",
      message: err.message || "An unexpected error occurred.",
    });
  }
});

/**
 * GET /api/reports/:id/data
 *
 * Returns the full normalized report data for a given report ID,
 * including cross-bureau matching and discrepancies.
 */
router.get("/:id/data", (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const reportId = parseInt(
      Array.isArray(idParam) ? idParam[0] : idParam,
      10
    );
    if (isNaN(reportId)) {
      res.status(400).json({ error: "Invalid report ID" });
      return;
    }

    const db = getDb();
    const report = getNormalizedReport(db, reportId);

    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    // Run cross-bureau matching on retrieved report
    const bureauTradelines: Record<string, NormalizedTradeline[]> = {};
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
    console.error("[reports] Error fetching report data:", err);
    res.status(500).json({
      error: "Failed to fetch report data",
      message: err.message || "An unexpected error occurred.",
    });
  }
});

// ── Helpers ──────────────────────────────────────

/**
 * Convert a provider adapter result into the ExtractedReportData shape
 * that the normalization engine expects.
 *
 * We pass adapter data objects through directly — the field mappings handle
 * translating adapter-specific field names (e.g. "accountName", "currentBalance")
 * to canonical names (e.g. "creditorName", "balance").
 */
function convertAdapterResult(
  result: ThreeBureauReportResult | ReportResult,
  providerName: string
): ExtractedReportData {
  const extracted: ExtractedReportData = {
    providerName,
    reportDate: null,
    scores: [],
    tradelines: [],
    inquiries: [],
    collections: [],
    publicRecords: [],
  };

  const bureaus: Bureau[] = ["EQUIFAX", "EXPERIAN", "TRANSUNION"];

  // Determine if this is a three-bureau result
  const isThreeBureau = "reports" in result && result.reports;

  if (isThreeBureau) {
    const tbr = result as ThreeBureauReportResult;
    for (const bureau of bureaus) {
      const report = tbr.reports[bureau];
      if (!report) continue;

      if (!extracted.reportDate && report.reportDate) {
        extracted.reportDate = report.reportDate;
      }

      // Push adapter objects directly — field mappings handle translation
      for (const score of report.scores) {
        extracted.scores!.push(score as unknown as Record<string, unknown> as any);
      }
      for (const tl of report.tradelines) {
        extracted.tradelines!.push(tl as unknown as Record<string, unknown> as any);
      }
      for (const inq of report.inquiries) {
        extracted.inquiries!.push(inq as unknown as Record<string, unknown> as any);
      }
    }
  } else {
    const sr = result as ReportResult;
    extracted.reportDate = sr.reportDate || null;

    for (const score of sr.scores) {
      extracted.scores!.push(score as unknown as Record<string, unknown> as any);
    }
    for (const tl of sr.tradelines) {
      extracted.tradelines!.push(tl as unknown as Record<string, unknown> as any);
    }
    for (const inq of sr.inquiries) {
      extracted.inquiries!.push(inq as unknown as Record<string, unknown> as any);
    }
  }

  return extracted;
}

/** Estimate bureau count from data arrays. */
function estimateBureauCount(data: ExtractedReportData): number {
  const bureaus = new Set<string>();
  for (const s of data.scores ?? []) bureaus.add((s as any).bureau ?? "");
  for (const t of data.tradelines ?? []) bureaus.add((t as any).bureau ?? "");
  for (const i of data.inquiries ?? []) bureaus.add((i as any).bureau ?? "");
  bureaus.delete("");
  return bureaus.size;
}

export default router;
