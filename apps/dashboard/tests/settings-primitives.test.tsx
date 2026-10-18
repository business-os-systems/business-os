import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { StickyActionBar } from "../src/components/settings/sticky-action-bar.js";
import { DangerZoneCard } from "../src/components/settings/danger-zone-card.js";
import { CopyInviteButton } from "../src/components/settings/copy-invite-button.js";

describe("Settings Hub Specialized Primitives", () => {
  describe("StickyActionBar", () => {
    it("renders save and discard buttons with clean state", () => {
      const html = renderToString(
        <StickyActionBar
          isDirty={false}
          isSaving={false}
          saveLabel="Save changes"
          discardLabel="Discard"
          onSave={vi.fn()}
          onDiscard={vi.fn()}
        />
      );

      expect(html).toContain("Save changes");
      expect(html).toContain("Discard");
      expect(html).toContain("All changes saved");
    });

    it("displays unsaved changes warning when isDirty is true", () => {
      const html = renderToString(
        <StickyActionBar
          isDirty={true}
          isSaving={false}
          statusPrompt="Careful — you have unsaved changes!"
        />
      );

      expect(html).toContain("Careful — you have unsaved changes!");
      expect(html).toContain("bg-warning");
    });

    it("displays saving spinner when isSaving is true", () => {
      const html = renderToString(
        <StickyActionBar
          isDirty={true}
          isSaving={true}
        />
      );

      expect(html).toContain("Saving...");
      expect(html).toContain("animate-spin");
    });
  });

  describe("DangerZoneCard", () => {
    it("renders danger alert icon, title, description, and destructive button", () => {
      const html = renderToString(
        <DangerZoneCard
          title="Delete Workspace"
          description="Irreversibly erase all branches and folios"
          actionLabel="Delete Workspace"
          expectedSlug="DELETE-WS"
          onConfirm={vi.fn()}
        />
      );

      expect(html).toContain("Delete Workspace");
      expect(html).toContain("Irreversibly erase all branches and folios");
      expect(html).toContain("border-brand");
    });
  });

  describe("CopyInviteButton", () => {
    it("renders copy button with icon and initial label", () => {
      const html = renderToString(
        <CopyInviteButton
          inviteUrl="https://businessos.app/invite/token-123456"
          label="Copy Invite Link"
        />
      );

      expect(html).toContain("Copy Invite Link");
      expect(html).toContain("button");
    });
  });
});
