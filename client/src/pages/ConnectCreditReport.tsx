import { useState, useEffect, useCallback, useRef } from "react";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import { fetchProviders } from "../lib/api";
import ProviderCard from "../components/ProviderCard";
import ConsentScreen from "../components/ConsentScreen";

/** Demo consumer ID — in production this comes from auth session */
const DEMO_CONSUMER_ID = "demo-consumer-001";

export default function ConnectCreditReport() {
  const [providers, setProviders] = useState<ProviderCapabilitiesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const [uploadedStructured, setUploadedStructured] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const structuredInputRef = useRef<HTMLInputElement>(null);

  // Consent screen state
  const [consentProvider, setConsentProvider] = useState<ProviderCapabilitiesRow | null>(null);

  useEffect(() => {
    fetchProviders()
      .then(setProviders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Handlers ─────────────────────────────

  const handleConnect = useCallback((name: string) => {
    const provider = providers.find((p) => p.provider_name === name);
    if (provider) {
      setConsentProvider(provider);
    } else {
      alert(`Provider "${name}" not found.`);
    }
  }, [providers]);

  const handleDisconnect = useCallback((name: string) => {
    // Disconnect already handled by ProviderCard; just log
    console.log(`[connect] Disconnected from ${name}`);
  }, []);

  const handleRefresh = useCallback((name: string) => {
    alert(`Refresh flow for ${name} is not yet implemented.`);
  }, []);

  const handleConsentAuthorize = useCallback(() => {
    // ProviderCard will handle the redirect; close consent screen
    setConsentProvider(null);
  }, []);

  const handleConsentCancel = useCallback(() => {
    setConsentProvider(null);
  }, []);

  const handlePdfDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setUploadedPdf(file);
    }
  }, []);

  const handlePdfChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadedPdf(file);
  }, []);

  const handleStructuredChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setUploadedStructured(file);
  }, []);

  // Providers that support report retrieval
  const reportProviders = providers.filter(
    (p) => p.report_retrieval_supported === 1
  );

  // Active + sandbox providers for Card 1
  const connectableProviders = providers.filter(
    (p) =>
      p.provider_status === "active" ||
      p.provider_status === "sandbox" ||
      p.provider_status === "inactive"
  );

  // ── Render ───────────────────────────────

  if (loading) {
    return (
      <div className="connect-page">
        <div className="connect-page__loading">Loading providers…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="connect-page">
        <div className="connect-page__error">
          Failed to load providers: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="connect-page">
      {/* Consent Screen Modal */}
      {consentProvider && (
        <ConsentScreen
          provider={consentProvider}
          consumerId={DEMO_CONSUMER_ID}
          onAuthorize={handleConsentAuthorize}
          onCancel={handleConsentCancel}
        />
      )}

      <header className="connect-page__header">
        <h1>Connect Your Credit Report</h1>
        <p className="connect-page__subtitle">
          Choose how you'd like to bring your credit data into CreditBridge.
        </p>
      </header>

      <div className="connect-grid">
        {/* ── Card 1: Connect a Provider ── */}
        <section className="connect-card">
          <div className="connect-card__icon">🔌</div>
          <h2>Connect a Provider</h2>
          <p className="connect-card__desc">
            Link your existing credit-monitoring account
          </p>

          <div className="connect-card__providers">
            {connectableProviders.map((p) => (
              <ProviderCard
                key={p.provider_name}
                provider={p}
                consumerId={DEMO_CONSUMER_ID}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onRefresh={handleRefresh}
              />
            ))}
          </div>

          <a
            href="#synthetic"
            className="connect-card__synthetic-link"
            onClick={(e) => {
              e.preventDefault();
              const synthetic = providers.find(
                (p) => p.provider_name === "Synthetic"
              );
              if (synthetic) {
                const el = document.getElementById(
                  `provider-${synthetic.provider_name}`
                );
                el?.scrollIntoView({ behavior: "smooth" });
              }
            }}
          >
            Continue with Synthetic Data →
          </a>
        </section>

        {/* ── Card 2: Pull a New Report ── */}
        <section className="connect-card">
          <div className="connect-card__icon">📊</div>
          <h2>Pull a New Report</h2>
          <p className="connect-card__desc">
            Order a fresh three-bureau report
          </p>

          {reportProviders.length > 0 ? (
            <ul className="connect-card__report-list">
              {reportProviders.map((p) => (
                <li key={p.provider_name} className="report-list-item">
                  <div className="report-list-item__info">
                    <span className="report-list-item__name">
                      {p.provider_name}
                    </span>
                    <span className="report-list-item__status status--pending">
                      Requires Approval
                    </span>
                  </div>
                  <p className="report-list-item__note">
                    Licensed credit-data API integration requires contractual
                    approval
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="connect-card__empty">
              No providers currently support direct report retrieval.
            </p>
          )}

          {reportProviders.length > 0 && (
            <p className="connect-card__info-text">
              Licensed credit-data API integration requires contractual approval
            </p>
          )}
        </section>

        {/* ── Card 3: Upload a Report ── */}
        <section className="connect-card">
          <div className="connect-card__icon">📄</div>
          <h2>Upload a Report</h2>
          <p className="connect-card__desc">
            Upload a downloaded PDF or structured report file
          </p>

          {/* PDF Upload */}
          <div className="upload-section">
            <h3 className="upload-section__title">Upload PDF Report</h3>
            <div
              className={`upload-zone ${dragActive ? "upload-zone--active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handlePdfDrop}
              onClick={() => pdfInputRef.current?.click()}
            >
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                className="upload-zone__input"
                onChange={handlePdfChange}
              />
              {uploadedPdf ? (
                <div className="upload-zone__file">
                  <span className="upload-zone__filename">
                    {uploadedPdf.name}
                  </span>
                  <button
                    className="btn btn--sm btn--outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedPdf(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="upload-zone__placeholder">
                  <span className="upload-zone__icon">📁</span>
                  <span>Drag & drop a PDF here, or click to browse</span>
                  <span className="upload-zone__hint">Accepts .pdf files</span>
                </div>
              )}
            </div>
            <div className="upload-supported">
              <span className="upload-supported__label">Supported formats:</span>
              <span className="capability-tag">SmartCredit PDF</span>
              <span className="capability-tag">MyScoreIQ PDF</span>
              <span className="capability-tag">IdentityIQ PDF</span>
              <span className="capability-tag">Equifax PDF</span>
              <span className="capability-tag">Experian PDF</span>
              <span className="capability-tag">TransUnion PDF</span>
            </div>
          </div>

          {/* Structured Upload */}
          <div className="upload-section">
            <h3 className="upload-section__title">Upload Structured File</h3>
            <div
              className="upload-zone"
              onClick={() => structuredInputRef.current?.click()}
            >
              <input
                ref={structuredInputRef}
                type="file"
                accept=".xml,.json,.csv"
                className="upload-zone__input"
                onChange={handleStructuredChange}
              />
              {uploadedStructured ? (
                <div className="upload-zone__file">
                  <span className="upload-zone__filename">
                    {uploadedStructured.name}
                  </span>
                  <button
                    className="btn btn--sm btn--outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedStructured(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="upload-zone__placeholder">
                  <span className="upload-zone__icon">📁</span>
                  <span>Drag & drop a file here, or click to browse</span>
                  <span className="upload-zone__hint">
                    Accepts .xml, .json, .csv
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Card 4: Enter Manually ── */}
        <section className="connect-card">
          <div className="connect-card__icon">✏️</div>
          <h2>Enter Manually</h2>
          <p className="connect-card__desc">
            Enter your account information by hand
          </p>

          <button
            className="btn btn--primary"
            onClick={() =>
              alert("Manual entry flow is not yet implemented.")
            }
          >
            Start Manual Entry
          </button>

          <p className="connect-card__fine-print">
            You'll enter accounts, balances, and statuses manually. Best for
            quick spot-checks.
          </p>
        </section>
      </div>
    </div>
  );
}
