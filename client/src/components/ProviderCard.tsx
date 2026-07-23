import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import { useState, useEffect } from "react";
import { fetchAuthStatus, disconnectProvider } from "../lib/api";
import ProviderStatusBadge, {
  providerStatusToDisplay,
} from "./ProviderStatusBadge";

interface AuthInfo {
  status: string;
  authorizedScopes: string[];
  connectedAt: string | null;
  lastRefresh: string | null;
  consentVersion: string | null;
}

interface Props {
  provider: ProviderCapabilitiesRow;
  consumerId?: string;
  onConnect?: (name: string) => void;
  onDisconnect?: (name: string) => void;
  onRefresh?: (name: string) => void;
}

/**
 * Build capability tags from the provider's capability flags.
 */
function getCapabilityTags(row: ProviderCapabilitiesRow): string[] {
  const tags: string[] = [];
  if (row.three_bureau_supported) tags.push("3-Bureau");
  if (row.score_retrieval_supported) tags.push("Scores");
  if (row.refresh_supported) tags.push("Refresh");
  if (row.monitoring_supported) tags.push("Monitoring");
  if (row.report_retrieval_supported) tags.push("Report Retrieval");
  if (!row.report_retrieval_supported && row.enrollment_supported) tags.push("PDF Upload Required");
  if (row.oauth_supported) tags.push("OAuth");
  if (row.enrollment_supported) tags.push("Enrollment");
  if (row.sandbox_supported) tags.push("Sandbox");
  return tags;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Get a human-readable connection status string for display below the badge.
 */
function getStatusDetail(
  row: ProviderCapabilitiesRow,
  authInfo: AuthInfo | null
): string {
  const displayStatus = providerStatusToDisplay(row);

  // If we have auth info, use it to show richer status
  if (authInfo) {
    if (authInfo.status === "active" && authInfo.connectedAt) {
      return `Connected via OAuth on ${formatDate(authInfo.connectedAt)}`;
    }
    if (authInfo.status === "revoked") {
      return `Disconnected on ${formatDate(authInfo.connectedAt || null) || "unknown date"}`;
    }
    if (authInfo.status === "expired") {
      return "Authorization expired — reconnect to refresh";
    }
    if (authInfo.status === "pending") {
      return "Authorization pending…";
    }
  }

  // Fall back to provider-based status
  switch (displayStatus) {
    case "connected":
      return row.provider_name === "Synthetic"
        ? "Connected (Sandbox)"
        : "Connected";
    case "sandbox":
      return "Sandbox — test data available";
    case "not_connected":
      return row.provider_status === "inactive"
        ? "Not yet implemented — coming soon"
        : "Not Connected";
    case "authorization_pending":
      return "Requires approval";
    default:
      return "";
  }
}

/**
 * Determine if the provider appears connected based on DB status or auth info.
 */
function isProviderConnected(
  row: ProviderCapabilitiesRow,
  authInfo: AuthInfo | null
): boolean {
  if (authInfo?.status === "active") return true;
  const displayStatus = providerStatusToDisplay(row);
  return displayStatus === "connected";
}

export default function ProviderCard({
  provider,
  consumerId,
  onConnect,
  onDisconnect,
  onRefresh,
}: Props) {
  const displayStatus = providerStatusToDisplay(provider);
  const capabilities = getCapabilityTags(provider);

  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Fetch auth status if we have a consumerId
  useEffect(() => {
    if (!consumerId) return;
    let cancelled = false;

    fetchAuthStatus(consumerId, provider.provider_name)
      .then((info) => {
        if (!cancelled) setAuthInfo(info);
      })
      .catch(() => {
        // Auth status unavailable — not an error for providers that don't use OAuth
      });

    return () => {
      cancelled = true;
    };
  }, [consumerId, provider.provider_name]);

  const connected = isProviderConnected(provider, authInfo);
  const isSandbox = displayStatus === "sandbox";
  const isSynthetic = provider.provider_name === "Synthetic";
  const statusDetail = getStatusDetail(provider, authInfo);
  const initial = provider.provider_name.charAt(0).toUpperCase();

  async function handleDisconnect() {
    if (!consumerId) return;
    setDisconnecting(true);
    try {
      await disconnectProvider(consumerId, provider.provider_name);
      setAuthInfo({
        status: "revoked",
        authorizedScopes: [],
        connectedAt: authInfo?.connectedAt || null,
        lastRefresh: null,
        consentVersion: null,
      });
      setShowDisconnectConfirm(false);
      onDisconnect?.(provider.provider_name);
    } catch (err) {
      alert(`Failed to disconnect: ${(err as Error).message}`);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="provider-card">
      <div className="provider-card__header">
        <div
          className={`provider-card__avatar ${
            connected ? "avatar--green" : isSandbox ? "avatar--purple" : "avatar--gray"
          }`}
        >
          {initial}
        </div>
        <div className="provider-card__info">
          <h3 className="provider-card__name">{provider.provider_name}</h3>
          <ProviderStatusBadge
            status={
              authInfo?.status === "active"
                ? "connected"
                : authInfo?.status === "revoked"
                  ? "disconnected"
                  : displayStatus
            }
          />
        </div>
      </div>

      {statusDetail && (
        <p className="provider-card__status-detail">{statusDetail}</p>
      )}

      {/* Authorization info when connected */}
      {connected && authInfo && authInfo.authorizedScopes.length > 0 && (
        <div className="provider-card__auth-info">
          <span className="provider-card__label">Authorized scopes:</span>
          <div className="capability-tags">
            {authInfo.authorizedScopes.map((scope) => (
              <span key={scope} className="capability-tag capability-tag--scope">
                {scope}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="provider-card__capabilities">
        <span className="provider-card__label">Capabilities:</span>
        {capabilities.length > 0 ? (
          <div className="capability-tags">
            {capabilities.map((tag) => (
              <span key={tag} className="capability-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <span className="provider-card__none">None configured</span>
        )}
      </div>

      <div className="provider-card__bureau">
        <span className="provider-card__label">Three-Bureau Support:</span>
        <span
          className={provider.three_bureau_supported ? "text--success" : "text--muted"}
        >
          {provider.three_bureau_supported ? "✓ Yes" : "✗ No"}
        </span>
      </div>

      <div className="provider-card__actions">
        {connected && !isSynthetic && (
          <>
            {provider.refresh_supported === 1 && (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => onRefresh?.(provider.provider_name)}
              >
                Refresh
              </button>
            )}
            {showDisconnectConfirm ? (
              <div className="disconnect-confirm">
                <span className="disconnect-confirm__text">
                  Disconnect from {provider.provider_name}?
                </span>
                <button
                  className="btn btn--outline-danger btn--sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? "Disconnecting…" : "Yes, Disconnect"}
                </button>
                <button
                  className="btn btn--outline btn--sm"
                  onClick={() => setShowDisconnectConfirm(false)}
                  disabled={disconnecting}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn--outline-danger btn--sm"
                onClick={() => setShowDisconnectConfirm(true)}
              >
                Disconnect
              </button>
            )}
          </>
        )}

        {connected && isSynthetic && (
          <>
            {provider.refresh_supported === 1 && (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => onRefresh?.(provider.provider_name)}
              >
                Refresh Data
              </button>
            )}
            <span className="provider-card__note">
              Synthetic test provider — always available
            </span>
          </>
        )}

        {authInfo?.status === "revoked" && (
          <span className="provider-card__note">
            Disconnected on {formatDate(authInfo.connectedAt) || "unknown date"}
          </span>
        )}

        {isSandbox && provider.enrollment_supported === 1 && !connected && (
          <button
            className="btn btn--primary btn--sm"
            onClick={() => onConnect?.(provider.provider_name)}
          >
            Connect
          </button>
        )}

        {displayStatus === "not_connected" &&
          provider.enrollment_supported === 1 &&
          !connected && (
            <button
              className="btn btn--primary btn--sm"
              onClick={() => onConnect?.(provider.provider_name)}
            >
              Connect
            </button>
          )}

        {displayStatus === "not_connected" &&
          provider.enrollment_supported === 0 &&
          !connected && (
            <span className="provider-card__note">
              Connection not yet supported
            </span>
          )}
      </div>
    </div>
  );
}
