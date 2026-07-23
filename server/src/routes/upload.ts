// ──────────────────────────────────────────────
// CreditBridge — PDF Upload API Routes
// ──────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { getDb } from "../db/connection.js";
import { detectProviderFormat } from "../pdf/detector.js";
import {
  extractReportDate,
  extractBureauSections,
  extractPersonalInfo,
  extractScores,
  extractTradelines,
  extractCollections,
  extractInquiries,
  extractPublicRecords,
  extractRemarks,
} from "../pdf/extractor.js";
import type {
  ExtractedPersonalInfo,
  ExtractedScore,
  Tradeline,
  Collection,
  Inquiry,
  PublicRecord,
} from "../pdf/extractor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STORAGE_ROOT = join(__dirname, "..", "..", "storage");
const REPORTS_DIR = join(STORAGE_ROOT, "reports");

// ── Multer configuration ───────────────────────

/**
 * Ensure the reports storage directory exists.
 */
export function ensureStorageDir(): void {
  mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Configure multer for PDF uploads with:
 * - Custom file filter: PDF magic bytes validation (not just extension)
 * - 25MB max file size
 * - UUID-based filenames
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureStorageDir();
      cb(null, REPORTS_DIR);
    },
    filename: (_req, _file, cb) => {
      const uuid = randomUUID();
      cb(null, `${uuid}.pdf`);
    },
  }),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (_req, file, cb) => {
    // Validate by extension first (fast check)
    const ext = file.originalname?.toLowerCase().split(".").pop();
    if (ext !== "pdf") {
      cb(new MulterError("INVALID_FILE_TYPE", "Only PDF files are accepted."));
      return;
    }
    cb(null, true);
  },
});

// ── Custom Multer Error ────────────────────────

class MulterError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MulterError";
  }
}

// ── Helpers ────────────────────────────────────

/**
 * Validate PDF magic bytes: a valid PDF must start with "%PDF-".
 * Reads the first 5 bytes of the file.
 */
function validatePdfMagicBytes(filePath: string): boolean {
  try {
    const buffer = readFileSync(filePath, { flag: "r" });
    if (buffer.length < 5) return false;
    // PDF magic: %PDF- (hex: 25 50 44 46 2D)
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  } catch {
    return false;
  }
}

/**
 * Compute an overall extraction confidence score from all extracted data.
 */
function computeOverallConfidence(
  personalInfo: ExtractedPersonalInfo,
  scores: ExtractedScore[],
  tradelines: Tradeline[],
  collections: Collection[],
  inquiries: Inquiry[],
  publicRecords: PublicRecord[],
  remarks: string[]
): number {
  const scores_arr: number[] = [];

  // Personal info confidence
  const piConf = Object.values(personalInfo.confidence);
  scores_arr.push(...piConf);

  // Score confidence
  for (const s of scores) scores_arr.push(s.confidence);

  // Tradeline confidence
  for (const tl of tradelines) scores_arr.push(tl.confidence);

  // Collection confidence
  for (const col of collections) scores_arr.push(col.confidence);

  // Inquiry confidence
  for (const inq of inquiries) scores_arr.push(inq.confidence);

  // Public record confidence
  for (const pr of publicRecords) scores_arr.push(pr.confidence);

  // Remarks: 0.8 each as they're simple text matches
  for (const _ of remarks) scores_arr.push(0.8);

  if (scores_arr.length === 0) return 0;

  const sum = scores_arr.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores_arr.length) * 100) / 100;
}

// ── Router ─────────────────────────────────────

const router = Router();

/**
 * POST /api/reports/upload
 *
 * Accepts a PDF credit report file, extracts its contents, identifies
 * the provider format, and returns structured data with confidence scores.
 */
