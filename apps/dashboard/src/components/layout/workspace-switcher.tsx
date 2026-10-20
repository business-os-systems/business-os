"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button, Spinner } from "@suite/ui";
import { ChevronDownIcon, CheckIcon } from "@suite/ui/icons";
import { isBrowser } from "@/lib/env";

interface TenantItem {
  organizationId: string;
  name: string;
  slug: string;
  role: string;
  logoUrl: string | null;
}

interface WorkspaceSwitcherProps {
  activeOrganizationId?: string;
  activeOrganizationName?: string;
}

export function WorkspaceSwitcher({
  activeOrganizationId,
  activeOrganizationName,
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchTenants() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/v1/auth/tenants");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.tenants)) {
            setTenants(data.tenants);
          }
        }
      } catch {
        // Fallback silently if offline or unauthenticated
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchTenants();

    return () => {
      isMounted = false;
    };
  }, [activeOrganizationId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isBrowser) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, []);

  const handleSwitchTenant = async (targetOrgId: string) => {
    if (targetOrgId === activeOrganizationId) {
      setIsOpen(false);
      return;
    }

    setSwitchingId(targetOrgId);
    try {
      const res = await fetch("/api/v1/auth/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });

      if (res.ok) {
        const data = await res.json();
        setIsOpen(false);
        if (isBrowser) {
          window.location.assign(data.redirectUrl || "/dashboard");
        }
      }
    } catch {
      // Network error during switch
    } finally {
      setSwitchingId(null);
    }
  };

  const hasMultipleTenants = tenants.length > 1;
  const displayName = activeOrganizationName || "Workspace";
  const initials = displayName.slice(0, 2).toUpperCase();

  if (hasMultipleTenants && !isLoading) {
    return (
      <div ref={containerRef} className="relative">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="flex items-center gap-2 h-auto px-2 py-1 rounded-md border border-border/70 bg-surface hover:bg-surface-hover hover:border-border transition-all text-left group font-normal"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-action/10 text-[11px] font-bold text-action border border-action/20 shrink-0">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-on-surface truncate max-w-[140px] sm:max-w-[180px]">
              {displayName}
            </span>
          </div>
          <ChevronDownIcon
            className={`h-3.5 w-3.5 text-on-surface-variant transition-transform duration-200 shrink-0 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </Button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-border bg-surface p-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-2.5 py-2 mb-1.5 border-b border-border-hairline flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Switch Workspace
              </span>
              <span className="text-[10px] text-text-muted">
                {tenants.length} available
              </span>
            </div>

            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {isLoading && tenants.length === 0 ? (
                <div className="py-4 text-center text-xs text-text-muted">
                  Loading workspaces...
                </div>
              ) : (
                tenants.map((t) => {
                  const isActive =
                    t.organizationId === activeOrganizationId ||
                    t.name === activeOrganizationName;
                  const isSwitchingThis = switchingId === t.organizationId;
                  const orgInitials = t.name.slice(0, 2).toUpperCase();

                  return (
                    <Button
                      key={t.organizationId}
                      type="button"
                      variant="ghost"
                      disabled={isSwitchingThis || switchingId !== null}
                      onClick={() => handleSwitchTenant(t.organizationId)}
                      className={`w-full h-auto flex items-center justify-between p-2 rounded-lg text-left transition-colors font-normal ${
                        isActive
                          ? "bg-action/10 text-action font-semibold hover:bg-action/15"
                          : "hover:bg-surface-hover text-on-surface"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface border border-border text-xs font-bold shrink-0">
                          {orgInitials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs truncate font-medium">
                            {t.name}
                          </span>
                          <span className="text-[10px] text-text-muted truncate">
                            @{t.slug} • {t.role}
                          </span>
                        </div>
                      </div>

                      {isSwitchingThis ? (
                        <Spinner size="sm" color="action" />
                      ) : isActive ? (
                        <CheckIcon className="h-4 w-4 text-action shrink-0" />
                      ) : null}
                    </Button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-action/10 text-[11px] font-bold text-action border border-action/20">
        {initials}
      </div>
      <span className="text-xs font-semibold text-on-surface">
        {displayName}
      </span>
    </div>
  );
}
