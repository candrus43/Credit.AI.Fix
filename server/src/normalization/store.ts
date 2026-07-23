// ──────────────────────────────────────────────
// CreditBridge — Normalized Report Storage
// ──────────────────────────────────────────────
//
// Persists normalized credit-report data into the DB tables defined
// in migration 004:
//   report_scores, report_tradelines, report_collections,
//   report_inquiries, report_public_records, report_personal_info
//
// Uses the existing `reports` table (created by the upload route) as
// the parent record. Normalization writes detail records linked by
// report_id FK.
// ──────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type {
  NormalizedReport,
  NormalizedConsumer,
  NormalizedScore,
  NormalizedTradeline,
  NormalizedCollection,
  NormalizedInquiry,
  NormalizedPublicRecord,
  BureauReport,
} from "./schema.js";

// ── Prepared Statement Cache ────────────────────

interface StatementCache {
  upsertPersonalInfo: ReturnType<Database["prepare"]>;
  deletePersonalInfo: ReturnType<Database["prepare"]>;
  insertScore: ReturnType<Database["prepare"]>;
  insertTradeline: ReturnType<Database["prepare"]>;
  insertCollection: ReturnType<Database["prepare"]>;
  insertInquiry: ReturnType<Database["prepare"]>;
  insertPublicRecord: ReturnType<Database["prepare"]>;
  updateReportMapping: ReturnType<Database["prepare"]>;
  deleteScores: ReturnType<Database["prepare"]>;
  deleteTradelines: ReturnType<Database["prepare"]>;
  deleteCollections: ReturnType<Database["prepare"]>;
  deleteInquiries: ReturnType<Database["prepare"]>;
  deletePublicRecords: ReturnType<Database["prepare"]>;
}

