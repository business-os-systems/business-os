import React from "react";

export default function BranchesSettingsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text">Branches &amp; Operational Sites</h1>
        <p className="text-sm text-text-muted mt-1">
          Manage operational sites, homestays, outlets, and physical facilities.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
        Branches directory and registration modal will be fully wired in Issue #155.
      </div>
    </div>
  );
}
