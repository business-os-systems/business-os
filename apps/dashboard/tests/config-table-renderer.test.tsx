import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { TableConfig } from "@suite/ui";
import { ConfigTableRenderer } from "../src/components/config-renderers/config-table-renderer.js";

interface BranchRow {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
}

const testTableConfig: TableConfig<BranchRow> = {
  id: "branches-table",
  columns: [
    { key: "name", header: "Branch Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    { key: "type", header: "Classification" },
    {
      key: "status",
      header: "Status",
      render: (val) => <span className="font-semibold">{String(val).toUpperCase()}</span>,
    },
  ],
  actions: [
    {
      id: "edit",
      label: "Edit",
      permission: "core:branches:write",
      onClick: vi.fn(),
    },
    {
      id: "delete",
      label: "Deactivate",
      variant: "destructive",
      permission: "core:branches:manage",
      dangerVerificationSlug: (row) => row.code,
      onClick: vi.fn(),
    },
  ],
  emptyState: {
    title: "No Branches Found",
    description: "Get started by registering your first operational location.",
    actionLabel: "Add Branch",
    onAction: vi.fn(),
  },
};

const mockBranches: BranchRow[] = [
  { id: "b1", name: "Flagship Riverside Cafe", code: "RIVER-01", type: "CAFE", status: "Active" },
  { id: "b2", name: "Mountain View Cottages", code: "MNT-02", type: "HOMESTAY", status: "Active" },
];

describe("ConfigTableRenderer Declarative Engine", () => {
  it("renders table headers, rows, and custom cell formatters", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={testTableConfig}
        data={mockBranches}
        userPermissions={["core:branches:write"]}
      />
    );

    expect(html).toContain("Branch Name");
    expect(html).toContain("Code");
    expect(html).toContain("Classification");
    expect(html).toContain("Flagship Riverside Cafe");
    expect(html).toContain("RIVER-01");
    expect(html).toContain("ACTIVE");
    expect(html).toContain("Mountain View Cottages");
  });

  it("renders empty state when data array is empty", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={testTableConfig}
        data={[]}
      />
    );

    expect(html).toContain("No Branches Found");
    expect(html).toContain("Get started by registering your first operational location.");
    expect(html).toContain("Add Branch");
  });

  it("renders loading spinner state when isLoading is true", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={testTableConfig}
        data={mockBranches}
        isLoading={true}
      />
    );

    expect(html).not.toContain("Flagship Riverside Cafe");
    expect(html).toContain("animate-spin");
  });

  it("gates row actions by capability permissions", () => {
    // Only has write permission, not manage
    const htmlWriteOnly = renderToString(
      <ConfigTableRenderer
        config={testTableConfig}
        data={mockBranches}
        userPermissions={["core:branches:write"]}
      />
    );

    expect(htmlWriteOnly).toContain("Edit");
    expect(htmlWriteOnly).not.toContain("Deactivate");

    // Has both write and manage
    const htmlManage = renderToString(
      <ConfigTableRenderer
        config={testTableConfig}
        data={mockBranches}
        userPermissions={["core:branches:write", "core:branches:manage"]}
      />
    );

    expect(htmlManage).toContain("Edit");
    expect(htmlManage).toContain("Deactivate");
  });
});
