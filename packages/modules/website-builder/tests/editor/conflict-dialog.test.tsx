import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CasConflictDialog } from "../../src/editor/dialogs/index.js";
import type { AutosaveConflict } from "../../src/editor/state/types.js";

const MINE = {
  version: 1 as const,
  schemaVersion: "2026-03" as const,
  sections: [{ id: "sec_mine", blocks: [] }],
};
const THEIRS = {
  version: 1 as const,
  schemaVersion: "2026-03" as const,
  sections: [
    { id: "sec_a", blocks: [] },
    { id: "sec_b", blocks: [] },
  ],
};

const CONFLICT: AutosaveConflict = {
  mine: { ast: MINE, authorName: "Rohit", editedAt: "2026-11-11T04:30:00.000Z", revision: 4 },
  theirs: {
    pageId: "page_1",
    revision: 6,
    draftAst: THEIRS,
    publishedAst: null,
    media: {},
    updatedAt: "2026-11-11T04:31:00.000Z",
    lastEditedByUserId: "usr_other",
    lastEditedAt: "2026-11-11T04:31:00.000Z",
  },
  retainedInHistory: true,
};

function renderDialog(conflict: AutosaveConflict | null): string {
  return renderToString(
    <CasConflictDialog
      conflict={conflict}
      currentUserId="usr_me"
      currentUserName="Rohit"
      timeZone="Asia/Kolkata"
      locale="en-US"
      onKeepMine={vi.fn()}
      onKeepTheirs={vi.fn()}
    />
  );
}

describe("Conflict dialog (T094, T101)", () => {
  it("names both versions with author, revision and edit time", () => {
    const html = renderDialog(CONFLICT);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Your version");
    expect(html).toContain("Saved version");
    expect(html).toContain("Rohit");
    expect(html).toContain("revision 4");
    expect(html).toContain("Another editor");
    expect(html).toContain("revision 6");
    const formatted = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date("2026-11-11T04:31:00.000Z"));
    expect(html).toContain(formatted);
    expect(html).toContain("1 section");
    expect(html).toContain("2 sections");
  });

  it("offers keep-mine and keep-theirs and explains history retention", () => {
    const html = renderDialog(CONFLICT);
    expect(html).toContain("Keep my version");
    expect(html).toContain("Keep their version");
    expect(html).toContain("version history before the conflict was reported");
  });

  it("renders nothing when there is no conflict", () => {
    expect(renderDialog(null)).toBe("");
  });
});
