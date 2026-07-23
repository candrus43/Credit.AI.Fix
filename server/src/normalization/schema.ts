// ──────────────────────────────────────────────
// CreditBridge — Canonical Normalized Schema Types
// ──────────────────────────────────────────────
//
// Every field preserves both the normalized (canonical) value AND the
// original provider-supplied value for auditability and debugging.
//
// These types align with the DB tables defined in migration 004:
//   reports, report_scores, report_tradelines, report_collections,
//   report_inquiries, report_public_records, report_personal_statements.
// ──────────────────────────────────────────────

// ── Generic normalized field ────────────────────

/**
 * A field that has been normalized from a provider's raw format into
 * a canonical representation while preserving the original value.
 *
 * @template T — the canonical (normalized) type of the field value
 */
export interface NormalizedField<T> {
  /** The normalized/canonical value */
  normalized: T;
  /** The original provider-supplied value (as a string, or null if missing) */
  original: string | null;
}

// ── Consumer / Personal Info ────────────────────

export interface NormalizedConsumer {
  fullName: NormalizedField<string>;
  addressLine1: NormalizedField<string>;
  addressLine2: NormalizedField<string>;
  city: NormalizedField<string>;
  state: NormalizedField<string>;
  zip: NormalizedField<string>;
  ssnLast4: NormalizedField<string>;
  dateOfBirth: NormalizedField<string>;
  phone: NormalizedField<string>;
  employer: NormalizedField<string>;
}

// ── Scores ──────────────────────────────────────

export interface NormalizedScore {
  bureau: NormalizedField<string>;
  score: NormalizedField<number | null>;
  model: NormalizedField<string>;
  date: NormalizedField<string>;
  factors: NormalizedField<string[]>;
}

// ── Tradelines ──────────────────────────────────

export interface NormalizedTradeline {
  creditorName: NormalizedField<string>;
  originalCreditorName: NormalizedField<string>;
  maskedAccountNumber: NormalizedField<string>;
  accountType: NormalizedField<string>;
  ownership: NormalizedField<string>;
  accountStatus: NormalizedField<string>;
  paymentStatus: NormalizedField<string>;
  balance: NormalizedField<number | null>;
  creditLimit: NormalizedField<number | null>;
  pastDueAmount: NormalizedField<number | null>;
  highBalance: NormalizedField<number | null>;
  monthlyPayment: NormalizedField<number | null>;
  dateOpened: NormalizedField<string>;
  dateClosed: NormalizedField<string>;
  dateReported: NormalizedField<string>;
  dateOfLastActivity: NormalizedField<string>;
  firstDelinquencyDate: NormalizedField<string>;
  paymentHistory: NormalizedField<string[]>;
  remarks: NormalizedField<string>;
  disputeIndicator: NormalizedField<boolean>;
  providerSpecificId: NormalizedField<string>;
  confidence: number;
  extractionRaw: Record<string, unknown> | null;
}

// ── Collections ─────────────────────────────────

export interface NormalizedCollection {
  collectionAgency: NormalizedField<string>;
  originalCreditor: NormalizedField<string>;
  amount: NormalizedField<number | null>;
  accountNumber: NormalizedField<string>;
  dateAssigned: NormalizedField<string>;
  status: NormalizedField<string>;
  confidence: number;
}

// ── Inquiries ───────────────────────────────────

export interface NormalizedInquiry {
  bureau: NormalizedField<string>;
  inquiryDate: NormalizedField<string>;
  companyName: NormalizedField<string>;
  inquiryType: NormalizedField<"hard" | "soft">;
  confidence: number;
}

// ── Public Records ──────────────────────────────

export interface NormalizedPublicRecord {
  bureau: NormalizedField<string>;
  recordType: NormalizedField<"bankruptcy" | "judgment" | "tax_lien">;
  recordDate: NormalizedField<string>;
  court: NormalizedField<string>;
  referenceNumber: NormalizedField<string>;
  amount: NormalizedField<number | null>;
  status: NormalizedField<string>;
  confidence: number;
}

