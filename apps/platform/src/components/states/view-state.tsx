"use client";

import type { ReactNode } from "react";
import { Alert, Button, Spinner } from "@suite/ui";
import type { ViewProblem } from "@/lib/problem-view";

/**
 * One presentation contract for a screen's loading, empty and RFC 7807 error
 * states. Screens derive a state; this module renders it, so a new screen
 * cannot invent a fourth wording for "nothing here yet" (T099).
 */
export type { ViewProblem } from "@/lib/problem-view";

export interface ViewLoadingState {
  readonly kind: "loading";
  readonly label?: string;
}

export interface ViewEmptyState {
  readonly kind: "empty";
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export interface ViewErrorState {
  readonly kind: "error";
  readonly problem: ViewProblem;
  readonly onRetry?: () => void;
}

export type ViewState = ViewLoadingState | ViewEmptyState | ViewErrorState;

function ProblemSummary({ problem }: { readonly problem: ViewProblem }) {
  const meta = [
    problem.code ?? null,
    problem.status === null ? null : String(problem.status),
    problem.requestId === null ? null : `Reference ${problem.requestId}`,
  ].filter((value): value is string => value !== null);
  return (
    <div className="space-y-1">
      <Alert variant="error" title={problem.title} message={problem.detail} />
      {meta.length === 0 ? null : (
        <p className="text-xs text-text-muted">{meta.join(" · ")}</p>
      )}
      {problem.invalidParams.length === 0 ? null : (
        <ul className="space-y-1 text-xs text-text-secondary">
          {problem.invalidParams.map((issue) => (
            <li key={issue.name}>
              <span className="font-semibold text-text">{issue.name}</span>: {issue.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyBody({ state }: { readonly state: ViewEmptyState }) {
  const hasAction = state.actionLabel !== undefined && state.onAction !== undefined;
  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center">
      <p className="text-sm font-semibold text-text">{state.title}</p>
      <p className="mt-1 text-sm text-text-secondary">{state.description}</p>
      {hasAction ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={state.onAction}>
            {state.actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PlatformViewState({ state }: { readonly state: ViewState }) {
  if (state.kind === "loading") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface p-10"
        role="status"
      >
        <Spinner />
        {state.label === undefined ? null : (
          <p className="text-xs text-text-secondary">{state.label}</p>
        )}
      </div>
    );
  }
  if (state.kind === "empty") {
    return <EmptyBody state={state} />;
  }
  return (
    <div className="space-y-3">
      <ProblemSummary problem={state.problem} />
      {state.onRetry === undefined ? null : (
        <Button variant="secondary" onClick={state.onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** The one denial surface shared by capability-gated Platform screens. */
export function CapabilityDeniedView({ message }: { readonly message: ReactNode }) {
  return <Alert variant="error" title="Capability denied" message={message} />;
}
