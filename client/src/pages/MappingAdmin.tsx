import { useState, useEffect, useCallback } from "react";
import "../styles/admin.css";

// ── Types ──────────────────────────────────────

interface ProviderSummary {
  providerName: string;
  version: string;
  lastUpdated: string;
  status: string;
  fieldCount: number;
}

interface MappingEntry {
  canonicalField: string;
  providerFieldNames: string[];
  transformFn: string;
}

interface MappingSection {
  sectionName: string;
  entries: MappingEntry[];
}

interface ProviderMapping {
  providerName: string;
  version: string;
  lastUpdated: string;
  status: string;
  sections: Record<string, MappingSection>;
  rawMapping: any;
}

interface RawField {
  section: string;
  sectionName: string;
  fieldName: string;
  sampleValue: string | null;
  confidence: number;
}

interface TestResult {
  rawField: string;
  rawValue: unknown;
  transformedValue: unknown;
  canonicalField: string;
}

interface VersionEntry {
  version: string;
  timestamp: string;
  status: string;
  changes: string;
  approvedBy?: string;
}

interface ExtractionFailure {
  id: string;
  providerName: string;
  timestamp: string;
  section: string;
  rawText: string;
  reason: string;
  status: string;
}

// ── Canonical field options ────────────────────

const CANONICAL_FIELDS = [
  { group: "Personal Info", fields: ["fullName", "addressLine1", "addressLine2", "city", "state", "zip", "ssnLast4", "dateOfBirth", "phone", "employer"] },
  { group: "Scores", fields: ["bureau", "score", "model", "date", "factors"] },
  { group: "Tradelines", fields: ["creditorName", "originalCreditorName", "maskedAccountNumber", "accountType", "ownership", "accountStatus", "paymentStatus", "balance", "creditLimit", "pastDueAmount", "highBalance", "monthlyPayment", "dateOpened", "dateClosed", "dateReported", "dateOfLastActivity", "firstDelinquencyDate", "paymentHistory", "remarks", "disputeIndicator", "providerSpecificId"] },
  { group: "Collections", fields: ["collectionAgency", "originalCreditor", "amount", "accountNumber", "dateAssigned", "status"] },
  { group: "Inquiries", fields: ["inquiryDate", "companyName", "inquiryType"] },
  { group: "Public Records", fields: ["recordType", "recordDate", "court", "referenceNumber", "amount", "status"] },
];

