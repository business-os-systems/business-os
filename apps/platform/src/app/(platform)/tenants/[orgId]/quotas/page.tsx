"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { canManageQuotas } from "@/lib/capability";
import { QuotasBody } from "./quotas-body";
import { QuotasHeader } from "./quotas-header";
import { useQuotas, type QuotaEditorState } from "./use-quotas";

export default function TenantQuotasPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { session } = usePlatformAuth();
  const allowed = canManageQuotas(session?.capabilities);
  const quotas = useQuotas(orgId, allowed);
  const [editor, setEditor] = useState<QuotaEditorState>({ mode: "closed" });

  if (!allowed) {
    return (
      <CapabilityDeniedView message="Your operator account cannot manage tenant quotas." />
    );
  }

  return (
    <div className="max-w-full space-y-4">
      <QuotasHeader orgId={orgId} />
      <QuotasBody
        orgId={orgId}
        items={quotas.items}
        problem={quotas.problem}
        editor={editor}
        onOpen={setEditor}
        onClose={() => setEditor({ mode: "closed" })}
        onRetry={() => void quotas.load()}
        onSaved={quotas.setItems}
      />
    </div>
  );
}
