import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { confirmReport, normalizeReportData, fetchReport } from "../lib/api";

// ── Types ────────────────────────────────────────

interface PersonalInfoData {
  fullName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zip?: string;
  ssnLast4?: string;
  dateOfBirth?: string;
  phone?: string;
  employer?: string;
}

interface PersonalInfoConfidence {
  fullName: number;
  addressLine1: number;
  addressLine2: number;
  city: number;
  state: number;
  zip: number;
  ssnLast4: number;
  dateOfBirth: number;
  phone: number;
  employer: number;
}

interface ScoreData {
  bureau: string;
  score: number;
  model: string;
  date?: string;
  confidence: number;
}

interface TradelineData {
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
  confidence: number;
}

interface CollectionData {
  bureau: string;
  collectionAgency: string;
  originalCreditor: string;
  amount: number;
  accountNumber: string;
  dateAssigned: string;
  status: string;
  confidence: number;
}

interface InquiryData {
  bureau: string;
  inquiryDate: string;
  companyName: string;
  inquiryType: "hard" | "soft";
  confidence: number;
}

interface PublicRecordData {
  bureau: string;
  recordType: string;
  recordDate: string;
  court: string;
  referenceNumber: string;
  amount?: number;
  status: string;
  confidence: number;
}

interface ReportData {
  reportId: number;
  provider: string;
  providerConfidence: number;
  matchedPattern: string;
  reportDate: string | null;
  personalInfo: { data: PersonalInfoData; confidence: PersonalInfoConfidence };
  scores: ScoreData[];
  tradelines: TradelineData[];
  collections: CollectionData[];
  inquiries: InquiryData[];
  publicRecords: PublicRecordData[];
  remarks: string[];
  bureauCount: number;
  extractionConfidence: number;
}

interface MatchedAccount {
  bureau: string;
  tradeline: { creditorName: { normalized: string }; maskedAccountNumber: { normalized: string } };
}

interface Discrepancy {
  field: string;
  bureauA: string;
  valueA: string;
  bureauB: string;
  valueB: string;
  severity: "low" | "medium" | "high";
  description: string;
}

interface CrossBureauMatch {
  matchConfidence: "EXACT" | "HIGH" | "MEDIUM" | "LOW";
  accounts: MatchedAccount[];
  discrepancies: Discrepancy[];
}

interface NormalizationResult {
  normalizedReport: unknown;
  crossBureauMatches: CrossBureauMatch[];
  allDiscrepancies: Discrepancy[];
  stats: { bureauCount: number; totalTradelines: number; totalMatches: number; totalDiscrepancies: number };
}

// ── Helpers ───────────────────────────────────────

const BUREAUS = ["Equifax", "Experian", "TransUnion"];

function confidenceColor(value: number): string {
  if (value >= 0.8) return "conf--green";
  if (value >= 0.5) return "conf--yellow";
  return "conf--red";
}

function confidenceLabel(value: number): string {
  if (value >= 0.8) return "High";
  if (value >= 0.5) return "Medium";
  return "Low";
}

function pctColor(value: number): string {
  if (value > 0.8) return "text--green";
  if (value >= 0.5) return "text--yellow";
  return "text--red";
}

