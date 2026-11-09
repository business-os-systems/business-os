// @vitest-environment jsdom
/* global document, HTMLElement, HTMLButtonElement, HTMLInputElement, KeyboardEvent */
import React, { act } from "react";
import { describe, it, expect, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { TableConfig } from "../src/index.js";
import { ConfigTableRenderer } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface BranchRow {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
}

const onEdit = vi.fn();
const onDelete = vi.fn();
const onRowOpen = vi.fn();

const config: TableConfig<BranchRow> = {
  id: "branches-table",
  columns: [
    { key: "name", header: "Branch Name", sortable: true },
    { key: "code", header: "Code", sortable: true },
    { key: "type", header: "Classification" },
    {
      key: "status",
      header: "Status",
      render: (value) => (
        <span className="font-semibold">{String(value).toUpperCase()}</span>
      ),
    },
  ],
  actions: [
    {
      id: "edit",
      label: "Edit",
      permission: "core:branches:write",
      onClick: onEdit,
    },
    {
      id: "delete",
      label: "Deactivate",
      variant: "destructive",
      permission: "core:branches:manage",
      dangerVerificationSlug: (row) => row.code,
      onClick: onDelete,
    },
  ],
  emptyState: {
    title: "No Branches Found",
    description: "Get started by registering your first operational location.",
    actionLabel: "Add Branch",
    onAction: vi.fn(),
  },
};

const rows: BranchRow[] = [
  {
    id: "b1",
    name: "Flagship Riverside Cafe",
    code: "RIVER-01",
    type: "CAFE",
    status: "Active",
  },
  {
    id: "b2",
    name: "Mountain View Cottages",
    code: "MNT-02",
    type: "HOMESTAY",
    status: "Active",
  },
];

function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
}

function sortableHeader(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Branch Name",
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("No sortable header");
  }
  return button;
}

describe("shared ConfigTableRenderer", () => {
  it("renders headers, rows and custom cell formatters", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write"]}
      />,
    );

    expect(html).toContain("Branch Name");
    expect(html).toContain("Flagship Riverside Cafe");
    expect(html).toContain("RIVER-01");
    expect(html).toContain("ACTIVE");
    expect(html).toContain("Edit");
    expect(html).not.toContain("Deactivate");
  });

  it("renders the empty state instead of rows", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={config}
        data={[]}
        rowKey={(row) => row.id}
      />,
    );

    expect(html).toContain("No Branches Found");
    expect(html).toContain("Add Branch");
  });

  it("renders the loading and error states", () => {
    const loading = renderToString(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        isLoading
      />,
    );
    expect(loading).toContain("animate-spin");
    expect(loading).not.toContain("Flagship Riverside Cafe");

    const failed = renderToString(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        error="The branch list could not be loaded."
      />,
    );
    expect(failed).toContain("The branch list could not be loaded.");
  });

  it("fails closed when a permissioned action has no permission context", () => {
    const html = renderToString(
      <ConfigTableRenderer config={config} data={rows} rowKey={(row) => row.id} />,
    );

    expect(html).not.toContain("Edit");
    expect(html).not.toContain("Deactivate");
  });

});

describe("shared ConfigTableRenderer presentation overrides", () => {
  it("uses the caller's error title and null label", () => {
    const nullableConfig: TableConfig<{ id: string; note: string | null }> = {
      id: "nullable-table",
      columns: [{ key: "note", header: "Note" }],
      emptyState: { title: "No notes", description: "Nothing to show." },
    };
    const html = renderToString(
      <ConfigTableRenderer
        config={nullableConfig}
        data={[{ id: "n1", note: null }]}
        rowKey={(row) => row.id}
        nullLabel="Not set"
      />,
    );
    expect(html).toContain("Not set");

    const failed = renderToString(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        error="Capability denied."
        errorTitle="Tenant list unavailable"
      />,
    );
    expect(failed).toContain("Tenant list unavailable");
    expect(failed).toContain("Capability denied.");
  });
});

describe("shared ConfigTableRenderer actions", () => {
  it("runs an action that needs no confirmation", () => {
    const { container, root } = render(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write"]}
      />,
    );
    const edit = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Edit",
    );
    if (edit === undefined) throw new Error("No Edit action");
    act(() => edit.click());
    expect(onEdit).toHaveBeenCalledWith(rows[0]);

    act(() => root.unmount());
    container.remove();
  });

});

describe("shared ConfigTableRenderer destructive confirmation", () => {
  it("opens a typed confirmation and keeps the action disabled", () => {
    const { container, root } = render(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write", "core:branches:manage"]}
      />,
    );
    const deactivate = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Deactivate",
    );
    if (deactivate === undefined) throw new Error("No Deactivate action");
    act(() => deactivate.click());
    expect(document.body.textContent).toContain("Type RIVER-01 to confirm");

    const dialog = document.querySelector('[role="dialog"]');
    if (dialog === null) throw new Error("No confirmation dialog");
    const confirm = Array.from(dialog.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Deactivate",
    );
    expect(confirm?.hasAttribute("disabled")).toBe(true);

    act(() => root.unmount());
    container.remove();
  });

});

describe("shared ConfigTableRenderer typed confirmation", () => {
  it("runs the destructive action once the typed slug matches", () => {
    const { container, root } = render(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write", "core:branches:manage"]}
      />,
    );
    const deactivate = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Deactivate",
    );
    if (deactivate === undefined) throw new Error("No Deactivate action");
    act(() => deactivate.click());

    const dialog = document.querySelector('[role="dialog"]');
    if (dialog === null) throw new Error("No confirmation dialog");
    const input = dialog.querySelector("input");
    if (!(input instanceof HTMLInputElement)) throw new Error("No input");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "RIVER-01",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const enabled = Array.from(dialog.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Deactivate",
    );
    act(() => enabled?.click());
    expect(onDelete).toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("renders a caller-supplied empty state", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={config}
        data={[]}
        rowKey={(row) => row.id}
        emptyState={{
          title: "No branches match this filter",
          description: "Clear the search to see every branch.",
        }}
      />,
    );

    expect(html).toContain("No branches match this filter");
    expect(html).toContain("Clear the search to see every branch.");
  });
});

describe("shared ConfigTableRenderer interaction", () => {
  it("sorts a sortable column on click and toggles direction", () => {
    const { container, root } = render(
      <ConfigTableRenderer config={config} data={rows} rowKey={(row) => row.id} />,
    );
    act(() => sortableHeader(container).click());
    const ascending = container.textContent ?? "";
    expect(ascending.indexOf("Flagship Riverside Cafe")).toBeLessThan(
      ascending.indexOf("Mountain View Cottages"),
    );

    act(() => sortableHeader(container).click());
    const descending = container.textContent ?? "";
    expect(descending.indexOf("Mountain View Cottages")).toBeLessThan(
      descending.indexOf("Flagship Riverside Cafe"),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("opens the first row with the keyboard", () => {
    const { container, root } = render(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        onRowOpen={onRowOpen}
      />,
    );
    const rowButton = container.querySelector("tbody button");
    if (rowButton === null) throw new Error("No row open button");
    act(() => {
      rowButton.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);

    act(() => root.unmount());
    container.remove();
  });
});
