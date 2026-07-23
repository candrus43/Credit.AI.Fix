import type { ProviderCapabilitiesRow } from "@creditbridge/shared";
import ProviderStatusBadge, {
  providerStatusToDisplay,
} from "./ProviderStatusBadge";

interface Props {
  provider: ProviderCapabilitiesRow;
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
  if (row.oauth_supported) tags.push("OAuth");
  if (row.enrollment_supported) tags.push("Enrollment");
  if (row.sandbox_supported) tags.push("Sandbox");
  return tags;
}

/**
 * Get a human-readable connection status string for display below the badge.
 */
function getStatusDetail(row: ProviderCapabilitiesRow): string {
  const displayStatus = providerStatusToDisplay(row);
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

export default function ProviderCard({
  provider,
  onConnect,
  onDisconnect,
  onRefresh,
}: Props) {
  const displayStatus = providerStatusToDisplay(provider);
  const capabilities = getCapabilityTags(provider);
  const statusDetail = getStatusDetail(provider);
  const initial = provider.provider_name.charAt(0).toUpperCase();
  const isConnected = displayStatus === "connected";
  const isSandbox = displayStatus === "sandbox";
  const isSynthetic = provider.provider_name === "Synthetic";

  return (
    <div className="provider-card">
      <div className="provider-card__header">
        <div className={`provider-card__avatar ${isConnected ? "avatar--green" : isSandbox ? "avatar--purple" : "avatar--gray"}`}>
          {initial}
        </div>
        <div className="provider-card__info">
          <h3 className="provider-card__name">{provider.provider_name}</h3>
          <ProviderStatusBadge status={displayStatus} />
        </div>
      </div>

      {statusDetail && (
        <p className="provider-card__status-detail">{statusDetail}</p>
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
        <span className={provider.three_bureau_supported ? "text--success" : "text--muted"}>
          {provider.three_bureau_supported ? "✓ Yes" : "✗ No"}
        </span>
      </div>

      <div className="provider-card__actions">
        {isConnected && !isSynthetic && (
          <>
            {provider.refresh_supported === 1 && (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => onRefresh?.(provider.provider_name)}
              >
                Refresh
              </button>
            )}
            <button
              className="btn btn--outline-danger btn--sm"
              onClick={() => onDisconnect?.(provider.provider_name)}
            >
              Disconnect
            </button>
          </>
        )}

        {isConnected && isSynthetic && (
          <>
            {provider.refresh_supported === 1 && (
              <button
                className="btn btn--primary btn--sm"
                onClick={() => onRefresh?.(provider.provider_name)}
              >
                Refresh Data
              </button>
            )}
            <span className="provider-card__note">Synthetic test provider — always available</span>
          </>
        )}

        {isSandbox && provider.enrollment_supported === 1 && (
          <button
            className="btn btn--primary btn--sm"
            onClick={() => onConnect?.(provider.provider_name)}
          >
            Connect
          </button>
        )}

        {displayStatus === "not_connected" && provider.enrollment_supported === 1 && (
          <button
            className="btn btn--primary btn--sm"
            onClick={() => onConnect?.(provider.provider_name)}
          >
            Connect
          </button>
        )}

        {displayStatus === "not_connected" && provider.enrollment_supported === 0 && (
          <span className="provider-card__note">Connection not yet supported</span>
        )}
      </div>
    </div>
  );
}