router.post(
  "/upload",
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        // Handle multer errors
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({
              error: "File too large",
              message: "The uploaded file exceeds the 25MB size limit.",
            });
            return;
          }
          res.status(400).json({
            error: "Upload error",
            message: err.message,
          });
          return;
        }
        if (err instanceof MulterError) {
          const status = err.code === "INVALID_FILE_TYPE" ? 400 : 500;
          res.status(status).json({
            error: err.code === "INVALID_FILE_TYPE" ? "Invalid file type" : "Upload error",
            message: err.message,
          });
          return;
        }
        res.status(500).json({
          error: "Upload failed",
          message: "An unexpected error occurred during file upload.",
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: "No file provided",
        message: "Please upload a PDF credit report file.",
      });
      return;
    }

    const filePath = file.path;

    // ── Validate PDF magic bytes ───────────────
    if (!validatePdfMagicBytes(filePath)) {
      // Remove the invalid file
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(filePath);
      } catch { /* ignore cleanup errors */ }
      
      res.status(400).json({
        error: "Invalid file type",
        message: "The uploaded file is not a valid PDF. Only PDF files are accepted.",
      });
      return;
    }

    try {
      // ── Extract PDF text ─────────────────────
      // pdf-parse v1.x is a CJS module; use createRequire for Bun compat
      const req = createRequire(import.meta.url);
      const pdfParse = req("pdf-parse");
      const dataBuffer = readFileSync(filePath);
      let pdfData: { text: string; numpages: number; info: Record<string, unknown> };

      try {
        pdfData = await pdfParse(dataBuffer);
      } catch (parseErr: any) {
        // Remove the file on parse failure
        try {
          const { unlinkSync } = await import("node:fs");
          unlinkSync(filePath);
        } catch { /* ignore */ }

        res.status(422).json({
          error: "Could not parse PDF",
          message:
            "Could not parse PDF. The file may be encrypted, scanned, or corrupted.",
        });
        return;
      }

      const pdfText = pdfData.text || "";
      if (pdfText.trim().length === 0) {
        res.status(422).json({
          error: "Could not parse PDF",
          message:
            "Could not parse PDF. The file may be encrypted, scanned, or corrupted.",
        });
        return;
      }

      // ── Detect provider format ───────────────
      const formatResult = detectProviderFormat(pdfText);

      // ── Extract report date ──────────────────
      const reportDate = extractReportDate(pdfText);

      // ── Split into bureau sections ───────────
      const bureauSections = extractBureauSections(pdfText);

      // ── Extract personal info ────────────────
      // Use the first portion of the text (typically contains personal info)
      const headerText = pdfText.slice(0, Math.min(3000, pdfText.length));
      const personalInfo = extractPersonalInfo(headerText);

      // ── Extract scores ───────────────────────
      const allScores = extractScores(pdfText);

      // ── Extract tradelines per bureau ────────
      let allTradelines: (Tradeline & { bureau: string })[] = [];
      for (const section of bureauSections) {
        const tls = extractTradelines(section.text);
        for (const tl of tls) {
          allTradelines.push({ ...tl, bureau: section.bureau });
        }
      }

      // ── Extract collections per bureau ───────
      let allCollections: (Collection & { bureau: string })[] = [];
      for (const section of bureauSections) {
        const cols = extractCollections(section.text);
        for (const col of cols) {
          allCollections.push({ ...col, bureau: section.bureau });
        }
      }

      // ── Extract inquiries per bureau ─────────
      let allInquiries: (Inquiry & { bureau: string })[] = [];
      for (const section of bureauSections) {
        const inqs = extractInquiries(section.text);
        for (const inq of inqs) {
          allInquiries.push({ ...inq, bureau: section.bureau });
        }
      }

      // ── Extract public records per bureau ────
      let allPublicRecords: (PublicRecord & { bureau: string })[] = [];
      for (const section of bureauSections) {
        const prs = extractPublicRecords(section.text);
        for (const pr of prs) {
          allPublicRecords.push({ ...pr, bureau: section.bureau });
        }
      }

      // ── Extract remarks ──────────────────────
      const allRemarks: string[] = [];
      for (const section of bureauSections) {
        allRemarks.push(...extractRemarks(section.text));
      }

      // ── Compute overall confidence ───────────
      const overallConfidence = computeOverallConfidence(
        personalInfo,
        allScores,
        allTradelines,
        allCollections,
        allInquiries,
        allPublicRecords,
        allRemarks
      );

      // ── Insert report record into DB ─────────
      const db = getDb();
      const relativePath = filePath.replace(STORAGE_ROOT, "").replace(/^\//, "");

      const insertReport = db.prepare(`
        INSERT INTO reports (
          consumer_id, provider_name, source_type, report_date, import_date,
          connection_status, three_bureau_available, consumer_confirmed,
          eligible_for_automated_analysis, parser_version, original_response_path
        ) VALUES (?, ?, ?, ?, datetime('now'), 'imported', ?, 0, 1, '1.0.0', ?)
      `);

      const result = insertReport.run(
        "default", // consumer_id — placeholder until auth is implemented
        formatResult.provider,
        "consumer_uploaded",
        reportDate || null,
        bureauSections.length >= 2 ? 1 : 0,
        relativePath
      );

      const reportId = Number(result.lastInsertRowid);

      // ── Build response ───────────────────────
      const hasLowConfidence = overallConfidence < 0.3;

      const responseData = {
        reportId,
        provider: formatResult.provider,
        providerConfidence: formatResult.confidence,
        matchedPattern: formatResult.matchedPattern,
        reportDate,
        personalInfo: {
          data: personalInfo.data,
          confidence: personalInfo.confidence,
        },
        scores: allScores,
        tradelines: allTradelines,
        collections: allCollections,
        inquiries: allInquiries,
        publicRecords: allPublicRecords,
        remarks: allRemarks,
        bureauCount: bureauSections.length,
        extractionConfidence: overallConfidence,
        ...(hasLowConfidence && {
          warning:
            "Low extraction confidence. Some data may be incomplete or inaccurate. Please review and confirm.",
        }),
      };

      console.log(
        `[upload] Processed PDF: reportId=${reportId}, provider=${formatResult.provider}, confidence=${overallConfidence}`
      );

      res.json(responseData);
    } catch (err: any) {
      console.error("[upload] Error processing PDF:", err);
      res.status(500).json({
        error: "Processing failed",
        message: "An unexpected error occurred while processing the PDF report.",
      });
    }
  }
);

