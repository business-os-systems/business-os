"use client";

import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";

export function QuotasHeader({ orgId }: { readonly orgId: string }) {
  const router = useRouter();
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        startIcon={<ArrowLeftIcon className="h-4 w-4" />}
        onClick={() => router.push(`/tenants/${encodeURIComponent(orgId)}`)}
      >
        Back to tenant
      </Button>
      <h1 className="mt-1 text-2xl font-semibold">Quotas</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Limits are decimal strings with a unit and measured consumption. A lowered
        limit keeps existing content and marks the tenant over-limit; it never
        deletes rows.
      </p>
    </div>
  );
}
