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
import { toMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";

/**
 * The three server-answerable outcomes of a chain check. "idle" is the only
 * state before a response, so the panel never claims verification it has not
 * received.
 */
export type AuditVerifyState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "verified";
      readonly checkedCount: number;
      readonly checkedAt: string;
    }
  | {
      readonly kind: "broken";
      readonly checkedCount: number;
      readonly firstBrokenId: string | null;
      readonly checkedAt: string;
    }
  | { readonly kind: "error"; readonly detail: string };

function resolveAuditVerifyState(
  result: AuditVerifyResult,
  checkedAt: string,
): AuditVerifyState {
  if (!result.verified) {
    return {
      kind: "broken",
      checkedCount: result.checkedCount,
      firstBrokenId: result.firstBrokenId,
      checkedAt,
    };
  }
  return {
    kind: "verified",
    checkedCount: result.checkedCount,
    checkedAt,
  };
}

function VerifiedOutcome({
  state,
}: {
  readonly state: Extract<AuditVerifyState, { kind: "verified" }>;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold text-success">Verified</p>
      <p className="text-xs text-text-secondary">
        {state.checkedCount} events checked. Checked at{" "}
        {formatDateTime(state.checkedAt)}.
      </p>
    </div>
  );
}

function BrokenOutcome({
  state,
}: {
  readonly state: Extract<AuditVerifyState, { kind: "broken" }>;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-semibold text-danger">Broken chain</p>
      <p className="text-xs text-text-secondary">
        {state.checkedCount} events checked. First broken record:{" "}
        <span className="font-mono text-danger">
          {state.firstBrokenId ?? "not reported by the verifier"}
        </span>
        . Checked at {formatDateTime(state.checkedAt)}.
      </p>
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
    case "verified":
      return <VerifiedOutcome state={state} />;
    case "broken":
      return <BrokenOutcome state={state} />;
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

export function ChainVerifyPanel() {
  const [state, setState] = useState<AuditVerifyState>({ kind: "idle" });
  const isVerifying = state.kind === "loading";

  async function verify(): Promise<void> {
    setState({ kind: "loading" });
    try {
      const result = await verifyAuditChain();
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
          Recompute the tamper-evident audit chain on the server. The chain is
          global: a per-tenant walk cannot validate cross-tenant links, so every
          check covers all tenants.
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
