"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

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
        <svg
          className="h-4 w-4 text-action shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-semibold text-text truncate">
          Email verified successfully! Full workspace access and application installations are now unlocked.
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-text-muted hover:text-text p-1 rounded-sm transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
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
