"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Alert, Button, Spinner } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";
import { NotFoundError } from "@suite/core/errors";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { toMessage } from "@/lib/error-message";
import {
  canReadPersonalData,
  fetchTenantRecord,
  type TenantRecord,
} from "@/lib/tenant-api";
import { TenantRecordHeader } from "./tenant-record-header";
import { TenantRecordTabList } from "./tenant-record-tablist";
import {
  TENANT_TABS,
  TenantTabPanel,
  type TenantTabId,
} from "./tenant-record-tabs";
import { TenantPiiPanel } from "./tenant-pii-panel";

export default function TenantRecordPage() {
  const params = useParams<{ orgId: string }>();
  const router = useRouter();
  const orgId = params.orgId;
  const { session } = usePlatformAuth();
  const [record, setRecord] = useState<TenantRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMissing, setIsMissing] = useState(false);
  const [tab, setTab] = useState<TenantTabId>("overview");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const load = useCallback(async (tenantId: string) => {
    setIsLoading(true);
    setError(null);
    setIsMissing(false);
    setRecord(null);
    setTab("overview");
    try {
      setRecord(await fetchTenantRecord(tenantId));
    } catch (cause) {
      setIsMissing(cause instanceof NotFoundError);
      setError(toMessage(cause));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(orgId);
  }, [orgId, load]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (record === null) {
    return (
      <div className="max-w-3xl space-y-4">
        <Alert
          variant="error"
          title={isMissing ? "Tenant not found" : "Unable to load this tenant"}
          message={error ?? "The tenant could not be read."}
        />
        <div className="flex gap-2">
          {isMissing ? null : (
            <Button variant="secondary" onClick={() => void load(orgId)}>
              Retry
            </Button>
          )}
          <Button
            variant="secondary"
            startIcon={<ArrowLeftIcon className="h-4 w-4" />}
            onClick={() => router.push("/tenants")}
          >
            Back to tenants
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <TenantRecordHeader
        record={record}
        onBack={() => router.push("/tenants")}
      />
      <TenantRecordTabList tab={tab} onSelect={setTab} tabRefs={tabRefs} />

      {TENANT_TABS.map((entry) => (
        <div
          key={entry.id}
          role="tabpanel"
          id={`tenant-tab-${entry.id}`}
          aria-labelledby={`tenant-tab-button-${entry.id}`}
          hidden={tab !== entry.id}
          className="space-y-4"
        >
          {tab === entry.id ? (
            <TenantTabPanel
              tab={entry.id}
              record={record}
              personalDataSlot={
                <TenantPiiPanel
                  key={record.profile.id}
                  orgId={record.profile.id}
                  canRead={canReadPersonalData(session?.capabilities)}
                />
              }
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
