"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@suite/ui";
import { verifyAuditChain, type AuditVerifyResult } from "@/lib/audit-api";
import {
  ChainOutcomeBlock,
  resolveChainOutcome,
  type ChainOutcome,
} from "@/components/audit/chain-verify-outcome";
import { toMessage } from "@/lib/error-message";

/**
 * One verification result holds both scopes because the API always verifies the
 * global chain and adds the tenant report only when an organization is named.
 * "idle" is the only state before a response, so the panel never claims
 * verification it has not received.
 */
export type AuditVerifyState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "result";
      readonly global: ChainOutcome;
      readonly tenant: {
        readonly organizationId: string;
        readonly outcome: ChainOutcome;
      } | null;
      readonly checkedAt: string;
    }
  | { readonly kind: "error"; readonly detail: string };

function resolveAuditVerifyState(
  result: AuditVerifyResult,
  checkedAt: string,
): AuditVerifyState {
  const tenant =
    result.tenant === undefined
      ? null
      : {
          organizationId: result.tenant.organizationId,
          outcome: resolveChainOutcome(result.tenant),
        };

  return {
    kind: "result",
    global: resolveChainOutcome(result),
    tenant,
    checkedAt,
  };
}

function VerificationResult({
  state,
}: {
  readonly state: Extract<AuditVerifyState, { kind: "result" }>;
}) {
  return (
    <div className="space-y-3">
      <ChainOutcomeBlock
        title="Global chain"
        outcome={state.global}
        checkedAt={state.checkedAt}
      />
      {state.tenant === null ? null : (
        <ChainOutcomeBlock
          title="Tenant chain"
          detail={`Scope: ${state.tenant.organizationId}`}
          outcome={state.tenant.outcome}
          checkedAt={state.checkedAt}
        />
      )}
    </div>
  );
}

function VerifyOutcome({ state }: { readonly state: AuditVerifyState }) {
  switch (state.kind) {
    case "idle":
      return (
        <p className="text-xs text-text-muted">
          Not verified yet. Run the check to recompute the chain.
        </p>
      );
    case "loading":
      return <p className="text-xs text-text-secondary">Verifying the chain...</p>;
    case "result":
      return <VerificationResult state={state} />;
    case "error":
      return (
        <Alert
          variant="error"
          title="Verification failed"
          message={state.detail}
        />
      );
  }
}

export function ChainVerifyPanel({
  organizationId,
}: {
  readonly organizationId?: string;
}) {
  const [state, setState] = useState<AuditVerifyState>({ kind: "idle" });
  const isVerifying = state.kind === "loading";

  async function verify(): Promise<void> {
    setState({ kind: "loading" });
    try {
      const result = await verifyAuditChain(organizationId);
      setState(resolveAuditVerifyState(result, new Date().toISOString()));
    } catch (cause) {
      setState({ kind: "error", detail: toMessage(cause) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chain integrity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-text-secondary">
          Recompute the tamper-evident audit chain on the server. The global
          scope always walks the complete chain. When an organization filter is
          applied, the response also reports that tenant&apos;s rows: each row
          is checked against its actual global predecessor, so a break in
          another tenant&apos;s row is not attributed to this tenant.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={isVerifying}
            onClick={() => void verify()}
          >
            {isVerifying ? "Verifying..." : "Verify chain"}
          </Button>
          <span className="text-xs text-text-muted">
            Every verification is itself written to the audit trail.
          </span>
        </div>
        <div role="status" aria-live="polite">
          <VerifyOutcome state={state} />
        </div>
      </CardContent>
    </Card>
  );
}
