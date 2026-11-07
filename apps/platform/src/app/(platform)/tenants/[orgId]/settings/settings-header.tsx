"use client";

import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { ArrowLeftIcon } from "@suite/ui/icons";

export function SettingsHeader({ orgId }: { readonly orgId: string }) {
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
      <h1 className="mt-1 text-2xl font-semibold">Application settings</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Each application declares its own schema. Platform validates the payload,
        stores only configuration keys and preserves install metadata.
      </p>
    </div>
  );
}
