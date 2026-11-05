import { Button, cn } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { formatDateTime } from "@/lib/format";
import type { OperatorSummary } from "@/lib/operators-api";
import {
  OPERATOR_STATUS_PRESENTATION,
  operatorSignIn,
} from "@/components/operators/operator-presentation";

interface OperatorRecordHeaderProps {
  readonly operator: OperatorSummary;
  readonly onBack: () => void;
}

export function OperatorRecordHeader({
  operator,
  onBack,
}: OperatorRecordHeaderProps) {
  const status = OPERATOR_STATUS_PRESENTATION[operator.status];
  const signIn = operatorSignIn(operator.mfaEnrolled);
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        startIcon={<ArrowLeftIcon className="h-4 w-4" />}
        onClick={onBack}
      >
        Back to operators
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{operator.displayName}</h1>
          <p className="text-sm text-text-secondary">{operator.email}</p>
        </div>
        <dl className="flex flex-wrap gap-6 text-xs">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-text-muted">
              Status
            </dt>
            <dd className={cn("font-semibold", status.className)}>
              {status.label}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-text-muted">
              Sign-in
            </dt>
            <dd className={cn("font-semibold", signIn.className)}>
              {signIn.label}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-text-muted">
              Last seen
            </dt>
            <dd className="font-semibold text-text">
              {operator.lastSeenAt === null
                ? "Never"
                : formatDateTime(operator.lastSeenAt)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
