import type { AuditVerifyResult, AuditVerifyTenantResult } from "@/lib/audit-api";
import { formatDateTime } from "@/lib/format";

/**
 * The server-answerable outcomes of one scope. An empty tenant window is its
 * own state: verified with zero rows is not a verification claim.
 */
export type ChainOutcome =
  | { readonly kind: "verified"; readonly checkedCount: number }
  | { readonly kind: "empty" }
  | {
      readonly kind: "broken";
      readonly checkedCount: number;
      readonly firstBrokenId: string | null;
    };

type ChainVerifySource = Pick<
  AuditVerifyResult | AuditVerifyTenantResult,
  "verified" | "checkedCount" | "firstBrokenId"
>;

const OUTCOME_TEXT_CLASS = {
  verified: "text-text-secondary",
  empty: "text-text-muted",
  broken: "text-danger",
} as const satisfies Record<ChainOutcome["kind"], string>;

export function resolveChainOutcome(result: ChainVerifySource): ChainOutcome {
  if (result.checkedCount === 0) {
    return { kind: "empty" };
  }
  if (!result.verified) {
    return {
      kind: "broken",
      checkedCount: result.checkedCount,
      firstBrokenId: result.firstBrokenId,
    };
  }
  return { kind: "verified", checkedCount: result.checkedCount };
}

export function ChainOutcomeBlock({
  title,
  detail,
  outcome,
  checkedAt,
}: {
  readonly title: string;
  readonly detail?: string;
  readonly outcome: ChainOutcome;
  readonly checkedAt: string;
}) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {detail === undefined ? null : <p className="text-xs text-text-muted">{detail}</p>}
      <p className={`text-xs ${OUTCOME_TEXT_CLASS[outcome.kind]}`}>
        {outcomeText(outcome, checkedAt)}
      </p>
    </div>
  );
}

function outcomeText(outcome: ChainOutcome, checkedAt: string): string {
  switch (outcome.kind) {
    case "empty":
      return "No audit records in this scope, so there is nothing to verify.";
    case "verified":
      return `Verified. ${outcome.checkedCount} events checked. Checked at ${formatDateTime(checkedAt)}.`;
    case "broken":
      return `Broken chain. ${outcome.checkedCount} events checked. First broken record: ${outcome.firstBrokenId ?? "not reported by the verifier"}. Checked at ${formatDateTime(checkedAt)}.`;
  }
}
