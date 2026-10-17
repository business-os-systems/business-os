import React from "react";

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text">General Settings</h1>
        <p className="text-sm text-text-muted mt-1">
          Manage organization profile, currency, country, and statutory jurisdiction.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
        Organization Profile form and Danger Zone will be fully wired in Issue #154.
      </div>
    </div>
  );
}
