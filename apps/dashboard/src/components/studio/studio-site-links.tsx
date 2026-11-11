"use client";

import React from "react";
import Link from "next/link";
import { STUDIO_SITE_LINKS, studioSiteLinkPath } from "./studio-links.config";

export interface StudioSiteLinksProps {
  readonly siteId: string;
}

/** Site-level surfaces stay reachable from inside the studio (FR-082). */
export function StudioSiteLinks(props: StudioSiteLinksProps) {
  return (
    <nav aria-label="Site settings" className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Site</h3>
      {STUDIO_SITE_LINKS.map((link) => (
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
