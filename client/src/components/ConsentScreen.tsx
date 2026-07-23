// ──────────────────────────────────────────────
// CreditBridge — Consent Screen Component
// ──────────────────────────────────────────────
//
// Modal displayed before connecting a provider via OAuth.
// Shows required disclosures: data accessed, purpose, data retention,
// disconnection instructions, independent platform notice.
// ──────────────────────────────────────────────

import { useState } from "react";
import type { ProviderCapabilitiesRow } from "@creditbridge/shared";

interface ConsentScreenProps {
  provider: ProviderCapabilitiesRow;
  consumerId: string;
  scopes?: string[];
  onAuthorize: () => void;
  onCancel: () => void;
}

/**
 * Derive a human-readable list of data types the provider can access,
 * based on its capability flags.
 */
function getAccessedData(provider: ProviderCapabilitiesRow): Array<{
  type: string;
  reason: string;
}> {
  const items: Array<{ type: string; reason: string }> = [];

  if (provider.report_retrieval_supported) {
    items.push({
      type: "Credit report data (tradelines, inquiries, public records)",
      reason: "To import and normalize your credit history for cross-bureau analysis",
    });
  }
  if (provider.score_retrieval_supported) {
    items.push({
      type: "Credit scores (FICO, VantageScore)",
      reason: "To track score changes and detect discrepancies across bureaus",
    });
  }
  if (provider.monitoring_supported) {
    items.push({
      type: "Credit monitoring alerts and changes",
      reason: "To notify you of significant changes to your credit profile",
    });
  }
  if (provider.three_bureau_supported) {
    items.push({
      type: "Multi-bureau credit data",
      reason: "To compare reports across Equifax, Experian, and TransUnion",
    });
  }

  // If no specific capabilities, show generic credit data access
  if (items.length === 0) {
    items.push({
      type: "Credit profile information",
      reason: "To integrate your provider data into your CreditBridge dashboard",
    });
  }

  return items;
}

function getConnectionType(provider: ProviderCapabilitiesRow): string {
  if (!provider.report_retrieval_supported) {
    return `PDF Upload Required — ${provider.provider_name} does not yet support direct data access`;
  }
  if (provider.refresh_supported && provider.monitoring_supported) {
    return "Ongoing monitoring";
  }
  if (provider.refresh_supported) {
    return "Ongoing monitoring";
  }
  return "One-time import";
}

function getMonitoringNote(provider: ProviderCapabilitiesRow): string {
  if (!provider.report_retrieval_supported) {
    return "No — this provider does not support direct data retrieval. Upload a PDF report instead.";
  }
  if (provider.monitoring_supported) {
    return "Yes — CreditBridge will periodically check for updates and alert you to changes.";
  }
  if (provider.refresh_supported) {
    return "Yes — you can refresh your report on demand from the provider card.";
  }
  return "No — this is a one-time import. Reconnect to pull updated data.";
}

export default function ConsentScreen({
  provider,
  consumerId,
  scopes,
  onAuthorize,
  onCancel,
}: ConsentScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessedData = getAccessedData(provider);
  const connectionType = getConnectionType(provider);
  const monitoringNote = getMonitoringNote(provider);

  const scopesList = scopes && scopes.length > 0 ? scopes : accessedData.map((d) => d.type);

  async function handleAuthorize() {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: provider.provider_name,
          consumerId,
          scopes: scopesList,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `Authorization failed (${res.status})`);
      }

      const { redirectUrl } = await res.json();

      // Redirect to the provider's authorization page
      window.location.href = redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="consent-overlay" role="dialog" aria-modal="true" aria-label="Provider authorization consent">
      <div className="consent-modal">
        <div className="consent-modal__header">
          <div className="consent-modal__provider-icon">
            {provider.provider_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="consent-modal__title">
              Connect to {provider.provider_name}
            </h2>
            <p className="consent-modal__subtitle">
              Review the information CreditBridge will access
            </p>
          </div>
        </div>

        <div className="consent-modal__body">
          {/* Information to be accessed */}
          <section className="consent-section">
            <h3 className="consent-section__title">Information to be accessed</h3>
            <ul className="consent-section__list">
              {accessedData.map((item) => (
                <li key={item.type} className="consent-section__item">
                  <span className="consent-section__data-type">{item.type}</span>
                  <span className="consent-section__reason">{item.reason}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Connection details */}
          <section className="consent-section">
            <h3 className="consent-section__title">Connection details</h3>
            <div className="consent-detail">
              <span className="consent-detail__label">Connection type:</span>
              <span className="consent-detail__value">{connectionType}</span>
            </div>
            <div className="consent-detail">
              <span className="consent-detail__label">Monitoring updates:</span>
              <span className="consent-detail__value">{monitoringNote}</span>
            </div>
          </section>

          {/* Data retention and control */}
          <section className="consent-section">
            <h3 className="consent-section__title">Your data and control</h3>
            <ul className="consent-section__list">
              <li className="consent-section__item">
                <strong>Data retention:</strong> Your imported credit data is retained until you disconnect or delete your account.
              </li>
              <li className="consent-section__item">
                <strong>How to disconnect:</strong> You can disconnect at any time from the provider card in your dashboard.
              </li>
            </ul>
          </section>

          {/* PDF Upload guidance for non-retrieval providers */}
          {!provider.report_retrieval_supported && (
            <section className="consent-section consent-section--notice">
              <p className="consent-notice">
                <strong>📄 PDF Upload Required:</strong> {provider.provider_name} does not
                yet support direct report retrieval. After consent, you'll be guided to
                upload your {provider.provider_name} PDF report. Download your report from{" "}
                {provider.provider_name === "SmartCredit"
                  ? "smartcredit.com"
                  : `${provider.provider_name.toLowerCase()}.com`}{" "}
                and use the PDF upload feature on the next screen.
              </p>
            </section>
          )}

          {/* Independent platform notice */}
          <section className="consent-section consent-section--notice">
            <p className="consent-notice">
              <strong>Independent platform notice:</strong> CreditBridge is an independent
              platform and is not affiliated with or endorsed by {provider.provider_name}.
            </p>
          </section>

          {/* Provider terms */}
          {provider.api_documentation_reference && (
            <section className="consent-section">
              <p className="consent-notice">
                <a
                  href={provider.api_documentation_reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="consent-link"
                >
                  View {provider.provider_name} terms and documentation →
                </a>
              </p>
            </section>
          )}

          {/* Platform privacy notice */}
          <section className="consent-section">
            <p className="consent-notice">
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="consent-link">
                CreditBridge Privacy Notice →
              </a>
            </p>
          </section>

          {error && (
            <div className="consent-error">
              {error}
            </div>
          )}
        </div>

        <div className="consent-modal__actions">
          <button
            className="btn btn--outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleAuthorize}
            disabled={submitting}
          >
            {submitting ? "Redirecting…" : "I Understand and Authorize"}
          </button>
        </div>
      </div>
    </div>
  );
}
