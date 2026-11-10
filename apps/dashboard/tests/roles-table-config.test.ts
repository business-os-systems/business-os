import { describe, expect, it, vi } from "vitest";
import { createRoleTableConfig } from "../src/app/(dashboard)/settings/roles/roles.config.js";

describe("role table config", () => {
  it("requires the role name before the delete action runs", () => {
    const config = createRoleTableConfig({
      onViewRole: vi.fn(),
      onEditRole: vi.fn(),
      onDeleteRole: vi.fn(),
    });

    const deleteAction = config.actions?.find(
      (action) => action.id === "delete-role",
    );

    expect(deleteAction?.verification).toMatchObject({
      kind: "typed",
      title: "Delete role",
      message: "This permanently deletes the custom role.",
    });
  });
});
