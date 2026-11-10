import Link from "next/link";
import { Alert } from "@suite/ui";
import { APP_RECORD_ROUTE_PREFIX } from "@/components/layout/app-record-nav.config";

export default function AppRecordNotFound() {
  return (
    <div className="max-w-2xl space-y-4">
      <Alert
        variant="error"
        title="Application record not found"
        message="This application destination does not exist. Only destinations declared in the record configuration are available."
      />
      <Link
        href={APP_RECORD_ROUTE_PREFIX}
        className="inline-flex min-h-[38px] items-center rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Back to applications
      </Link>
    </div>
  );
}
