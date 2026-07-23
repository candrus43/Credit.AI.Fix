// ──────────────────────────────────────────────
// CreditBridge — Normalization Engine
// ──────────────────────────────────────────────
//
// Core transformation pipeline: takes raw extracted data from any
// source (PDF parser, adapter API response, manual entry) and normalizes
// it into the canonical CreditBridge schema.
//
// Every field preserves both the normalized value AND the original
// provider-supplied value for auditability and confidence scoring.
// ──────────────────────────────────────────────

import {
  getMapping,
  applyMappings,
  type FieldMapping,
} from "./mappings.js";
import {
  nf,
  emptyNf,
  type NormalizedConsumer,
  type NormalizedScore,
  type NormalizedTradeline,
  type NormalizedCollection,
  type NormalizedInquiry,
  type NormalizedPublicRecord,
  type BureauReport,
  type NormalizedReport,
  type ExtractedReportData,
} from "./schema.js";

// ── Consumer Normalization ──────────────────────

export function normalizeConsumer(
  rawPersonalInfo: Record<string, unknown>,
  providerName: string
): NormalizedConsumer {
  const mapping = getMapping(providerName);
  const [canonical, originals] = applyMappings(rawPersonalInfo, mapping.personalInfo);

  return {
    fullName: nf(String(canonical.fullName ?? ""), originals.fullName),
    addressLine1: nf(String(canonical.addressLine1 ?? ""), originals.addressLine1),
    addressLine2: nf(String(canonical.addressLine2 ?? ""), originals.addressLine2),
    city: nf(String(canonical.city ?? ""), originals.city),
    state: nf(String(canonical.state ?? ""), originals.state),
    zip: nf(String(canonical.zip ?? ""), originals.zip),
    ssnLast4: nf(String(canonical.ssnLast4 ?? ""), originals.ssnLast4),
    dateOfBirth: nf(String(canonical.dateOfBirth ?? ""), originals.dateOfBirth),
    phone: nf(String(canonical.phone ?? ""), originals.phone),
    employer: nf(String(canonical.employer ?? ""), originals.employer),
  };
}

// ── Score Normalization ─────────────────────────

export function normalizeScores(
  rawScores: Record<string, unknown>[],
  providerName: string
): NormalizedScore[] {
  const mapping = getMapping(providerName);

  return rawScores.map((raw) => {
    const [canonical, originals] = applyMappings(raw, mapping.scores);

    return {
      bureau: nf(String(canonical.bureau ?? ""), originals.bureau),
      score: nf(
        canonical.score !== null && canonical.score !== undefined
          ? Number(canonical.score)
          : null,
        originals.score
      ),
      model: nf(String(canonical.model ?? ""), originals.model),
      date: nf(String(canonical.date ?? ""), originals.date),
      factors: nf(
        Array.isArray(canonical.factors) ? canonical.factors as string[] : [],
        originals.factors
      ),
    };
  });
}

// ── Tradeline Normalization ─────────────────────