function prepareStatements(db: Database): StatementCache {
  return {
    upsertPersonalInfo: db.prepare(`
      INSERT INTO report_personal_info (
        report_id, full_name, address_line1, address_line2,
        city, state, zip, ssn_last4, date_of_birth, phone, employer
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    deletePersonalInfo: db.prepare("DELETE FROM report_personal_info WHERE report_id = ?"),

    insertScore: db.prepare(`
      INSERT INTO report_scores (report_id, bureau, score, score_model, score_date, factors)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    insertTradeline: db.prepare(`
      INSERT INTO report_tradelines (
        report_id, bureau, creditor_name, original_creditor_name,
        masked_account_number, account_type, ownership, account_status,
        payment_status, balance, credit_limit, past_due_amount,
        high_balance, monthly_payment, date_opened, date_closed,
        date_reported, date_of_last_activity, first_delinquency_date,
        payment_history, remarks, dispute_indicator, provider_specific_id,
        confidence, extraction_raw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),

    insertCollection: db.prepare(`
      INSERT INTO report_collections (
        report_id, bureau, collection_agency, original_creditor,
        amount, account_number, date_assigned, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    insertInquiry: db.prepare(`
      INSERT INTO report_inquiries (report_id, bureau, inquiry_date, company_name, inquiry_type)
      VALUES (?, ?, ?, ?, ?)
    `),

    insertPublicRecord: db.prepare(`
      INSERT INTO report_public_records (
        report_id, bureau, record_type, record_date, court,
        reference_number, amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    updateReportMapping: db.prepare(`
      UPDATE reports SET mapping_version = ? WHERE id = ?
    `),

    deleteScores: db.prepare("DELETE FROM report_scores WHERE report_id = ?"),
    deleteTradelines: db.prepare("DELETE FROM report_tradelines WHERE report_id = ?"),
    deleteCollections: db.prepare("DELETE FROM report_collections WHERE report_id = ?"),
    deleteInquiries: db.prepare("DELETE FROM report_inquiries WHERE report_id = ?"),
    deletePublicRecords: db.prepare("DELETE FROM report_public_records WHERE report_id = ?"),
  };
}

// ── Main Storage Function ───────────────────────

/**
 * Save a fully normalized report into the database.
 *
 * Clears any previously stored normalized detail rows for this report_id
 * and re-inserts the fresh normalization. Uses a transaction so all
 * inserts are atomic.
 *
 * @param db — database connection
 * @param normalizedReport — the fully normalized report
 * @param consumerId — consumer identifier
 * @param reportId — the parent report ID (from the `reports` table)
 * @returns the reportId
 */
export function saveNormalizedReport(
  db: Database,
  normalizedReport: NormalizedReport,
  consumerId: string,
  reportId: number
): number {
  const stmts = prepareStatements(db);

  const transaction = db.transaction(() => {
    // Clear previous detail rows
    stmts.deletePersonalInfo.run(reportId);
    stmts.deleteScores.run(reportId);
    stmts.deleteTradelines.run(reportId);
    stmts.deleteCollections.run(reportId);
    stmts.deleteInquiries.run(reportId);
    stmts.deletePublicRecords.run(reportId);

    // Insert data from each bureau section
    for (const section of normalizedReport.bureauSections) {
      // Personal info (once per report — use the first bureau's data)
      const consumer = section.consumer;
      stmts.upsertPersonalInfo.run(
        reportId,
        consumer.fullName.normalized || null,
        consumer.addressLine1.normalized || null,
        consumer.addressLine2.normalized || null,
        consumer.city.normalized || null,
        consumer.state.normalized || null,
        consumer.zip.normalized || null,
        consumer.ssnLast4.normalized || null,
        consumer.dateOfBirth.normalized || null,
        consumer.phone.normalized || null,
        consumer.employer.normalized || null
      );

      // Scores
      for (const score of section.scores) {
        stmts.insertScore.run(
          reportId,
          section.bureau,
          score.score.normalized,
          score.model.normalized,
          score.date.normalized || null,
          JSON.stringify(score.factors.normalized)
        );
      }

      // Tradelines
      for (const tl of section.tradelines) {
        stmts.insertTradeline.run(
          reportId,
          section.bureau,
          tl.creditorName.normalized || null,
          tl.originalCreditorName.normalized || null,
          tl.maskedAccountNumber.normalized || null,
          tl.accountType.normalized || null,
          tl.ownership.normalized || null,
          tl.accountStatus.normalized || null,
          tl.paymentStatus.normalized || null,
          tl.balance.normalized,
          tl.creditLimit.normalized,
          tl.pastDueAmount.normalized,
          tl.highBalance.normalized,
          tl.monthlyPayment.normalized,
          tl.dateOpened.normalized || null,
          tl.dateClosed.normalized || null,
          tl.dateReported.normalized || null,
          tl.dateOfLastActivity.normalized || null,
          tl.firstDelinquencyDate.normalized || null,
          JSON.stringify(tl.paymentHistory.normalized),
          tl.remarks.normalized || null,
          tl.disputeIndicator.normalized ? 1 : 0,
          tl.providerSpecificId.normalized || null,
          tl.confidence,
          tl.extractionRaw ? JSON.stringify(tl.extractionRaw) : null
        );
      }

      // Collections
      for (const col of section.collections) {
        stmts.insertCollection.run(
          reportId,
          section.bureau,
          col.collectionAgency.normalized || null,
          col.originalCreditor.normalized || null,
          col.amount.normalized,
          col.accountNumber.normalized || null,
          col.dateAssigned.normalized || null,
          col.status.normalized || null
        );
      }

      // Inquiries
      for (const inq of section.inquiries) {
        stmts.insertInquiry.run(
          reportId,
          section.bureau,
          inq.inquiryDate.normalized || null,
          inq.companyName.normalized || null,
          inq.inquiryType.normalized
        );
      }

      // Public records
      for (const pr of section.publicRecords) {
        stmts.insertPublicRecord.run(
          reportId,
          section.bureau,
          pr.recordType.normalized || null,
          pr.recordDate.normalized || null,
          pr.court.normalized || null,
          pr.referenceNumber.normalized || null,
          pr.amount.normalized,
          pr.status.normalized || null
        );
      }
    }

    // Update the parent report with mapping version
    stmts.updateReportMapping.run(normalizedReport.mappingVersion, reportId);
  });

  transaction();

  return reportId;
}

// ── Retrieval Functions ─────────────────────────

/**
 * Retrieve a full normalized report from the database, reconstructing
 * the in-memory NormalizedReport structure from DB rows.
 *
 * @param db — database connection
 * @param reportId — the parent report ID
 * @returns reconstructed NormalizedReport or null if not found
 */
export function getNormalizedReport(
  db: Database,
  reportId: number
): NormalizedReport | null {
  const report = db
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(reportId) as Record<string, unknown> | undefined;

  if (!report) return null;

  const personalInfo = db
    .prepare("SELECT * FROM report_personal_info WHERE report_id = ?")
    .get(reportId) as Record<string, unknown> | undefined;

  const scoreRows = db
    .prepare("SELECT * FROM report_scores WHERE report_id = ?")
    .all(reportId) as Record<string, unknown>[];

  const tradelineRows = db
    .prepare("SELECT * FROM report_tradelines WHERE report_id = ?")
    .all(reportId) as Record<string, unknown>[];

  const collectionRows = db
    .prepare("SELECT * FROM report_collections WHERE report_id = ?")
    .all(reportId) as Record<string, unknown>[];

  const inquiryRows = db
    .prepare("SELECT * FROM report_inquiries WHERE report_id = ?")
    .all(reportId) as Record<string, unknown>[];

  const publicRecordRows = db
    .prepare("SELECT * FROM report_public_records WHERE report_id = ?")
    .all(reportId) as Record<string, unknown>[];

  return rowsToNormalizedReport(
    reportId,
    report,
    personalInfo,
    scoreRows,
    tradelineRows,
    collectionRows,
    inquiryRows,
    publicRecordRows
  );
}

/**
 * Convert DB rows back into a NormalizedReport structure.
 * This is the inverse of saveNormalizedReport.
 */
function rowsToNormalizedReport(
  reportId: number,
  report: Record<string, unknown>,
  personalInfo: Record<string, unknown> | undefined,
  scoreRows: Record<string, unknown>[],
  tradelineRows: Record<string, unknown>[],
  collectionRows: Record<string, unknown>[],
  inquiryRows: Record<string, unknown>[],
  publicRecordRows: Record<string, unknown>[]
): NormalizedReport {
  // Build consumer from personal info row
  const consumer: NormalizedConsumer = {
    fullName: { normalized: String(personalInfo?.full_name ?? ""), original: null },
    addressLine1: { normalized: String(personalInfo?.address_line1 ?? ""), original: null },
    addressLine2: { normalized: String(personalInfo?.address_line2 ?? ""), original: null },
    city: { normalized: String(personalInfo?.city ?? ""), original: null },
    state: { normalized: String(personalInfo?.state ?? ""), original: null },
    zip: { normalized: String(personalInfo?.zip ?? ""), original: null },
    ssnLast4: { normalized: String(personalInfo?.ssn_last4 ?? ""), original: null },
    dateOfBirth: { normalized: String(personalInfo?.date_of_birth ?? ""), original: null },
    phone: { normalized: String(personalInfo?.phone ?? ""), original: null },
    employer: { normalized: String(personalInfo?.employer ?? ""), original: null },
  };

  // Group detail rows by bureau
  const bureauMap = new Map<string, {
    scores: Record<string, unknown>[];
    tradelines: Record<string, unknown>[];
    collections: Record<string, unknown>[];
    inquiries: Record<string, unknown>[];
    publicRecords: Record<string, unknown>[];
  }>();

  const getGroup = (bureau: string) => {
    if (!bureauMap.has(bureau)) {
      bureauMap.set(bureau, {
        scores: [],
        tradelines: [],
        collections: [],
        inquiries: [],
        publicRecords: [],
      });
    }
    return bureauMap.get(bureau)!;
  };

  for (const row of scoreRows) getGroup(row.bureau as string).scores.push(row);
  for (const row of tradelineRows) getGroup(row.bureau as string).tradelines.push(row);
  for (const row of collectionRows) getGroup(row.bureau as string).collections.push(row);
  for (const row of inquiryRows) getGroup(row.bureau as string).inquiries.push(row);
  for (const row of publicRecordRows) getGroup(row.bureau as string).publicRecords.push(row);

  const bureauSections: BureauReport[] = [];
  for (const [bureau, group] of bureauMap.entries()) {
    bureauSections.push({
      bureau,
      consumer,
      scores: group.scores.map(rowToNormalizedScore),
      tradelines: group.tradelines.map(rowToNormalizedTradeline),
      collections: group.collections.map(rowToNormalizedCollection),
      inquiries: group.inquiries.map(rowToNormalizedInquiry),
      publicRecords: group.publicRecords.map(rowToNormalizedPublicRecord),
    });
  }

  return {
    reportId,
    providerName: String(report.provider_name ?? ""),
    sourceType: String(report.source_type ?? "consumer_uploaded") as NormalizedReport["sourceType"],
    reportDate: report.report_date as string | null,
    importDate: String(report.import_date ?? ""),
    mappingVersion: String(report.mapping_version ?? "1.0.0"),
    bureauSections,
  };
}

// ── Row → Normalized Type Converters ────────────

function rowToNormalizedScore(row: Record<string, unknown>): NormalizedScore {
  return {
    bureau: { normalized: String(row.bureau ?? ""), original: null },
    score: { normalized: row.score as number | null, original: null },
    model: { normalized: String(row.score_model ?? ""), original: null },
    date: { normalized: String(row.score_date ?? ""), original: null },
    factors: {
      normalized: parseJsonArray(row.factors as string),
      original: null,
    },
  };
}

function rowToNormalizedTradeline(row: Record<string, unknown>): NormalizedTradeline {
  return {
    creditorName: { normalized: String(row.creditor_name ?? ""), original: null },
    originalCreditorName: { normalized: String(row.original_creditor_name ?? ""), original: null },
    maskedAccountNumber: { normalized: String(row.masked_account_number ?? ""), original: null },
    accountType: { normalized: String(row.account_type ?? "other"), original: null },
    ownership: { normalized: String(row.ownership ?? "individual"), original: null },
    accountStatus: { normalized: String(row.account_status ?? "unknown"), original: null },
    paymentStatus: { normalized: String(row.payment_status ?? ""), original: null },
    balance: { normalized: row.balance as number | null, original: null },
    creditLimit: { normalized: row.credit_limit as number | null, original: null },
    pastDueAmount: { normalized: row.past_due_amount as number | null, original: null },
    highBalance: { normalized: row.high_balance as number | null, original: null },
    monthlyPayment: { normalized: row.monthly_payment as number | null, original: null },
    dateOpened: { normalized: String(row.date_opened ?? ""), original: null },
    dateClosed: { normalized: String(row.date_closed ?? ""), original: null },
    dateReported: { normalized: String(row.date_reported ?? ""), original: null },
    dateOfLastActivity: { normalized: String(row.date_of_last_activity ?? ""), original: null },
    firstDelinquencyDate: { normalized: String(row.first_delinquency_date ?? ""), original: null },
    paymentHistory: { normalized: parseJsonArray(row.payment_history as string), original: null },
    remarks: { normalized: String(row.remarks ?? ""), original: null },
    disputeIndicator: { normalized: Boolean(row.dispute_indicator), original: null },
    providerSpecificId: { normalized: String(row.provider_specific_id ?? ""), original: null },
    confidence: row.confidence as number ?? 0,
    extractionRaw: parseJsonObject(row.extraction_raw as string),
  };
}

function rowToNormalizedCollection(row: Record<string, unknown>): NormalizedCollection {
  return {
    collectionAgency: { normalized: String(row.collection_agency ?? ""), original: null },
    originalCreditor: { normalized: String(row.original_creditor ?? ""), original: null },
    amount: { normalized: row.amount as number | null, original: null },
    accountNumber: { normalized: String(row.account_number ?? ""), original: null },
    dateAssigned: { normalized: String(row.date_assigned ?? ""), original: null },
    status: { normalized: String(row.status ?? ""), original: null },
    confidence: 1.0,
  };
}

function rowToNormalizedInquiry(row: Record<string, unknown>): NormalizedInquiry {
  return {
    bureau: { normalized: String(row.bureau ?? ""), original: null },
    inquiryDate: { normalized: String(row.inquiry_date ?? ""), original: null },
    companyName: { normalized: String(row.company_name ?? ""), original: null },
    inquiryType: {
      normalized: (row.inquiry_type === "hard" || row.inquiry_type === "soft")
        ? row.inquiry_type as "hard" | "soft"
        : "soft",
      original: null,
    },
    confidence: 1.0,
  };
}

function rowToNormalizedPublicRecord(row: Record<string, unknown>): NormalizedPublicRecord {
  return {
    bureau: { normalized: String(row.bureau ?? ""), original: null },
    recordType: {
      normalized: (row.record_type === "bankruptcy" || row.record_type === "judgment" || row.record_type === "tax_lien")
        ? row.record_type as "bankruptcy" | "judgment" | "tax_lien"
        : "judgment",
      original: null,
    },
    recordDate: { normalized: String(row.record_date ?? ""), original: null },
    court: { normalized: String(row.court ?? ""), original: null },
    referenceNumber: { normalized: String(row.reference_number ?? ""), original: null },
    amount: { normalized: row.amount as number | null, original: null },
    status: { normalized: String(row.status ?? ""), original: null },
    confidence: 1.0,
  };
}

// ── JSON Helpers ────────────────────────────────

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
