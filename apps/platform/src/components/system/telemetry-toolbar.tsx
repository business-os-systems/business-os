import { Button } from "@suite/ui";
import { RefreshStatus } from "./refresh-status";

export interface TelemetryToolbarProps {
  readonly receivedAt: string;
  readonly isRefreshing: boolean;
  readonly refreshError: string | null;
  readonly onRefresh: () => void;
}

export function TelemetryToolbar({
  receivedAt,
  isRefreshing,
  refreshError,
  onRefresh,
}: TelemetryToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <RefreshStatus
        receivedAt={receivedAt}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        Refresh now
      </Button>
    </div>
  );
}