/**
 * GET /api/reports/:id
 *
 * Returns report metadata (and extraction data if available).
 */
router.get("/:id", (req: Request, res: Response) => {
  const idParam = req.params.id;
  const reportId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(reportId)) {
    res.status(400).json({ error: "Invalid report ID" });
    return;
  }

  const db = getDb();
  const report = db
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(reportId) as Record<string, unknown> | undefined;

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json(report);
});

/**
 * POST /api/reports/:id/confirm
 *
 * Consumer confirms or corrects extracted report data.
 * Updates the report record and saves the final data.
 */
router.post("/:id/confirm", async (req: Request, res: Response) => {
  const reportId = parseInt(req.params.id, 10);
  if (isNaN(reportId)) {
    res.status(400).json({ error: "Invalid report ID" });
    return;
  }

  const db = getDb();

  // Verify report exists
  const report = db
    .prepare("SELECT id, consumer_confirmed FROM reports WHERE id = ?")
    .get(reportId) as { id: number; consumer_confirmed: number } | undefined;

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  try {
    // Mark as confirmed
    db.prepare("UPDATE reports SET consumer_confirmed = 1 WHERE id = ?").run(reportId);

    // The corrected data can be stored in a future revision or as JSON
    // For now we just record the confirmation
    // If correctedFields are provided, log them
    const { correctedFields } = req.body;

    console.log(
      `[upload] Report #${reportId} confirmed by consumer.` +
        (correctedFields ? ` Corrections: ${JSON.stringify(correctedFields)}` : "")
    );

    res.json({
      reportId,
      confirmed: true,
      message: "Report data confirmed.",
    });
  } catch (err: any) {
    console.error("[upload] Error confirming report:", err);
    res.status(500).json({
      error: "Confirmation failed",
      message: "An error occurred while confirming the report.",
    });
  }
});

export default router;
