"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Badge, Button, Spinner } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { NotFoundError } from "@suite/core/errors";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { toMessage } from "@/lib/error-message";
import { fetchTenantRecord, type TenantRecord } from "@/lib/tenant-api";
import { TenantRecordProvider } from "./tenant-record-context";

function recordForOrgId(
  record: TenantRecord | null,
  orgId: string
): TenantRecord | null {
  return record !== null && record.profile.id === orgId ? record : null;
}

function RecordLoadState({
  isLoading,
  isMissing,
  message,
  onRetry,
  onBack,
}: {
  readonly isLoading: boolean;
  readonly isMissing: boolean;
  readonly message: string | null;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-surface p-16">
        <Spinner size="lg" />
      </div>
    );
  }
  return (
    <div className="max-w-2xl space-y-4">
      <Alert
        variant="error"
        title={isMissing ? "Tenant not found" : "Unable to load this tenant"}
        message={message ?? "The tenant could not be read."}
      />
      <div className="flex gap-2">
        {isMissing ? null : (
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button
          variant="secondary"
          startIcon={<ArrowLeftIcon className="h-4 w-4" />}
          onClick={onBack}
        >
          Back to tenants
        </Button>
      </div>
    </div>
  );
}

export default function TenantRecordLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { session } = usePlatformAuth();
  const router = useRouter();
  const [record, setRecord] = useState<TenantRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isMissing, setIsMissing] = useState(false);
  const signedIn = session !== null;

  const load = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);
    setIsMissing(false);
    try {
      setRecord(await fetchTenantRecord(orgId));
    } catch (cause) {
      setRecord(null);
      setIsMissing(cause instanceof NotFoundError);
      setMessage(toMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  if (session === null) {
    return null;
  }

  // Never render a record fetched for a different org while a new org loads.
  const currentRecord = recordForOrgId(record, orgId);
  return (
    <div className="space-y-4">
      {currentRecord === null ? (
        <RecordLoadState
          isLoading={isLoading || record !== null}
          isMissing={isMissing}
          message={message}
          onRetry={() => void load()}
          onBack={() => router.push("/tenants")}
        />
      ) : (
        <TenantRecordReady record={currentRecord} reload={() => void load()}>
          {children}
        </TenantRecordReady>
      )}
    </div>
  );
}

function TenantRecordReady({
  record,
  reload,
  children,
}: {
  readonly record: TenantRecord;
  readonly reload: () => void;
  readonly children: ReactNode;
}) {
  return (
    <TenantRecordProvider value={{ record, reload }}>
      <TenantRecordHeading record={record} />
      {children}
    </TenantRecordProvider>
  );
}

function TenantRecordHeading({ record }: { readonly record: TenantRecord }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Tenant
        </p>
        <h1 className="text-2xl font-semibold">{record.profile.name}</h1>
        <p className="mt-1 text-sm text-text-secondary">{record.profile.slug}</p>
        <p className="font-mono text-xs text-text-muted">{record.profile.id}</p>
      </div>
      <Badge variant="tertiary">{record.profile.status}</Badge>
    </header>
  );
}