export function normalizeTradelines(
  rawTradelines: Record<string, unknown>[],
  providerName: string
): NormalizedTradeline[] {
  const mapping = getMapping(providerName);

  return rawTradelines.map((raw) => {
    const [canonical, originals] = applyMappings(raw, mapping.tradelines);

    // Inherit confidence from extraction or default to 1.0 for direct API data
    const confidence =
      typeof raw.confidence === "number"
        ? raw.confidence
        : 1.0;

    return {
      creditorName: nf(String(canonical.creditorName ?? ""), originals.creditorName),
      originalCreditorName: nf(String(canonical.originalCreditorName ?? ""), originals.originalCreditorName),
      maskedAccountNumber: nf(String(canonical.maskedAccountNumber ?? ""), originals.maskedAccountNumber),
      accountType: nf(String(canonical.accountType ?? "other"), originals.accountType),
      ownership: nf(String(canonical.ownership ?? "individual"), originals.ownership),
      accountStatus: nf(String(canonical.accountStatus ?? "unknown"), originals.accountStatus),
      paymentStatus: nf(String(canonical.paymentStatus ?? ""), originals.paymentStatus),
      balance: nf(
        canonical.balance !== null && canonical.balance !== undefined ? Number(canonical.balance) : null,
        originals.balance
      ),
      creditLimit: nf(
        canonical.creditLimit !== null && canonical.creditLimit !== undefined ? Number(canonical.creditLimit) : null,
        originals.creditLimit
      ),
      pastDueAmount: nf(
        canonical.pastDueAmount !== null && canonical.pastDueAmount !== undefined ? Number(canonical.pastDueAmount) : null,
        originals.pastDueAmount
      ),
      highBalance: nf(
        canonical.highBalance !== null && canonical.highBalance !== undefined ? Number(canonical.highBalance) : null,
        originals.highBalance
      ),
      monthlyPayment: nf(
        canonical.monthlyPayment !== null && canonical.monthlyPayment !== undefined ? Number(canonical.monthlyPayment) : null,
        originals.monthlyPayment
      ),
      dateOpened: nf(String(canonical.dateOpened ?? ""), originals.dateOpened),
      dateClosed: nf(String(canonical.dateClosed ?? ""), originals.dateClosed),
      dateReported: nf(String(canonical.dateReported ?? ""), originals.dateReported),
      dateOfLastActivity: nf(String(canonical.dateOfLastActivity ?? ""), originals.dateOfLastActivity),
      firstDelinquencyDate: nf(String(canonical.firstDelinquencyDate ?? ""), originals.firstDelinquencyDate),
      paymentHistory: nf(
        Array.isArray(canonical.paymentHistory) ? canonical.paymentHistory as string[] : [],
        originals.paymentHistory
      ),
      remarks: nf(String(canonical.remarks ?? ""), originals.remarks),
      disputeIndicator: nf(Boolean(canonical.disputeIndicator), originals.disputeIndicator),
      providerSpecificId: nf(String(canonical.providerSpecificId ?? ""), originals.providerSpecificId),
      confidence,
      extractionRaw: raw as Record<string, unknown>,
    };
  });
}

// ── Collection Normalization ────────────────────

export function normalizeCollections(
  rawCollections: Record<string, unknown>[],
  providerName: string
): NormalizedCollection[] {
  const mapping = getMapping(providerName);

  return rawCollections.map((raw) => {
    const [canonical, originals] = applyMappings(raw, mapping.collections);
    const confidence =
      typeof raw.confidence === "number" ? raw.confidence : 1.0;

    return {
      collectionAgency: nf(String(canonical.collectionAgency ?? ""), originals.collectionAgency),
      originalCreditor: nf(String(canonical.originalCreditor ?? ""), originals.originalCreditor),
      amount: nf(
        canonical.amount !== null && canonical.amount !== undefined ? Number(canonical.amount) : null,
        originals.amount
      ),
      accountNumber: nf(String(canonical.accountNumber ?? ""), originals.accountNumber),
      dateAssigned: nf(String(canonical.dateAssigned ?? ""), originals.dateAssigned),
      status: nf(String(canonical.status ?? ""), originals.status),
      confidence,
    };
  });
}

// ── Inquiry Normalization ───────────────────────

export function normalizeInquiries(
  rawInquiries: Record<string, unknown>[],
  providerName: string
): NormalizedInquiry[] {
  const mapping = getMapping(providerName);

  return rawInquiries.map((raw) => {
    const [canonical, originals] = applyMappings(raw, mapping.inquiries);
    const confidence =
      typeof raw.confidence === "number" ? raw.confidence : 1.0;

    return {
      bureau: nf(String(canonical.bureau ?? raw.bureau ?? ""), originals.bureau || null),
      inquiryDate: nf(String(canonical.inquiryDate ?? ""), originals.inquiryDate),
      companyName: nf(String(canonical.companyName ?? ""), originals.companyName),
      inquiryType: nf(
        (canonical.inquiryType === "hard" || canonical.inquiryType === "soft") ? canonical.inquiryType : "soft",
        originals.inquiryType
      ),
      confidence,
    };
  });
}

// ── Public Record Normalization ─────────────────

export function normalizePublicRecords(
  rawRecords: Record<string, unknown>[],
  providerName: string
): NormalizedPublicRecord[] {
  const mapping = getMapping(providerName);

  return rawRecords.map((raw) => {
    const [canonical, originals] = applyMappings(raw, mapping.publicRecords);
    const confidence =
      typeof raw.confidence === "number" ? raw.confidence : 1.0;

    return {
      bureau: nf(String(canonical.bureau ?? raw.bureau ?? ""), originals.bureau || null),
      recordType: nf(
        (canonical.recordType === "bankruptcy" || canonical.recordType === "judgment" || canonical.recordType === "tax_lien")
          ? canonical.recordType
          : "judgment",
        originals.recordType
      ),
      recordDate: nf(String(canonical.recordDate ?? ""), originals.recordDate),
      court: nf(String(canonical.court ?? ""), originals.court),
      referenceNumber: nf(String(canonical.referenceNumber ?? ""), originals.referenceNumber),
      amount: nf(
        canonical.amount !== null && canonical.amount !== undefined ? Number(canonical.amount) : null,
        originals.amount
      ),
      status: nf(String(canonical.status ?? ""), originals.status),
      confidence,
    };
  });
}

