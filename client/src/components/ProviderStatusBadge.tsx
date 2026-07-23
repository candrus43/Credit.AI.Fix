import type { ProviderCapabilitiesRow } from "@creditbridge/shared";

export type DisplayStatus =
  | "not_connected"
  | "authorization_pending"
  | "identity_verification_required"
  | "connected"
  | "synchronizing"
  | "action_required"
  | "expired"
  | "disconnected"
  | "error"
  | "sandbox";

interface Props {
  status: DisplayStatus;
}

const STATUS_CONFIG: Record<DisplayStatus, { label: string; className: string }> = {
  not_connected: {
    label: "Not Connected",
    className: "badge--gray",
  },
  authorization_pending: {
    label: "Authorization Pending",
    className: "badge--yellow",
  },
  identity_verification_required: {
    label: "Identity Verification Required",
    className: "badge--orange",
  },
  connected: {
    label: "Connected",
    className: "badge--green",
  },
  synchronizing: {
    label: "Synchronizing",
    className: "badge--blue badge--pulse",
  },
  action_required: {
    label: "Action Required",
    className: "badge--red",
  },
  expired: {
    label: "Expired",
    className: "badge--red",
  },
  disconnected: {
    label: "Disconnected",
    className: "badge--gray",
  },
  error: {
    label: "Error",
    className: "badge--red",
  },
  sandbox: {
    label: "TEST",
    className: "badge--purple",
  },
};

/**
 * Maps a DB provider_status to a DisplayStatus for the badge.
 */
export function providerStatusToDisplay(
  row: ProviderCapabilitiesRow
): DisplayStatus {
  switch (row.provider_status) {
    case "active":
      return "connected";
    case "sandbox":
      return "sandbox";
    case "inactive":
      return "not_connected";
    case "pending_approval":
      return "authorization_pending";
    case "deprecated":
      return "disconnected";
    default:
      return "not_connected";
  }
}

export default function ProviderStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_connected;
  return (
    <span className={`provider-badge ${config.className}`}>{config.label}</span>
  );
}