// ── Bureau-Section Report ───────────────────────

export interface BureauReport {
  bureau: string;
  consumer: NormalizedConsumer;
  scores: NormalizedScore[];
  tradelines: NormalizedTradeline[];
  collections: NormalizedCollection[];
  inquiries: NormalizedInquiry[];
  publicRecords: NormalizedPublicRecord[];
}

// ── Full Normalized Report ─────────────────────

export interface NormalizedReport {
  /** Unique report identifier (from the DB or generated) */
  reportId?: number;
  /** Source provider name (e.g. "SmartCredit", "Synthetic") */
  providerName: string;
  /** How this report was sourced */
  sourceType: "direct_provider" | "consumer_uploaded" | "licensed_api" | "manual_entry" | "synthetic";
  /** The date on the credit report itself */
  reportDate: string | null;
  /** When we imported/processed this report */
  importDate: string;
  /** The mapping version used for this provider */
  mappingVersion: string;
  /** Per-bureau sections */
  bureauSections: BureauReport[];
  /** Cross-bureau matching results (populated after normalization) */
  crossBureauMatches?: CrossBureauMatch[];
}

// ── Cross-Bureau Matching ──────────────────────

export type MatchConfidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW";

export interface MatchedAccount {
  bureau: string;
  tradeline: NormalizedTradeline;
}

export interface CrossBureauMatch {
  matchConfidence: MatchConfidence;
  accounts: MatchedAccount[];
  discrepancies: Discrepancy[];
}

// ── Discrepancies ───────────────────────────────

export interface Discrepancy {
  field: string;
  bureauA: string;
  valueA: string;
  bureauB: string;
  valueB: string;
  severity: "low" | "medium" | "high";
  description: string;
}

// ── Input Types (what the normalization engine accepts) ──

/**
 * Unified input shape for extracted credit report data.
 * This is produced by the PDF extractor or by provider adapters.
 */
export interface ExtractedReportData {
  providerName: string;
  reportDate: string | null;
  personalInfo?: {
    data: Record<string, string | undefined>;
    confidence?: Record<string, number>;
  };
  scores?: Array<{
    bureau: string;
    score: number;
    model: string;
    date?: string;
    confidence?: number;
  }>;
  tradelines?: Array<{
    bureau: string;
    creditorName: string;
    originalCreditorName?: string;
    maskedAccountNumber: string;
    accountType: string;
    ownership?: string;
    accountStatus: string;
    paymentStatus: string;
    balance?: number;
    creditLimit?: number;
    pastDueAmount?: number;
    highBalance?: number;
    monthlyPayment?: number;
    dateOpened?: string;
    dateClosed?: string;
    dateReported?: string;
    dateOfLastActivity?: string;
    firstDelinquencyDate?: string;
    paymentHistory: string[];
    remarks: string;
    disputeIndicator: boolean;
    confidence?: number;
    [key: string]: unknown;
  }>;
  collections?: Array<{
    bureau: string;
    collectionAgency: string;
    originalCreditor: string;
    amount: number;
    accountNumber: string;
    dateAssigned: string;
    status: string;
    confidence?: number;
  }>;
  inquiries?: Array<{
    bureau: string;
    inquiryDate: string;
    companyName: string;
    inquiryType: "hard" | "soft";
    confidence?: number;
  }>;
  publicRecords?: Array<{
    bureau: string;
    recordType: string;
    recordDate: string;
    court: string;
    referenceNumber: string;
    amount?: number;
    status: string;
    confidence?: number;
  }>;
  bureauSections?: Array<{ bureau: string; text: string }>;
}

// ── Helper: create a NormalizedField ─────────────

export function nf<T>(normalizedValue: T, originalValue: unknown): NormalizedField<T> {
  const original =
    originalValue === null || originalValue === undefined
      ? null
      : typeof originalValue === "string"
        ? originalValue
        : JSON.stringify(originalValue);
  return { normalized: normalizedValue, original };
}

export function emptyNf<T>(defaultValue: T): NormalizedField<T> {
  return { normalized: defaultValue, original: null };
}
