"use client";

import React from "react";
import Link from "next/link";
import { hasPermission } from "@suite/core";
import { STUDIO_SITE_LINKS, studioSiteLinkPath } from "./studio-links.config";

export interface StudioSiteLinksProps {
  readonly siteId: string;
  readonly userPermissions: readonly string[];
}

/** Site-level surfaces stay reachable from inside the studio (FR-082, H-3.6). */
export function StudioSiteLinks(props: StudioSiteLinksProps) {
  const links = STUDIO_SITE_LINKS.filter((link) =>
    hasPermission(props.userPermissions, link.capability)
  );
  if (links.length === 0) {
    return null;
  }
  return (
    <nav aria-label="Site settings" className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Site</h3>
      {links.map((link) => (
        <Link
          key={link.id}
          href={studioSiteLinkPath(props.siteId, link.segment)}
          className="block rounded-md px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
