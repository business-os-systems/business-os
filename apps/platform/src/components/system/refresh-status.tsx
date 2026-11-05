import {
  MILLISECONDS_PER_SECOND,
  SYSTEM_REFRESH_INTERVAL_MS,
  formatTimestamp,
} from "./system.config";

export interface RefreshStatusProps {
  readonly receivedAt: string;
  readonly isRefreshing: boolean;
  readonly refreshError: string | null;
}

function resolveRefreshLabel(receivedAt: string, isRefreshing: boolean): string {
  if (isRefreshing) {
    return "Refreshing platform telemetry…";
  }
  const seconds = Math.round(SYSTEM_REFRESH_INTERVAL_MS / MILLISECONDS_PER_SECOND);
  return `Last checked ${formatTimestamp(receivedAt)} · refreshes every ${seconds} seconds`;
}

/** Polite live region, so a refresh is announced without stealing focus (OP-4). */
export function RefreshStatus({
  receivedAt,
  isRefreshing,
  refreshError,
}: RefreshStatusProps) {
  return (
    <p role="status" aria-live="polite" className="text-xs text-text-secondary">
      {resolveRefreshLabel(receivedAt, isRefreshing)}
      {refreshError === null ? null : (
        <span className="text-danger"> · Refresh failed: {refreshError}</span>
      )}
    </p>
  );
}