// ── Full Report Normalization ───────────────────

/**
 * Normalize an entire extracted report into the canonical schema.
 *
 * This is the main entry point: feed it raw data from the PDF extractor
 * or from a provider adapter, and it returns a fully normalized report
 * with per-field { normalized, original } preservation.
 *
 * @param rawData — extracted report data from any source
 * @param providerName — canonical provider name for mapping lookup
 * @returns fully normalized report with bureau sections
 */
export function normalizeReport(
  rawData: ExtractedReportData,
  providerName: string
): NormalizedReport {
  const mapping = getMapping(providerName);

  // Normalize consumer info
  const consumer = normalizeConsumer(
    (rawData.personalInfo?.data ?? {}) as Record<string, unknown>,
    providerName
  );

  // Group raw data by bureau
  const bureauMap = new Map<string, {
    scores: Record<string, unknown>[];
    tradelines: Record<string, unknown>[];
    collections: Record<string, unknown>[];
    inquiries: Record<string, unknown>[];
    publicRecords: Record<string, unknown>[];
  }>();

  // Initialize known bureaus
  const knownBureaus = ["Equifax", "Experian", "TransUnion"];

  // Helper to get or create a bureau group
  const getBureauGroup = (bureau: string) => {
    const key = bureau || "unknown";
    if (!bureauMap.has(key)) {
      bureauMap.set(key, {
        scores: [],
        tradelines: [],
        collections: [],
        inquiries: [],
        publicRecords: [],
      });
    }
    return bureauMap.get(key)!;
  };

  // Distribute raw scores by bureau
  for (const score of rawData.scores ?? []) {
    const bureau = (score as Record<string, unknown>).bureau as string || "unknown";
    getBureauGroup(bureau).scores.push(score as Record<string, unknown>);
  }

  // Distribute raw tradelines by bureau
  for (const tl of rawData.tradelines ?? []) {
    const bureau = (tl as Record<string, unknown>).bureau as string || "unknown";
    getBureauGroup(bureau).tradelines.push(tl as Record<string, unknown>);
  }

  // Distribute raw collections by bureau
  for (const col of rawData.collections ?? []) {
    const bureau = (col as Record<string, unknown>).bureau as string || "unknown";
    getBureauGroup(bureau).collections.push(col as Record<string, unknown>);
  }

  // Distribute raw inquiries by bureau
  for (const inq of rawData.inquiries ?? []) {
    const bureau = (inq as Record<string, unknown>).bureau as string || "unknown";
    getBureauGroup(bureau).inquiries.push(inq as Record<string, unknown>);
  }

  // Distribute raw public records by bureau
  for (const pr of rawData.publicRecords ?? []) {
    const bureau = (pr as Record<string, unknown>).bureau as string || "unknown";
    getBureauGroup(bureau).publicRecords.push(pr as Record<string, unknown>);
  }

  // If no bureau sections were found but we have data, try to create sections
  // from the explicit bureauSections in the input
  if (bureauMap.size === 0 && rawData.bureauSections) {
    for (const bs of rawData.bureauSections) {
      getBureauGroup(bs.bureau);
    }
  }

  // If still nothing, create a single "unknown" section
  if (bureauMap.size === 0) {
    getBureauGroup("unknown");
  }

  // Build bureau report sections
  const bureauSections: BureauReport[] = [];
  for (const [bureau, group] of bureauMap.entries()) {
    bureauSections.push({
      bureau,
      consumer,
      scores: normalizeScores(group.scores, providerName),
      tradelines: normalizeTradelines(group.tradelines, providerName),
      collections: normalizeCollections(group.collections, providerName),
      inquiries: normalizeInquiries(group.inquiries, providerName),
      publicRecords: normalizePublicRecords(group.publicRecords, providerName),
    });
  }

  return {
    providerName,
    sourceType: "consumer_uploaded", // caller can override
    reportDate: rawData.reportDate ?? null,
    importDate: new Date().toISOString(),
    mappingVersion: mapping.version,
    bureauSections,
  };
}