function formatCurrency(n: number | undefined | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function formatDate(d: string | undefined | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function getSourceBadge(provider: string): { label: string; className: string } {
  if (provider === "Synthetic") return { label: "Synthetic Test Data", className: "badge--purple" };
  if (provider === "ManualEntry") return { label: "Manual Entry", className: "badge--blue" };
  if (["Equifax", "Experian", "TransUnion"].includes(provider))
    return { label: "Direct Provider", className: "badge--green" };
  return { label: "Uploaded Report", className: "badge--blue" };
}

function getPaymentHistoryColor(code: string): string {
  const upper = code?.toUpperCase() || "";
  if (["OK", "CURR", "CURRENT"].includes(upper)) return "ph--green";
  if (["30", "30D"].includes(upper)) return "ph--yellow";
  if (["60", "60D"].includes(upper)) return "ph--orange";
  if (["90", "90D", "120", "150", "180"].includes(upper)) return "ph--red";
  if (["CO", "COL", "COLLECTION", "FC"].includes(upper)) return "ph--red-dark";
  if (["CLS", "CLOSED", "ND", "NO DATA"].includes(upper)) return "ph--gray";
  return "ph--gray";
}

function getStatusBadge(status: string): string {
  const s = status?.toLowerCase() || "";
  if (s.includes("open") || s.includes("current")) return "badge--green";
  if (s.includes("closed")) return "badge--gray";
  if (s.includes("collection") || s.includes("charge")) return "badge--red";
  if (s.includes("late") || s.includes("delinquent")) return "badge--orange";
  return "badge--yellow";
}

function severityBadge(severity: string): string {
  switch (severity) {
    case "high": return "badge--red";
    case "medium": return "badge--orange";
    case "low": return "badge--yellow";
    default: return "badge--gray";
  }
}

// ── NormalizedReport → ReportData converter ──────────

interface NormalizedField<T> {
  normalized: T;
  original: string | null;
}

interface NormalizedReportShape {
  providerName: string;
  sourceType: string;
  reportDate: string | null;
  importDate: string;
  bureauSections: Array<{
    bureau: string;
    consumer: {
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
    };
    scores: Array<{
      bureau: NormalizedField<string>;
      score: NormalizedField<number | null>;
      model: NormalizedField<string>;
      date: NormalizedField<string>;
      factors: NormalizedField<string[]>;
    }>;
    tradelines: Array<{
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
    }>;
    collections: Array<{
      collectionAgency: NormalizedField<string>;
      originalCreditor: NormalizedField<string>;
      amount: NormalizedField<number | null>;
      accountNumber: NormalizedField<string>;
      dateAssigned: NormalizedField<string>;
      status: NormalizedField<string>;
      confidence: number;
    }>;
    inquiries: Array<{
      bureau: NormalizedField<string>;
      inquiryDate: NormalizedField<string>;
      companyName: NormalizedField<string>;
      inquiryType: NormalizedField<"hard" | "soft">;
      confidence: number;
    }>;
    publicRecords: Array<{
      bureau: NormalizedField<string>;
      recordType: NormalizedField<string>;
      recordDate: NormalizedField<string>;
      court: NormalizedField<string>;
      referenceNumber: NormalizedField<string>;
      amount: NormalizedField<number | null>;
      status: NormalizedField<string>;
      confidence: number;
    }>;
  }>;
}

function nfVal<T>(f: NormalizedField<T> | undefined): T {
  return f ? f.normalized : (null as unknown as T);
}

function convertNormalizedToReportData(
  normReport: NormalizedReportShape,
  reportId: number
): ReportData {
  const sections = normReport.bureauSections || [];
  const firstSection = sections[0];
  const consumer = firstSection?.consumer;

  const scores: ScoreData[] = [];
  const tradelines: TradelineData[] = [];
  const collections: CollectionData[] = [];
  const inquiries: InquiryData[] = [];
  const publicRecords: PublicRecordData[] = [];

  for (const section of sections) {
    // Scores
    for (const s of section.scores) {
      scores.push({
        bureau: nfVal(s.bureau),
        score: nfVal(s.score) ?? 0,
        model: nfVal(s.model),
        date: nfVal(s.date),
        confidence: 1,
      });
    }
    // Tradelines
    for (const tl of section.tradelines) {
      tradelines.push({
        bureau: section.bureau,
        creditorName: nfVal(tl.creditorName),
        originalCreditorName: nfVal(tl.originalCreditorName),
        maskedAccountNumber: nfVal(tl.maskedAccountNumber),
        accountType: nfVal(tl.accountType),
        ownership: nfVal(tl.ownership),
        accountStatus: nfVal(tl.accountStatus),
        paymentStatus: nfVal(tl.paymentStatus),
        balance: nfVal(tl.balance) ?? undefined,
        creditLimit: nfVal(tl.creditLimit) ?? undefined,
        pastDueAmount: nfVal(tl.pastDueAmount) ?? undefined,
        highBalance: nfVal(tl.highBalance) ?? undefined,
        monthlyPayment: nfVal(tl.monthlyPayment) ?? undefined,
        dateOpened: nfVal(tl.dateOpened),
        dateClosed: nfVal(tl.dateClosed),
        dateReported: nfVal(tl.dateReported),
        dateOfLastActivity: nfVal(tl.dateOfLastActivity),
        firstDelinquencyDate: nfVal(tl.firstDelinquencyDate),
        paymentHistory: nfVal(tl.paymentHistory),
        remarks: nfVal(tl.remarks),
        disputeIndicator: nfVal(tl.disputeIndicator),
        confidence: tl.confidence ?? 1,
      });
    }
    // Collections
    for (const c of section.collections) {
      collections.push({
        bureau: section.bureau,
        collectionAgency: nfVal(c.collectionAgency),
        originalCreditor: nfVal(c.originalCreditor),
        amount: nfVal(c.amount) ?? 0,
        accountNumber: nfVal(c.accountNumber),
        dateAssigned: nfVal(c.dateAssigned),
        status: nfVal(c.status),
        confidence: c.confidence ?? 1,
      });
    }
    // Inquiries
    for (const i of section.inquiries) {
      inquiries.push({
        bureau: nfVal(i.bureau) || section.bureau,
        inquiryDate: nfVal(i.inquiryDate),
        companyName: nfVal(i.companyName),
        inquiryType: nfVal(i.inquiryType) || "soft",
        confidence: i.confidence ?? 1,
      });
    }
    // Public records
    for (const pr of section.publicRecords) {
      publicRecords.push({
        bureau: nfVal(pr.bureau) || section.bureau,
        recordType: nfVal(pr.recordType),
        recordDate: nfVal(pr.recordDate),
        court: nfVal(pr.court),
        referenceNumber: nfVal(pr.referenceNumber),
        amount: nfVal(pr.amount) ?? undefined,
        status: nfVal(pr.status),
        confidence: pr.confidence ?? 1,
      });
    }
  }

  return {
    reportId,
    provider: normReport.providerName || "Unknown",
    providerConfidence: 1,
    matchedPattern: normReport.sourceType || "synthetic",
    reportDate: normReport.reportDate,
    personalInfo: {
      data: {
        fullName: consumer ? nfVal(consumer.fullName) : "",
        addressLine1: consumer ? nfVal(consumer.addressLine1) : "",
        addressLine2: consumer ? nfVal(consumer.addressLine2) : "",
        city: consumer ? nfVal(consumer.city) : "",
        state: consumer ? nfVal(consumer.state) : "",
        zip: consumer ? nfVal(consumer.zip) : "",
        ssnLast4: consumer ? nfVal(consumer.ssnLast4) : "",
        dateOfBirth: consumer ? nfVal(consumer.dateOfBirth) : "",
        phone: consumer ? nfVal(consumer.phone) : "",
        employer: consumer ? nfVal(consumer.employer) : "",
      },
      confidence: {
        fullName: 1,
        addressLine1: 1,
        addressLine2: 1,
        city: 1,
        state: 1,
        zip: 1,
        ssnLast4: 1,
        dateOfBirth: 1,
        phone: 1,
        employer: 1,
      },
    },
    scores,
    tradelines,
    collections,
    inquiries,
    publicRecords,
    remarks: [],
    bureauCount: sections.length,
    extractionConfidence: 1,
  };
}

// ── Component ─────────────────────────────────────

export default function ReportReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reportId = id ? parseInt(id, 10) : 0;

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [normalization, setNormalization] = useState<NormalizationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeBureau, setActiveBureau] = useState("Equifax");
  const [activeScoreBureau, setActiveScoreBureau] = useState("Equifax");
  const [activeSection, setActiveSection] = useState<"tradelines" | "collections" | "inquiries" | "publicRecords">("tradelines");

  // Editable fields: key = "section:index:field", value = new value
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Editing state for each field
  const [editingField, setEditingField] = useState<string | null>(null);

  // Personal info edits
  const [piEdits, setPiEdits] = useState<Partial<PersonalInfoData>>({});

  // Acknowledged discrepancies
  const [ackedDiscrepancies, setAckedDiscrepancies] = useState<Set<number>>(new Set());
  // Accuracy confirmation checkbox
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  // Submitting
  const [submitting, setSubmitting] = useState(false);
  // Expandable cards
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["collections", "inquiries", "publicRecords"]));

  // ── Load data ───────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        // Try sessionStorage first (post-upload or post-retrieval flow)
        const cachedKey = `report_data_${reportId}`;
        const cached = sessionStorage.getItem(cachedKey);
        if (cached) {
          const parsed = JSON.parse(cached);

          // Check if this is a retrieval response (has "report" + "matches")
          if (parsed.report && parsed.matches) {
            // Retrieval flow — convert normalized report to ReportData format
            const normReport = parsed.report;
            const flat = convertNormalizedToReportData(normReport, reportId);
            setReportData(flat);

            if (flat.tradelines.length > 0) {
              setActiveBureau(flat.tradelines[0]?.bureau || "Equifax");
            }
            if (flat.scores.length > 0) {
              setActiveScoreBureau(flat.scores[0]?.bureau || "Equifax");
            }

            setNormalization({
              normalizedReport: normReport,
              crossBureauMatches: parsed.matches || [],
              allDiscrepancies: parsed.discrepancies || [],
              stats: parsed.stats || { bureauCount: 0, totalTradelines: 0, totalMatches: 0, totalDiscrepancies: 0 },
            });
          } else {
            // Upload flow — existing ReportData format
            const reportData = parsed as ReportData;
            setReportData(reportData);
            if (reportData.tradelines.length > 0) {
              const first = reportData.tradelines[0]?.bureau;
              if (first) setActiveBureau(first);
            }
            if (reportData.scores.length > 0) {
              const firstScore = reportData.scores[0]?.bureau;
              if (firstScore) setActiveScoreBureau(firstScore);
            }

            // Trigger normalization
            try {
              const normResult = await normalizeReportData(
                reportData as unknown as Record<string, unknown>,
                reportData.provider
              );
              setNormalization(normResult);
            } catch {
              console.warn("[review] Normalization unavailable, proceeding without cross-bureau matches");
            }
          }
          sessionStorage.removeItem(cachedKey); // clean up
        } else {
          // Try fetching from the server
          try {
            // First try the /data endpoint (post-retrieval reports)
            const dataRes = await fetch(`/api/reports/${reportId}/data`);
            if (dataRes.ok) {
              const { report: normReport } = await dataRes.json();
              const flat = convertNormalizedToReportData(normReport, reportId);
              setReportData(flat);
              if (flat.tradelines.length > 0) {
                setActiveBureau(flat.tradelines[0]?.bureau || "Equifax");
              }
              if (flat.scores.length > 0) {
                setActiveScoreBureau(flat.scores[0]?.bureau || "Equifax");
              }
              // Also trigger normalization for cross-bureau data
              try {
                const normResult = await normalizeReportData(
                  flat as unknown as Record<string, unknown>,
                  flat.provider
                );
                setNormalization(normResult);
              } catch {
                console.warn("[review] Normalization unavailable");
              }
            } else {
              // Fall back to metadata
              const meta = await fetchReport(reportId);
              setReportData({
                reportId: meta.id,
                provider: meta.provider_name,
                providerConfidence: 1,
                matchedPattern: meta.source_type,
                reportDate: meta.report_date,
                personalInfo: { data: {}, confidence: {} as PersonalInfoConfidence },
                scores: [],
                tradelines: [],
                collections: [],
                inquiries: [],
                publicRecords: [],
                remarks: [],
                bureauCount: meta.three_bureau_available ? 3 : 1,
                extractionConfidence: 1,
              });
            }
          } catch {
            setError("Report data not found. Please re-upload your report.");
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [reportId]);

  // ── Handlers ────────────────────────────────────

  const toggleCard = useCallback((idx: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const startEdit = (key: string) => setEditingField(key);
  const cancelEdit = () => setEditingField(null);

  const saveEdit = (key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setEditingField(null);
  };

  const handlePiEdit = (field: string, value: string) => {
    setPiEdits((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAckDiscrepancy = (idx: number) => {
    setAckedDiscrepancies((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!accuracyConfirmed) return;
    setSubmitting(true);
    try {
      const allEdits: Record<string, unknown> = {};
      // Gather tradeline edits
      for (const [key, val] of Object.entries(edits)) {
        allEdits[key] = val;
      }
      // Gather personal info edits
      for (const [key, val] of Object.entries(piEdits)) {
        if (val) allEdits[`pi.${key}`] = val;
      }
      await confirmReport(reportId, allEdits);
      navigate("/", { state: { confirmed: true, reportId } });
    } catch (err) {
      alert(`Confirmation failed: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived data ────────────────────────────────

  const sourceBadge = reportData ? getSourceBadge(reportData.provider) : { label: "", className: "" };
  const allBureaus = reportData
    ? [...new Set(reportData.tradelines.map((t) => t.bureau))].sort()
    : BUREAUS;

  const bureauTradelines = reportData
    ? reportData.tradelines.filter((t) => t.bureau === activeBureau)
    : [];

  const bureauCollections = reportData
    ? reportData.collections.filter((c) => c.bureau === activeBureau)
    : [];

  const bureauInquiries = reportData
    ? reportData.inquiries.filter((c) => c.bureau === activeBureau)
    : [];

  const bureauPublicRecords = reportData
    ? reportData.publicRecords.filter((c) => c.bureau === activeBureau)
    : [];

  const bureauScores = reportData
    ? reportData.scores.filter((s) => s.bureau === activeScoreBureau)
    : [];

  // Cross-bureau match lookup: tradeline bureau + creditorName -> match info
  const matchLookup: Record<string, { matchConfidence: string; bureauCount: number }> = {};
  if (normalization) {
    for (const match of normalization.crossBureauMatches) {
      for (const acc of match.accounts) {
        const key = `${acc.bureau}::${acc.tradeline.creditorName.normalized}`;
        matchLookup[key] = {
          matchConfidence: match.matchConfidence,
          bureauCount: match.accounts.length,
        };
      }
    }
  }

  // Flatten all discrepancies for the panel
  const allDiscrepancies = normalization?.allDiscrepancies || [];

  // Discrepancies that need acknowledgment
  const unackedCount = allDiscrepancies.filter((_, i) => !ackedDiscrepancies.has(i)).length;

  // ── Render helpers ──────────────────────────────

  function renderConfidenceDot(confidence: number) {
    const cls = confidenceColor(confidence);
    return (
      <span className={`conf-dot ${cls}`} title={`Confidence: ${(confidence * 100).toFixed(0)}%`}>
        ●
      </span>
    );
  }

  function renderEditableField(
    sectionKey: string,
    field: string,
    value: string | number | undefined | null,
    confidence?: number,
    isMonetary?: boolean
  ) {
    const editKey = `${sectionKey}:${field}`;
    const displayValue = value != null ? (isMonetary ? formatCurrency(value as number) : String(value)) : "—";
    const isEditing = editingField === editKey;
    const currentEdit = edits[editKey] ?? displayValue;

    return (
      <div className={`review-field ${confidence != null && confidence < 0.7 ? "review-field--low-conf" : ""}`}>
        <span className="review-field__label">{field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}</span>
        <div className="review-field__value">
          {confidence != null && renderConfidenceDot(confidence)}
          {isEditing ? (
            <span className="review-field__edit-inline">
              <input
                className="review-field__input"
                type="text"
                value={currentEdit}
                onChange={(e) => setEdits((p) => ({ ...p, [editKey]: e.target.value }))}
                autoFocus
              />
              <button className="btn btn--sm btn--primary" onClick={() => saveEdit(editKey, currentEdit)}>✓</button>
              <button className="btn btn--sm btn--outline" onClick={cancelEdit}>✕</button>
            </span>
          ) : (
            <span className="review-field__text" onClick={() => startEdit(editKey)} title="Click to edit">
              {displayValue}
              <span className="review-field__edit-icon">✎</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  function renderPaymentHistory(history: string[]) {
    if (!history || history.length === 0) return <span className="text--muted">No history</span>;
    const maxShow = 24;
    const display = history.slice(-maxShow);
    return (
      <div className="payment-history">
        <span className="payment-history__label">Payment History ({history.length} mo):</span>
        <div className="payment-history__bars">
          {display.map((code, i) => (
            <span
              key={i}
              className={`payment-history__bar ${getPaymentHistoryColor(code)}`}
              title={`Month ${history.length - display.length + i + 1}: ${code}`}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Loading / Error ─────────────────────────────

  if (loading) {
    return (
      <div className="review-page">
        <div className="review-page__loading">Loading report data…</div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="review-page">
        <div className="review-page__error">{error || "Report not found"}</div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────

  return (
    <div className="review-page">
      {/* ── Header ── */}
      <header className="review-header">
        <div className="review-header__top">
          <div>
            <h1 className="review-header__title">Report Review</h1>
            <div className="review-header__meta">
              <span className="review-header__provider">{reportData.provider}</span>
              <span className={`provider-badge ${sourceBadge.className}`}>{sourceBadge.label}</span>
              <span className="review-header__date">
                Report date: {formatDate(reportData.reportDate)} &middot; Imported: {formatDate(new Date().toISOString())}
              </span>
            </div>
          </div>
          <div className="review-header__confidence">
            <div className={`confidence-score ${pctColor(reportData.extractionConfidence)}`}>
              {(reportData.extractionConfidence * 100).toFixed(0)}%
            </div>
            <span className="confidence-label">Extraction Confidence</span>
          </div>
        </div>
        <p className="review-header__notice">
          Data needs your review. Low-confidence fields are highlighted below.
        </p>
      </header>

      {/* ── Section 1: Personal Information ── */}
      <section className="review-section">
        <h2 className="review-section__title">Personal Information</h2>
        <div className="review-card">
          <div className="review-card__grid">
            {reportData.personalInfo.data && Object.entries(reportData.personalInfo.data).map(([field, value]) => {
              const conf = reportData.personalInfo.confidence?.[field as keyof PersonalInfoConfidence] ?? 1;
              const editValue = piEdits[field as keyof PersonalInfoData] ?? value ?? "";
              return (
                <div key={field} className={`review-field ${conf < 0.7 ? "review-field--low-conf" : ""}`}>
                  <span className="review-field__label">
                    {field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                  </span>
                  <div className="review-field__value">
                    {renderConfidenceDot(conf)}
                    <input
                      className="review-field__input"
                      type="text"
                      value={editValue}
                      onChange={(e) => handlePiEdit(field, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Section 2: Credit Scores ── */}
      <section className="review-section">
        <h2 className="review-section__title">Credit Scores</h2>
        <div className="bureau-tabs">
          {BUREAUS.map((b) => (
            <button
              key={b}
              className={`bureau-tab ${activeScoreBureau === b ? "bureau-tab--active" : ""}`}
              onClick={() => setActiveScoreBureau(b)}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="review-card">
          {bureauScores.length > 0 ? (
            bureauScores.map((score, i) => (
              <div key={i} className="score-display">
                {renderConfidenceDot(score.confidence)}
                <div className="score-display__value">{score.score}</div>
                <div className="score-display__model">{score.model}</div>
                <div className="score-display__date">{formatDate(score.date)}</div>
              </div>
            ))
          ) : (
            <p className="text--muted">No scores available for {activeScoreBureau}.</p>
          )}
        </div>
      </section>

      {/* ── Section 3: Accounts (Tradelines) ── */}
      <section className="review-section">
        <h2 className="review-section__title">Accounts</h2>
        <div className="bureau-tabs">
          {allBureaus.map((b) => (
            <button
              key={b}
              className={`bureau-tab ${activeBureau === b ? "bureau-tab--active" : ""}`}
              onClick={() => { setActiveBureau(b); setActiveSection("tradelines"); }}
            >
              {b} ({reportData.tradelines.filter((t) => t.bureau === b).length})
            </button>
          ))}
        </div>

        {bureauTradelines.length === 0 ? (
          <p className="text--muted">No accounts found for {activeBureau}.</p>
        ) : (
          <div className="account-list">
            {bureauTradelines.map((tl, idx) => {
              const globalIdx = reportData.tradelines.indexOf(tl);
              const isExpanded = expandedCards.has(globalIdx);
              const matchKey = `${tl.bureau}::${tl.creditorName}`;
              const match = matchLookup[matchKey];

              return (
                <div key={globalIdx} className={`account-card ${tl.confidence < 0.7 ? "account-card--low-conf" : ""}`}>
                  <div className="account-card__header" onClick={() => toggleCard(globalIdx)}>
                    <div className="account-card__summary">
                      <span className="account-card__name">{tl.creditorName}</span>
                      <span className="account-card__account">••••{tl.maskedAccountNumber.slice(-4)}</span>
                      <span className={`provider-badge ${getStatusBadge(tl.accountStatus)}`}>
                        {tl.accountStatus}
                      </span>
                      {match && match.bureauCount > 1 && (
                        <span className="account-card__match" title={`Matched across ${match.bureauCount} bureaus`}>
                          🔗 Matched across {match.bureauCount} bureaus
                        </span>
                      )}
                    </div>
                    <div className="account-card__quick">
                      <span>{formatCurrency(tl.balance)}</span>
                      <span className={`account-card__expand ${isExpanded ? "expanded" : ""}`}>▼</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="account-card__body">
                      <div className="review-card__grid">
                        {renderEditableField(`tl.${globalIdx}`, "creditorName", tl.creditorName, tl.confidence)}
                        {renderEditableField(`tl.${globalIdx}`, "maskedAccountNumber", tl.maskedAccountNumber)}
                        {renderEditableField(`tl.${globalIdx}`, "accountType", tl.accountType)}
                        {renderEditableField(`tl.${globalIdx}`, "ownership", tl.ownership)}
                        {renderEditableField(`tl.${globalIdx}`, "accountStatus", tl.accountStatus)}
                        {renderEditableField(`tl.${globalIdx}`, "paymentStatus", tl.paymentStatus)}
                        {renderEditableField(`tl.${globalIdx}`, "balance", tl.balance, undefined, true)}
                        {renderEditableField(`tl.${globalIdx}`, "creditLimit", tl.creditLimit, undefined, true)}
                        {renderEditableField(`tl.${globalIdx}`, "pastDueAmount", tl.pastDueAmount, undefined, true)}
                        {renderEditableField(`tl.${globalIdx}`, "highBalance", tl.highBalance, undefined, true)}
                        {renderEditableField(`tl.${globalIdx}`, "monthlyPayment", tl.monthlyPayment, undefined, true)}
                        {renderEditableField(`tl.${globalIdx}`, "dateOpened", tl.dateOpened)}
                        {renderEditableField(`tl.${globalIdx}`, "dateClosed", tl.dateClosed)}
                        {renderEditableField(`tl.${globalIdx}`, "dateReported", tl.dateReported)}
                        {renderEditableField(`tl.${globalIdx}`, "dateOfLastActivity", tl.dateOfLastActivity)}
                        {renderEditableField(`tl.${globalIdx}`, "firstDelinquencyDate", tl.firstDelinquencyDate)}
                        {renderEditableField(`tl.${globalIdx}`, "remarks", tl.remarks)}
                      </div>
                      {renderPaymentHistory(tl.paymentHistory)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 4: Collections, Inquiries, Public Records ── */}
      <section className="review-section">
        <h2 className="review-section__title">Other Records</h2>

        {/* Collections */}
        <div className={`expandable-section ${expandedSections.has("collections") ? "expanded" : ""}`}>
          <div className="expandable-section__header" onClick={() => toggleSection("collections")}>
            <span>Collections ({bureauCollections.length})</span>
            <span className="expandable-section__arrow">▼</span>
          </div>
          {expandedSections.has("collections") && (
            <div className="expandable-section__body">
              {bureauCollections.length === 0 ? (
                <p className="text--muted">No collections for {activeBureau}.</p>
              ) : (
                bureauCollections.map((col, i) => (
                  <div key={i} className={`account-card ${col.confidence < 0.7 ? "account-card--low-conf" : ""}`}>
                    <div className="review-card__grid">
                      {renderEditableField(`col.${activeBureau}.${i}`, "collectionAgency", col.collectionAgency, col.confidence)}
                      {renderEditableField(`col.${activeBureau}.${i}`, "originalCreditor", col.originalCreditor)}
                      {renderEditableField(`col.${activeBureau}.${i}`, "amount", col.amount, undefined, true)}
                      {renderEditableField(`col.${activeBureau}.${i}`, "accountNumber", col.accountNumber)}
                      {renderEditableField(`col.${activeBureau}.${i}`, "dateAssigned", col.dateAssigned)}
                      {renderEditableField(`col.${activeBureau}.${i}`, "status", col.status)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Inquiries */}
        <div className={`expandable-section ${expandedSections.has("inquiries") ? "expanded" : ""}`}>
          <div className="expandable-section__header" onClick={() => toggleSection("inquiries")}>
            <span>Inquiries ({bureauInquiries.length})</span>
            <span className="expandable-section__arrow">▼</span>
          </div>
          {expandedSections.has("inquiries") && (
            <div className="expandable-section__body">
              {bureauInquiries.length === 0 ? (
                <p className="text--muted">No inquiries for {activeBureau}.</p>
              ) : (
                bureauInquiries.map((inq, i) => (
                  <div key={i} className={`account-card ${inq.confidence < 0.7 ? "account-card--low-conf" : ""}`}>
                    <div className="review-card__grid">
                      {renderEditableField(`inq.${activeBureau}.${i}`, "companyName", inq.companyName, inq.confidence)}
                      {renderEditableField(`inq.${activeBureau}.${i}`, "inquiryDate", inq.inquiryDate)}
                      <div className="review-field">
                        <span className="review-field__label">Inquiry Type</span>
                        <div className="review-field__value">
                          <span className={`provider-badge ${inq.inquiryType === "hard" ? "badge--orange" : "badge--gray"}`}>
                            {inq.inquiryType}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Public Records */}
        <div className={`expandable-section ${expandedSections.has("publicRecords") ? "expanded" : ""}`}>
          <div className="expandable-section__header" onClick={() => toggleSection("publicRecords")}>
            <span>Public Records ({bureauPublicRecords.length})</span>
            <span className="expandable-section__arrow">▼</span>
          </div>
          {expandedSections.has("publicRecords") && (
            <div className="expandable-section__body">
              {bureauPublicRecords.length === 0 ? (
                <p className="text--muted">No public records for {activeBureau}.</p>
              ) : (
                bureauPublicRecords.map((pr, i) => (
                  <div key={i} className={`account-card ${pr.confidence < 0.7 ? "account-card--low-conf" : ""}`}>
                    <div className="review-card__grid">
                      {renderEditableField(`pr.${activeBureau}.${i}`, "recordType", pr.recordType, pr.confidence)}
                      {renderEditableField(`pr.${activeBureau}.${i}`, "recordDate", pr.recordDate)}
                      {renderEditableField(`pr.${activeBureau}.${i}`, "court", pr.court)}
                      {renderEditableField(`pr.${activeBureau}.${i}`, "referenceNumber", pr.referenceNumber)}
                      {renderEditableField(`pr.${activeBureau}.${i}`, "amount", pr.amount, undefined, true)}
                      {renderEditableField(`pr.${activeBureau}.${i}`, "status", pr.status)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 5: Discrepancies Panel ── */}
      {allDiscrepancies.length > 0 && (
        <section className="review-section review-section--discrepancies">
          <h2 className="review-section__title">
            ⚠️ Data Discrepancies ({unackedCount} unacknowledged)
          </h2>
          <div className="discrepancy-panel">
            <p className="discrepancy-panel__desc">
              The normalization engine detected the following discrepancies across bureaus. Please review and acknowledge each one.
            </p>
            {allDiscrepancies.map((d, i) => (
              <div key={i} className={`discrepancy-item ${ackedDiscrepancies.has(i) ? "discrepancy-item--acked" : ""}`}>
                <label className="discrepancy-item__label">
                  <input
                    type="checkbox"
                    checked={ackedDiscrepancies.has(i)}
                    onChange={() => toggleAckDiscrepancy(i)}
                  />
                  <span className="discrepancy-item__field">{d.field}</span>
                </label>
                <div className="discrepancy-item__values">
                  <span><strong>{d.bureauA}:</strong> {d.valueA || "—"}</span>
                  <span className="discrepancy-item__vs">vs</span>
                  <span><strong>{d.bureauB}:</strong> {d.valueB || "—"}</span>
                </div>
                <span className={`provider-badge ${severityBadge(d.severity)}`}>{d.severity}</span>
                <p className="discrepancy-item__desc">{d.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Sticky Bottom Bar ── */}
      <div className="confirm-bar">
        <div className="confirm-bar__inner">
          <div className="confirm-bar__left">
            <label className="confirm-bar__checkbox">
              <input
                type="checkbox"
                checked={accuracyConfirmed}
                onChange={(e) => setAccuracyConfirmed(e.target.checked)}
              />
              <span>
                <strong>Data Accuracy:</strong> I confirm the information shown is accurate to the best of my knowledge
              </span>
            </label>
            <p className="confirm-bar__notice">
              I understand that disputes based on unconfirmed data will not be submitted.
            </p>
          </div>
          <div className="confirm-bar__right">
            <button
              className="btn btn--outline"
              onClick={() => navigate("/")}
            >
              Save & Continue Later
            </button>
            <button
              className="btn btn--primary btn--lg"
              disabled={!accuracyConfirmed || unackedCount > 0 || submitting}
              onClick={handleConfirm}
            >
              {submitting ? "Confirming…" : "Confirm All Data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
