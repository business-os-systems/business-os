"use client";

import React from "react";

export interface TenantAvatarProps {
  name: string;
  logoUrl: string | null;
}

function initialsOf(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/** Organization logo, or its deterministic initials fallback (no invented data). */
export function TenantAvatar({ name, logoUrl }: TenantAvatarProps) {
  if (logoUrl !== null) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-action/10 text-action font-bold text-xs flex items-center justify-center shrink-0 border border-action/20">
      {initialsOf(name)}
    </div>
  );
}
