import React from "react";

export default function RolesSettingsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text">Roles &amp; Capability Permissions</h1>
        <p className="text-sm text-text-muted mt-1">
          Configure custom enterprise roles and inspect granular capability assignment matrix.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
        Dynamic roles catalog and capabilities matrix will be fully wired in Issue #156.
      </div>
    </div>
  );
}
