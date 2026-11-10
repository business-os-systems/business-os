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
const onArchive = vi.fn();
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
      verification: {
        kind: "typed",
        title: "Deactivate branch",
        message: "This deactivates the branch and stops tenant access.",
        expectedPhrase: (row) => row.code,
      },
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

function mount(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, root };
}

function field(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("No button " + label);
  }
  return button;
}

function dialog(): HTMLElement {
  const element = document.querySelector('[role="dialog"]');
  if (!(element instanceof HTMLElement)) throw new Error("No dialog");
  return element;
}

function dialogButton(label: string): HTMLButtonElement {
  const button = Array.from(dialog().querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("No dialog button " + label);
  }
  return button;
}

function typePhrase(value: string): void {
  const input = dialog().querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error("No input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    input,
    value,
  );
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

describe("shared ConfigTableRenderer rendering", () => {
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

  it("derives a row key when the caller omits rowKey", () => {
    const html = renderToString(
      <ConfigTableRenderer config={config} data={rows} />,
    );
    expect(html).toContain("Flagship Riverside Cafe");
  });

  it("renders the caller toolbar", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        toolbar={<span>Filters</span>}
      />,
    );
    expect(html).toContain("Filters");
  });

});

describe("shared ConfigTableRenderer states", () => {
  it("renders empty, loading and error states", () => {
    const empty = renderToString(
      <ConfigTableRenderer config={config} data={[]} rowKey={(row) => row.id} />,
    );
    expect(empty).toContain("No Branches Found");
    expect(empty).not.toContain("<table");

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
        errorTitle="Tenant list unavailable"
      />,
    );
    expect(failed).toContain("Tenant list unavailable");
    expect(failed).toContain("The branch list could not be loaded.");
  });

});

describe("shared ConfigTableRenderer visibility", () => {
  it("hides an action whose isVisible predicate returns false", () => {
    const hidden: TableConfig<BranchRow> = {
      ...config,
      actions: [
        {
          id: "edit",
          label: "Edit",
          permission: "core:branches:write",
          isVisible: (row) => row.code !== "RIVER-01",
          onClick: onEdit,
        },
      ],
    };
    const html = renderToString(
      <ConfigTableRenderer
        config={hidden}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write"]}
      />,
    );
    const firstRow = html.indexOf("Flagship Riverside Cafe");
    const secondRow = html.indexOf("Mountain View Cottages");
    expect(html.slice(firstRow, secondRow)).not.toContain(">Edit<");
    expect(html.slice(secondRow)).toContain(">Edit<");
  });
});

describe("shared ConfigTableRenderer permissions", () => {
  it("fails closed when a permissioned action has no permission context", () => {
    const html = renderToString(
      <ConfigTableRenderer config={config} data={rows} rowKey={(row) => row.id} />,
    );
    expect(html).not.toContain("Edit");
    expect(html).not.toContain("Deactivate");
  });

});

describe("shared ConfigTableRenderer overrides", () => {
  it("renders the caller's null label", () => {
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
  });
});

describe("shared ConfigTableRenderer sorting", () => {
  it("sorts strings, numbers, booleans, dates and objects", () => {
    interface SortedRow {
      id: string;
      label: string;
      rank: number;
      flag: boolean;
      createdAt: Date;
      meta: object;
    }
    const sortedConfig: TableConfig<SortedRow> = {
      id: "sorted-table",
      columns: [
        { key: "label", header: "Label", sortable: true },
        { key: "rank", header: "Rank", sortable: true },
        { key: "flag", header: "Flag", sortable: true },
        { key: "createdAt", header: "Created", sortable: true },
        { key: "meta", header: "Meta", sortable: true },
      ],
      emptyState: { title: "No rows", description: "Nothing." },
    };
    const sortedRows: SortedRow[] = [
      {
        id: "s1",
        label: "Beta",
        rank: 2,
        flag: true,
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        meta: { order: 2 },
      },
      {
        id: "s2",
        label: "Alpha",
        rank: 1,
        flag: false,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        meta: { order: 1 },
      },
    ];
    const { container, root } = mount(
      <ConfigTableRenderer
        config={sortedConfig}
        data={sortedRows}
        rowKey={(row) => row.id}
      />,
    );
    for (const label of ["Label", "Rank", "Flag", "Created", "Meta"]) {
      act(() => field(container, label).click());
    }
    expect(container.textContent).toContain("Alpha");
    act(() => root.unmount());
    container.remove();
  });

});

