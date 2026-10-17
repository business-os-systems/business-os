import React from "react";

export default function MembersSettingsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text">Team Members &amp; Invitations</h1>
        <p className="text-sm text-text-muted mt-1">
          View active team members, dispatch multi-channel invitations, and manage membership.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-text-muted">
        Team directory, multi-channel invites, and safeguards will be fully wired in Issue #156.
      </div>
    </div>
  );
}
