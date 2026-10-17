"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SettingsNav } from "@/components/layout/settings-nav";
import { isBrowser } from "@/lib/env";

export interface SettingsRootPageProps {
  userPermissions?: readonly string[];
}

export default function SettingsRootPage({
  userPermissions,
}: SettingsRootPageProps = {}) {
  const router = useRouter();

  useEffect(() => {
    // Desktop viewports forward to default tab /settings/general
    if (isBrowser && window.innerWidth >= 768) {
      router.replace("/settings/general");
    }
  }, [router]);

  return (
    <div className="w-full max-w-lg mx-auto py-2">
      <div className="md:hidden">
        <SettingsNav
          isMobile={true}
          className="border-0 bg-transparent w-full"
          userPermissions={userPermissions}
        />
      </div>
      <div className="hidden md:flex flex-col items-center justify-center py-16 text-text-muted text-sm gap-2">
        <span className="h-4 w-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span>Redirecting to General Settings...</span>
      </div>
    </div>
  );
}
