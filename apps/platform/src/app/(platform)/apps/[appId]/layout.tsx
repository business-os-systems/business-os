"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Badge, Button, Spinner } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { APP_CATALOG_AVAILABILITY_LABELS, fetchAppCatalog, type CatalogApp } from "@/lib/apps-api";
import { canReadApps } from "@/lib/capability";
import { toMessage } from "@/lib/error-message";
import {
  APP_RECORD_ROUTE_PREFIX,
  isAppRecordId,
} from "@/components/layout/app-record-nav.config";
import { AppRecordProvider } from "./app-record-context";

type AppRecordFetchState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly apps: readonly CatalogApp[] };

type RecordLoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "missing" };

function appForId(
  apps: readonly CatalogApp[] | null,
  appId: string,
): CatalogApp | null {
  return apps?.find((app) => app.appId === appId) ?? null;
}

function RecordLoadStateView({
  state,
  onRetry,
  onBack,
}: {
  readonly state: RecordLoadState;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}) {
  switch (state.kind) {
    case "loading":
      return (
        <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-16">
          <Spinner size="lg" />
        </div>
      );
    case "missing":
      return (
        <div className="max-w-2xl space-y-4">
          <Alert
            variant="error"
            title="Application not found"
            message="The application record could not be read."
          />
          <Button
            variant="secondary"
            startIcon={<ArrowLeftIcon className="h-4 w-4" />}
            onClick={onBack}
          >
            Back to applications
          </Button>
        </div>
      );
    case "error":
      return (
        <div className="max-w-2xl space-y-4">
          <Alert
            variant="error"
            title="Unable to load this application"
            message={state.message}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onRetry}>
              Retry
            </Button>
            <Button
              variant="secondary"
              startIcon={<ArrowLeftIcon className="h-4 w-4" />}
              onClick={onBack}
            >
              Back to applications
            </Button>
          </div>
        </div>
      );
  }
}

function AppRecordHeading({ app }: { readonly app: CatalogApp }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Application
        </p>
        <h1 className="text-2xl font-semibold">{app.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{app.name}</p>
        <p className="font-mono text-xs text-text-muted">{app.appId}</p>
      </div>
      <Badge variant="tertiary">{APP_CATALOG_AVAILABILITY_LABELS[app.availability]}</Badge>
    </header>
  );
}

export default function AppRecordLayout({ children }: { readonly children: ReactNode }) {
  const { appId } = useParams<{ appId: string }>();
  const { session } = usePlatformAuth();
  const router = useRouter();
  const [state, setState] = useState<AppRecordFetchState>({ kind: "loading" });
  const signedIn = session !== null;
  const allowed = canReadApps(session?.capabilities);
  const validAppId = isAppRecordId(appId);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", apps: await fetchAppCatalog() });
    } catch (cause) {
      setState({ kind: "error", message: toMessage(cause) });
    }
  }, []);

  useEffect(() => {
    if (signedIn && allowed && validAppId) void load();
  }, [signedIn, allowed, validAppId, load]);

  if (session === null) {
    return null;
  }

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot read application records." />
    );
  }

  const goBack = () => router.push(APP_RECORD_ROUTE_PREFIX);

  if (!validAppId) {
    return (
      <RecordLoadStateView
        state={{ kind: "missing" }}
        onRetry={() => void load()}
        onBack={goBack}
      />
    );
  }

  if (state.kind === "loading") {
    return <RecordLoadStateView state={state} onRetry={() => void load()} onBack={goBack} />;
  }

  if (state.kind === "error") {
    return <RecordLoadStateView state={state} onRetry={() => void load()} onBack={goBack} />;
  }

  const app = appForId(state.apps, appId);
  if (app === null) {
    return (
      <RecordLoadStateView
        state={{ kind: "missing" }}
        onRetry={() => void load()}
        onBack={goBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      <AppRecordHeading app={app} />
      <AppRecordProvider value={{ app, reload: () => void load() }}>{children}</AppRecordProvider>
    </div>
  );
}
