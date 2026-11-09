"use client";

import React from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ChooseTenantBody } from "@/components/auth/choose-tenant/choose-tenant-body";
import { ChooseTenantCardFooter } from "@/components/auth/choose-tenant/choose-tenant-card-footer";
import { useChooseTenant } from "@/components/auth/choose-tenant/use-choose-tenant";

export default function ChooseTenantPage() {
  const controller = useChooseTenant();

  return (
    <AuthCard
      title="Select Workspace"
      subtitle="Choose the organization you want to operate in"
      footer={<ChooseTenantCardFooter />}
    >
      <ChooseTenantBody controller={controller} />
    </AuthCard>
  );
}
