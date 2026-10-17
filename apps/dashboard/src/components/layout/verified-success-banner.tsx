"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@suite/ui";
import { CheckIcon, XIcon } from "@suite/ui/icons";

export function VerifiedSuccessBannerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(() => searchParams.get("verified") === "true");

  useEffect(() => {
    if (searchParams.get("verified") === "true") {
      setShow(true);
    }
  }, [searchParams]);

  if (!show) return null;

  const handleDismiss = () => {
    setShow(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("verified");
    const query = params.toString() ? `?${params.toString()}` : "";
    router.replace(`${pathname}${query}`, { scroll: false });
  };

  return (
    <aside
      aria-label="Email Verification Success"
      className="w-full bg-action/10 text-action border-b border-action/20 px-4 py-2.5 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-2 min-w-0">
        <CheckIcon size={16} className="text-action shrink-0" />
        <span className="font-semibold text-text truncate">
          Email verified successfully! Full workspace access and application installations are now unlocked.
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        className="h-auto p-1 text-text-muted hover:text-text shrink-0"
        aria-label="Dismiss notification"
      >
        <XIcon size={14} />
      </Button>
    </aside>

  );
}

export function VerifiedSuccessBanner() {
  return (
    <React.Suspense fallback={null}>
      <VerifiedSuccessBannerContent />
    </React.Suspense>
  );
}