describe("shared ConfigTableRenderer direction", () => {
  it("toggles a column direction", () => {
    const { container, root } = mount(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
      />,
    );
    act(() => field(container, "Branch Name").click());
    const ascending = container.textContent ?? "";
    expect(ascending.indexOf("Flagship")).toBeLessThan(
      ascending.indexOf("Mountain View"),
    );
    act(() => field(container, "Branch Name").click());
    const descending = container.textContent ?? "";
    expect(descending.indexOf("Mountain View")).toBeLessThan(
      descending.indexOf("Flagship"),
    );
    act(() => root.unmount());
    container.remove();
  });

  it("renders an object cell without a renderer as text", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={{
          id: "object-table",
          columns: [{ key: "meta", header: "Meta" }],
          emptyState: { title: "No rows", description: "Nothing." },
        }}
        data={[{ id: "o1", meta: { a: 1 } }]}
        rowKey={(row) => row.id}
      />,
    );
    expect(html).toContain("[object Object]");
  });
});

describe("shared ConfigTableRenderer action presentation", () => {
  it("renders an icon-only action with a tooltip and accessible label", () => {
    const iconConfig: TableConfig<BranchRow> = {
      ...config,
      actions: [
        {
          id: "delete",
          label: "Delete Role",
          tooltip: "Delete the role",
          iconOnly: true,
          renderIcon: () => <span data-testid="action-icon" />,
          onClick: vi.fn(),
        },
      ],
    };
    const html = renderToString(
      <ConfigTableRenderer config={iconConfig} data={rows} rowKey={(row) => row.id} />,
    );
    expect(html).toContain('title="Delete the role"');
    expect(html).toContain('aria-label="Delete Role"');
    expect(html).toContain("data-testid=\"action-icon\"");
  });

  it("routes a failed action to onActionError", async () => {
    const onActionError = vi.fn();
    const failing: TableConfig<BranchRow> = {
      ...config,
      actions: [
        {
          id: "edit",
          label: "Edit",
          onClick: () => Promise.reject(new Error("boom")),
        },
      ],
    };
    const { container, root } = mount(
      <ConfigTableRenderer
        config={failing}
        data={rows}
        rowKey={(row) => row.id}
        onActionError={onActionError}
      />,
    );
    act(() => field(container, "Edit").click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(onActionError).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});

describe("shared ConfigTableRenderer row open", () => {
  it("opens a row with the keyboard", () => {
    const { container, root } = mount(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        onRowOpen={onRowOpen}
      />,
    );
    const button = container.querySelector("tbody button");
    if (button === null) throw new Error("No row button");
    act(() => {
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);
    act(() => root.unmount());
    container.remove();
  });

  it("opens a row with a click", () => {
    const { container, root } = mount(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        onRowOpen={onRowOpen}
      />,
    );
    const button = container.querySelector("tbody button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("No row button");
    act(() => button.click());
    expect(onRowOpen).toHaveBeenCalledWith(rows[0]);
    act(() => root.unmount());
    container.remove();
  });
});

describe("shared ConfigTableRenderer plain actions", () => {
  it("runs an action that needs no confirmation", () => {
    const { container, root } = mount(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write"]}
      />,
    );
    act(() => field(container, "Edit").click());
    expect(onEdit).toHaveBeenCalledWith(rows[0]);
    act(() => root.unmount());
    container.remove();
  });
});

describe("shared ConfigTableRenderer confirmation", () => {
  it("runs a simple confirmation and closes on cancel", () => {
    const simpleConfig: TableConfig<BranchRow> = {
      ...config,
      actions: [
        {
          id: "archive",
          label: "Archive",
          verification: {
            kind: "confirm",
            title: "Archive branch",
            message: "This archives the branch.",
          },
          onClick: onArchive,
        },
      ],
    };
    const { container, root } = mount(
      <ConfigTableRenderer
        config={simpleConfig}
        data={rows}
        rowKey={(row) => row.id}
      />,
    );
    act(() => field(container, "Archive").click());
    expect(dialog().textContent).toContain("This action cannot be undone.");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => field(container, "Archive").click());
    act(() => dialogButton("Cancel").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    act(() => field(container, "Archive").click());
    act(() => dialogButton("Archive").click());
    expect(onArchive).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the destructive action disabled until the slug matches", () => {
    const { container, root } = mount(
      <ConfigTableRenderer
        config={config}
        data={rows}
        rowKey={(row) => row.id}
        userPermissions={["core:branches:write", "core:branches:manage"]}
      />,
    );
    act(() => field(container, "Deactivate").click());
    expect(dialog().textContent).toContain("Type RIVER-01 to confirm");
    expect(dialogButton("Deactivate").hasAttribute("disabled")).toBe(true);
    typePhrase("RIVER-01");
    expect(dialogButton("Deactivate").hasAttribute("disabled")).toBe(false);
    act(() => dialogButton("Deactivate").click());
    expect(onDelete).toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});