const TRANSFORMS = [
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

const API_BASE = "http://localhost:3001/api/admin";

// ── Component ──────────────────────────────────

export default function MappingAdmin() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [providerMapping, setProviderMapping] = useState<ProviderMapping | null>(null);
  const [rawFields, setRawFields] = useState<RawField[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [failures, setFailures] = useState<ExtractionFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [testSection, setTestSection] = useState("tradelines");
  const [testSampleJson, setTestSampleJson] = useState(
    '{\n  "creditorName": "CHASE BANK",\n  "balance": "$1,234.56",\n  "accountType": "Revolving",\n  "dateOpened": "01/15/2020"\n}'
  );
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // ── Local mapping edits ──────────────────────
  const [localMapping, setLocalMapping] = useState<ProviderMapping | null>(null);

  // ── Fetch providers ──────────────────────────
  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/mappings`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProviders(data);
      if (data.length > 0 && !selectedProvider) {
        setSelectedProvider(data[0].providerName);
      }
    } catch (err: any) {
      setError(err.message);
    }
  }, [selectedProvider]);

  useEffect(() => {
    fetchProviders();
  }, []);

  // ── Load provider details ────────────────────
  const loadProvider = useCallback(async (name: string) => {
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      const [mapRes, rawRes, verRes, failRes] = await Promise.all([
        fetch(`${API_BASE}/mappings/${name}`),
        fetch(`${API_BASE}/mappings/${name}/raw-fields`),
        fetch(`${API_BASE}/mappings/${name}/versions`),
        fetch(`${API_BASE}/extraction-failures`),
      ]);
      if (!mapRes.ok) throw new Error(`Mapping: HTTP ${mapRes.status}`);

      const mapping = await mapRes.json();
      setProviderMapping(mapping);
      setLocalMapping(JSON.parse(JSON.stringify(mapping)));

      if (rawRes.ok) {
        const rawData = await rawRes.json();
        setRawFields(rawData.rawFields || []);
      }
      if (verRes.ok) {
        const verData = await verRes.json();
        setVersions(verData.versions || []);
      }
      if (failRes.ok) {
        const failData = await failRes.json();
        setFailures(failData.failures || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProvider) {
      loadProvider(selectedProvider);
    }
  }, [selectedProvider, loadProvider]);

  // ── Run test ──────────────────────────────────
  const runTest = async () => {
    if (!selectedProvider) return;
    setLoading(true);
    try {
      let sampleData: any;
      try {
        sampleData = JSON.parse(testSampleJson);
      } catch {
        setError("Invalid JSON in sample data");
        setLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE}/mappings/${selectedProvider}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sampleData, section: testSection }),
      });
      if (!res.ok) throw new Error(`Test: HTTP ${res.status}`);
      const data = await res.json();
      setTestResults(data.results || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Save / Submit / Approve ──────────────────
  const saveMapping = async (status: string) => {
    if (!selectedProvider || !localMapping?.rawMapping) return;
    setLoading(true);
    setSaveStatus(null);
    try {
      const changes =
        status === "approved"
          ? "Approved mapping"
          : status === "pending_approval"
            ? "Submitted for approval"
            : "Draft saved";
      const res = await fetch(`${API_BASE}/mappings/${selectedProvider}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping: localMapping.rawMapping,
          status,
          changes,
          approvedBy: "admin",
        }),
      });
      if (!res.ok) throw new Error(`Save: HTTP ${res.status}`);
      const data = await res.json();
      setSaveStatus(`Saved as ${status} — v${data.version}`);
      // Reload to reflect changes
      loadProvider(selectedProvider);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Rollback ──────────────────────────────────
  const rollback = async (targetVersion: string) => {
    if (!selectedProvider) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/mappings/${selectedProvider}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion }),
      });
      if (!res.ok) throw new Error(`Rollback: HTTP ${res.status}`);
      setSaveStatus(`Rolled back to ${targetVersion}`);
      setShowVersionModal(false);
      loadProvider(selectedProvider);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Update a single mapping entry locally ────
  const updateEntry = (sectionKey: string, idx: number, updates: Partial<MappingEntry>) => {
    if (!localMapping || !localMapping.rawMapping) return;
    const next = JSON.parse(JSON.stringify(localMapping)) as ProviderMapping;
    const section = next.rawMapping[sectionKey];
    if (section && section[idx]) {
      Object.assign(section[idx], updates);
      next.sections[sectionKey].entries[idx] = {
        ...next.sections[sectionKey].entries[idx],
        ...updates,
      };
      setLocalMapping(next);
    }
  };

  // ── Toggle unsupported for an entry ──────────
  const toggleUnsupported = (sectionKey: string, idx: number) => {
    if (!localMapping || !localMapping.rawMapping) return;
    const next = JSON.parse(JSON.stringify(localMapping)) as ProviderMapping;
    const entry = next.rawMapping[sectionKey]?.[idx];
    const uiEntry = next.sections[sectionKey]?.entries[idx];
    if (entry && uiEntry) {
      if (entry.canonicalField === "__unsupported__") {
        // Re-enable: restore the last known canonical field
        entry.canonicalField = entry._lastCanonical || uiEntry.canonicalField;
        delete entry._lastCanonical;
        uiEntry.canonicalField = entry.canonicalField;
      } else {
        entry._lastCanonical = entry.canonicalField;
        entry.canonicalField = "__unsupported__";
        uiEntry.canonicalField = "__unsupported__";
      }
      setLocalMapping(next);
    }
  };

  // ── Helpers ───────────────────────────────────
  const getEntryStatus = (entry: MappingEntry) => {
    if (entry.canonicalField === "__unsupported__") return "unsupported";
    if (entry.canonicalField && entry.providerFieldNames.length > 0) return "mapped";
    return "unmapped";
  };

  const formatDate = (ts: string) => {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "approved": return "badge--green";
      case "pending_approval": return "badge--amber";
      case "draft": return "badge--yellow";
      case "rolled_back": return "badge--red";
      default: return "badge--gray";
    }
  };

  // ── Render ────────────────────────────────────
  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h1>Mapping Admin</h1>
        <p className="admin-page__subtitle">Super-admin — Provider field mapping editor</p>
      </header>

      {error && (
        <div className="admin-error">
          {error}
          <button className="admin-error__dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {saveStatus && (
        <div className="admin-success">
          {saveStatus}
          <button className="admin-success__dismiss" onClick={() => setSaveStatus(null)}>×</button>
        </div>
      )}

      {/* Provider Selector */}
      <div className="admin-toolbar">
        <div className="admin-toolbar__left">
          <label className="admin-label">Provider:</label>
          <select
            className="admin-select"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.providerName} value={p.providerName}>
                {p.providerName} — v{p.version} ({p.status})
              </option>
            ))}
          </select>
          {providerMapping && (
            <span className={`provider-badge ${statusBadgeClass(providerMapping.status)}`}>
              {providerMapping.status}
            </span>
          )}
        </div>

        <div className="admin-toolbar__right">
          <button className="btn btn--outline btn--sm" onClick={() => saveMapping("draft")} disabled={loading}>
            Save as Draft
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => saveMapping("pending_approval")} disabled={loading}>
            Submit for Approval
          </button>
          <button className="btn btn--sm" style={{ background: "#16a34a", color: "#fff" }} onClick={() => saveMapping("approved")} disabled={loading}>
            Approve
          </button>
          <button className="btn btn--outline btn--sm" onClick={() => setShowVersionModal(true)}>
            Version History
          </button>
        </div>
      </div>

      {loading && <div className="admin-loading">Loading...</div>}

      {/* 3-Column Layout */}
      <div className="admin-grid">
        {/* Column 1: Raw Provider Fields */}
        <div className="admin-col admin-col--raw">
          <h2 className="admin-col__title">Raw Provider Fields</h2>
          <div className="admin-col__scroll">
            {rawFields.length === 0 && (
              <p className="admin-empty">No raw fields loaded</p>
            )}
            {rawFields.map((rf, i) => (
              <div key={i} className="raw-field-item">
                <div className="raw-field-item__header">
                  <span className="raw-field-item__section">{rf.sectionName}</span>
                  <span className="raw-field-item__confidence" title="Detection confidence">
                    {Math.round(rf.confidence * 100)}%
                  </span>
                </div>
                <code className="raw-field-item__name">{rf.fieldName}</code>
                {rf.sampleValue && (
                  <div className="raw-field-item__sample">Sample: {rf.sampleValue}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Mapping Editor */}
        <div className="admin-col admin-col--editor">
          <h2 className="admin-col__title">Mapping Editor</h2>
          <div className="admin-col__scroll">
            {localMapping && Object.entries(localMapping.sections).map(([sectionKey, section]) => (
              <div key={sectionKey} className="editor-section">
                <h3 className="editor-section__title">{section.sectionName}</h3>
                {section.entries.map((entry, idx) => {
                  const status = getEntryStatus(entry);
                  return (
                    <div key={idx} className={`editor-entry editor-entry--${status}`}>
                      <div className="editor-entry__header">
                        <code className="editor-entry__raw">{entry.providerFieldNames[0] || "(none)"}</code>
                        <span className={`editor-entry__status editor-entry__status--${status}`}>
                          {status}
                        </span>
                      </div>
                      <div className="editor-entry__controls">
                        <select
                          className="admin-select admin-select--sm"
                          value={entry.canonicalField}
                          onChange={(e) => updateEntry(sectionKey, idx, { canonicalField: e.target.value })}
                          disabled={entry.canonicalField === "__unsupported__"}
                        >
                          <option value="">-- Select canonical --</option>
                          <option value="__unsupported__">⚠ Unsupported</option>
                          {CANONICAL_FIELDS.map((group) => (
                            <optgroup key={group.group} label={group.group}>
                              {group.fields.map((f) => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <select
                          className="admin-select admin-select--sm"
                          value={entry.transformFn}
                          onChange={(e) => updateEntry(sectionKey, idx, { transformFn: e.target.value })}
                        >
                          {TRANSFORMS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button
                          className={`btn btn--sm ${entry.canonicalField === "__unsupported__" ? "btn--unsupported-active" : "btn--outline"}`}
                          onClick={() => toggleUnsupported(sectionKey, idx)}
                          title="Toggle unsupported"
                        >
                          {entry.canonicalField === "__unsupported__" ? "Re-enable" : "Unsupported"}
                        </button>
                      </div>
                      <div className="editor-entry__names">
                        {entry.providerFieldNames.map((n, ni) => (
                          <code key={ni} className="editor-entry__alias">{n}</code>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Test Results */}
        <div className="admin-col admin-col--test">
          <h2 className="admin-col__title">Test Results</h2>

          <div className="test-controls">
            <label className="admin-label">Section:</label>
            <select
              className="admin-select admin-select--sm"
              value={testSection}
              onChange={(e) => setTestSection(e.target.value)}
            >
              <option value="personalInfo">Personal Info</option>
              <option value="scores">Scores</option>
              <option value="tradelines">Tradelines</option>
              <option value="collections">Collections</option>
              <option value="inquiries">Inquiries</option>
              <option value="publicRecords">Public Records</option>
            </select>
          </div>

          <textarea
            className="admin-textarea"
            rows={8}
            value={testSampleJson}
            onChange={(e) => setTestSampleJson(e.target.value)}
            placeholder="Paste raw sample JSON..."
          />

          <button className="btn btn--primary btn--sm" onClick={runTest} disabled={loading} style={{ marginTop: "0.5rem", width: "100%" }}>
            Run Test
          </button>

          <div className="admin-col__scroll" style={{ marginTop: "0.75rem" }}>
            {testResults.length === 0 && (
              <p className="admin-empty">Run a test to see results</p>
            )}
            {testResults.map((tr, i) => (
              <div key={i} className="test-result-item">
                <div className="test-result-item__header">
                  <code className="test-result-item__canonical">{tr.canonicalField}</code>
                  <span className="test-result-item__arrow">→</span>
                  <code className="test-result-item__raw">{tr.rawField}</code>
                </div>
                <div className="test-result-item__values">
                  <div className="test-value">
                    <span className="test-value__label">Raw:</span>
                    <code className="test-value__data">{String(tr.rawValue ?? "null")}</code>
                  </div>
                  <div className="test-value">
                    <span className="test-value__label">Norm:</span>
                    <code className="test-value__data test-value__data--norm">{String(tr.transformedValue ?? "null")}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Extraction Failures */}
          <div className="failures-section" style={{ marginTop: "1rem" }}>
            <h3 className="failures-section__title">Recent Extraction Failures</h3>
            {failures.filter((f) => f.providerName === selectedProvider).length === 0 && (
              <p className="admin-empty">No failures for this provider</p>
            )}
            {failures
              .filter((f) => f.providerName === selectedProvider)
              .map((f) => (
                <div key={f.id} className={`failure-item failure-item--${f.status}`}>
                  <div className="failure-item__header">
                    <span className="failure-item__section">{f.section}</span>
                    <span className="failure-item__time">{formatDate(f.timestamp)}</span>
                  </div>
                  <div className="failure-item__text">{f.rawText}</div>
                  <div className="failure-item__reason">{f.reason}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Version History Modal */}
      {showVersionModal && (
        <div className="admin-modal-overlay" onClick={() => setShowVersionModal(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal__header">
              <h2>Version History — {selectedProvider}</h2>
              <button className="admin-modal__close" onClick={() => setShowVersionModal(false)}>×</button>
            </div>
            <div className="admin-modal__body">
              {versions.length === 0 && <p className="admin-empty">No versions yet</p>}
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Changes</th>
                    <th>Approved By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...versions].reverse().map((v, i) => {
                    const isCurrent = i === 0;
                    return (
                      <tr key={v.version} className={isCurrent ? "admin-table__row--current" : ""}>
                        <td><code>{v.version}</code></td>
                        <td>{formatDate(v.timestamp)}</td>
                        <td>
                          <span className={`provider-badge ${statusBadgeClass(v.status)}`}>{v.status}</span>
                        </td>
                        <td>{v.changes}</td>
                        <td>{v.approvedBy || "—"}</td>
                        <td>
                          {!isCurrent && (
                            <button
                              className="btn btn--outline-danger btn--sm"
                              onClick={() => rollback(v.version)}
                            >
                              Rollback
                            </button>
                          )}
                          {isCurrent && <span className="admin-current-label">current</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
