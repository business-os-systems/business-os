import React, { useState } from "react";
import { Badge, Button, Input, Label } from "@suite/ui";
import { ChevronDownIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from "@suite/ui/icons";
import { pagePathError } from "../../paths/page-paths.js";
import { buildPageTree, type PageTreePage, type PageTreeNode } from "./page-tree-model.js";

export interface PageTreeCreateInput {
  readonly title: string;
  readonly path: string;
  readonly parentId: string | null;
}

export interface PageTreeRenameInput {
  readonly pageId: string;
  readonly title: string;
  readonly path: string;
  readonly expectedRevision: number;
}

export interface PageTreeProps {
  readonly pages: readonly PageTreePage[];
  readonly activePageId: string;
  readonly canWrite?: boolean;
  readonly onSelectPage: (pageId: string) => void;
  readonly onCreatePage: (input: PageTreeCreateInput) => Promise<void>;
  readonly onRenamePage: (input: PageTreeRenameInput) => Promise<void>;
  readonly onDeletePage: (pageId: string) => Promise<void>;
}

type EditMode =
  | { readonly kind: "idle" }
  | { readonly kind: "create"; readonly parentId: string | null }
  | { readonly kind: "rename"; readonly page: PageTreePage }
  | { readonly kind: "delete"; readonly page: PageTreePage };

type FormMode = Exclude<EditMode, { kind: "idle" } | { kind: "delete" }>;

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface FormFieldsProps {
  readonly mode: FormMode;
  readonly pathError: string | null;
  readonly onTitleChange: (value: string) => void;
  readonly onPathChange: (value: string) => void;
}

function PageTreeFormFields(props: FormFieldsProps) {
  const initialTitle = props.mode.kind === "rename" ? props.mode.page.title : "";
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="page-tree-title" className="text-[11px] font-medium text-text">
          Page title
        </Label>
        <Input
          id="page-tree-title"
          defaultValue={initialTitle}
          onChange={(event) => props.onTitleChange(event.target.value)}
          placeholder="About us"
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="page-tree-path" className="text-[11px] font-medium text-text">
          Address
        </Label>
        <Input
          id="page-tree-path"
          defaultValue={props.mode.kind === "rename" ? props.mode.page.path : ""}
          onChange={(event) => props.onPathChange(event.target.value)}
          placeholder="/about-us"
          className="h-8 text-xs font-mono"
        />
        {props.pathError !== null ? (
          <p role="alert" className="text-[11px] font-medium text-danger">
            {props.pathError}
          </p>
        ) : null}
      </div>
    </>
  );
}

interface FormProps {
  readonly mode: FormMode;
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly onSubmit: (title: string, path: string) => void;
}

function PageTreeForm(props: FormProps) {
  const [title, setTitle] = useState(props.mode.kind === "rename" ? props.mode.page.title : "");
  const [path, setPath] = useState(props.mode.kind === "rename" ? props.mode.page.path : "");
  const [pathError, setPathError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length === 0) {
      setPathError("A page needs a title.");
      return;
    }
    const error = pagePathError(path);
    if (error !== null) {
      setPathError(error);
      return;
    }
    props.onSubmit(title.trim(), path.trim());
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <PageTreeFormFields
        mode={props.mode}
        pathError={pathError}
        onTitleChange={setTitle}
        onPathChange={setPath}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={props.isBusy}>
          {props.isBusy ? "Saving..." : "Save page"}
        </Button>
      </div>
    </form>
  );
}

function DeleteConfirm(props: {
  readonly page: PageTreePage;
  readonly isBusy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-danger bg-surface p-3">
      <p className="text-xs text-text">
        Delete <span className="font-semibold">{props.page.title}</span> and its content?
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={props.onCancel}>
          Keep page
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={props.isBusy}
          onClick={props.onConfirm}
        >
          {props.isBusy ? "Deleting..." : "Delete page"}
        </Button>
      </div>
    </div>
  );
}

interface NodeRowProps {
  readonly node: PageTreeNode;
  readonly level: number;
  readonly activePageId: string;
  readonly canWrite: boolean;
  readonly pageCount: number;
  readonly onSelectPage: (pageId: string) => void;
  readonly onAddChild: (page: PageTreePage) => void;
  readonly onRename: (page: PageTreePage) => void;
  readonly onDelete: (page: PageTreePage) => void;
}

function PageTreeRowLabel(props: {
  readonly node: PageTreeNode;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-page-tree-button={props.node.id}
      onClick={props.onSelect}
      className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      {props.node.children.length > 0 ? (
        <ChevronDownIcon size={13} className="shrink-0 text-text-muted" />
      ) : (
        <ChevronRightIcon size={13} className="shrink-0 text-text-disabled" />
      )}
      <span className="truncate text-xs font-medium text-text">{props.node.title}</span>
      <span className="truncate font-mono text-[10px] text-text-muted">{props.node.path}</span>
      {props.node.isHomePage ? (
        <Badge variant="tertiary" className="text-[9px]">Home</Badge>
      ) : null}
    </button>
  );
}

function PageTreeRowActions(props: {
  readonly node: PageTreeNode;
  readonly isProtected: boolean;
  readonly onAddChild: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={"Add page inside " + props.node.title}
        title="Add a child page"
        onClick={props.onAddChild}
        className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <PlusIcon size={12} />
      </button>
      <button
        type="button"
        aria-label={"Rename " + props.node.title}
        title="Rename page"
        onClick={props.onRename}
        className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <PencilIcon size={12} />
      </button>
      <button
        type="button"
        aria-label={"Delete " + props.node.title}
        title={props.isProtected ? "The home page and the last page cannot be deleted" : "Delete page"}
        disabled={props.isProtected}
        onClick={props.onDelete}
        className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <TrashIcon size={12} />
      </button>
    </span>
  );
}

function pageRowClassName(isActive: boolean): string {
  if (isActive) {
    return "flex items-center gap-2 rounded-md border-l-2 border-action bg-action-tint px-2 py-1.5";
  }
  return "flex items-center gap-2 rounded-md border-l-2 border-transparent px-2 py-1.5 hover:bg-surface-hover";
}

function PageTreeRow(props: NodeRowProps) {
  const { node, level } = props;
  const isActive = node.id === props.activePageId;
  const isProtected = node.isHomePage || props.pageCount <= 1;
  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-selected={isActive}
      aria-current={isActive ? "page" : undefined}
      data-page-tree-item={node.id}
      className="list-none"
    >
      <div className={pageRowClassName(isActive)}>
        <PageTreeRowLabel node={node} onSelect={() => props.onSelectPage(node.id)} />
        {props.canWrite ? (
          <PageTreeRowActions
            node={node}
            isProtected={isProtected}
            onAddChild={() => props.onAddChild(node)}
            onRename={() => props.onRename(node)}
            onDelete={() => props.onDelete(node)}
          />
        ) : null}
      </div>
      {node.children.length > 0 ? (
        <ul role="group" className="ml-4 space-y-0.5 border-l border-border pl-1">
          {node.children.map((child) => (
            <PageTreeRow key={child.id} {...props} node={child} level={level + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function moveTreeFocus(event: React.KeyboardEvent<HTMLUListElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-page-tree-button]")
  );
  const currentIndex = buttons.findIndex((button) => button === document.activeElement);
  if (currentIndex < 0) {
    return;
  }
  event.preventDefault();
  const offset = event.key === "ArrowDown" ? 1 : -1;
  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), buttons.length - 1);
  buttons[nextIndex]?.focus();
}

function usePageTreeEditing(props: PageTreeProps) {
  const [mode, setMode] = useState<EditMode>({ kind: "idle" });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      setMode({ kind: "idle" });
    } catch (caught: unknown) {
      setError(readErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  };

  const submitForm = (title: string, path: string) => {
    if (mode.kind === "create") {
      void run(() => props.onCreatePage({ title, path, parentId: mode.parentId }));
      return;
    }
    if (mode.kind === "rename") {
      void run(() =>
        props.onRenamePage({
          pageId: mode.page.id,
          title,
          path,
          expectedRevision: mode.page.revision,
        })
      );
    }
  };

  return { mode, setMode, isBusy, error, run, submitForm };
}

function PageTreeHeader(props: {
  readonly pageCount: number;
  readonly canWrite: boolean;
  readonly onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Pages</h2>
        <p className="text-[10px] text-text-muted">
          {`${props.pageCount} ${props.pageCount === 1 ? "page" : "pages"}`}
        </p>
      </div>
      {props.canWrite ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={props.onAdd}
        >
          <PlusIcon size={12} />
          Add page
        </Button>
      ) : null}
    </div>
  );
}

function PageTreePanels(props: {
  readonly mode: EditMode;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onSubmitForm: (title: string, path: string) => void;
  readonly onDeletePage: (pageId: string) => Promise<void>;
  readonly run: (action: () => Promise<void>) => Promise<void>;
}) {
  const editor = props.mode.kind === "create" || props.mode.kind === "rename" ? props.mode : null;
  const deletePage = props.mode.kind === "delete" ? props.mode.page : null;
  const formKey = editor?.kind === "rename" ? editor.page.id : "new-page";
  return (
    <>
      {props.error !== null ? (
        <p role="alert" className="rounded-md border border-danger bg-surface p-2 text-[11px] font-medium text-danger">
          {props.error}
        </p>
      ) : null}
      {editor !== null ? (
        <PageTreeForm
          key={formKey}
          mode={editor}
          isBusy={props.isBusy}
          onCancel={props.onCancel}
          onSubmit={props.onSubmitForm}
        />
      ) : null}
      {deletePage !== null ? (
        <DeleteConfirm
          page={deletePage}
          isBusy={props.isBusy}
          onCancel={props.onCancel}
          onConfirm={() => void props.run(() => props.onDeletePage(deletePage.id))}
        />
      ) : null}
    </>
  );
}

function PageTreeList(props: {
  readonly nodes: readonly PageTreeNode[];
  readonly activePageId: string;
  readonly canWrite: boolean;
  readonly pageCount: number;
  readonly onSelectPage: (pageId: string) => void;
  readonly onAddChild: (page: PageTreePage) => void;
  readonly onRename: (page: PageTreePage) => void;
  readonly onDelete: (page: PageTreePage) => void;
}) {
  if (props.nodes.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-text-muted">
        This site has no pages yet.
      </p>
    );
  }
  return (
    <ul role="tree" aria-label="Site pages" className="space-y-0.5" onKeyDown={moveTreeFocus}>
      {props.nodes.map((node) => (
        <PageTreeRow
          key={node.id}
          node={node}
          level={1}
          activePageId={props.activePageId}
          canWrite={props.canWrite}
          pageCount={props.pageCount}
          onSelectPage={props.onSelectPage}
          onAddChild={props.onAddChild}
          onRename={props.onRename}
          onDelete={props.onDelete}
        />
      ))}
    </ul>
  );
}

/**
 * Hierarchical page tree for the studio. Selecting a page is a real navigation
 * callback (so the URL changes), editing is inline, and the browser validates
 * reserved addresses before the API is called; the API remains authoritative.
 */
export function PageTree(props: PageTreeProps) {
  const canWrite = props.canWrite !== false;
  const nodes = buildPageTree(props.pages);
  const editing = usePageTreeEditing(props);
  return (
    <aside aria-label="Page tree" className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      <PageTreeHeader
        pageCount={props.pages.length}
        canWrite={canWrite}
        onAdd={() => editing.setMode({ kind: "create", parentId: null })}
      />
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        <PageTreePanels
          mode={editing.mode}
          isBusy={editing.isBusy}
          error={editing.error}
          onCancel={() => editing.setMode({ kind: "idle" })}
          onSubmitForm={editing.submitForm}
          onDeletePage={props.onDeletePage}
          run={editing.run}
        />
        <PageTreeList
          nodes={nodes}
          activePageId={props.activePageId}
          canWrite={canWrite}
          pageCount={props.pages.length}
          onSelectPage={props.onSelectPage}
          onAddChild={(page) => editing.setMode({ kind: "create", parentId: page.id })}
          onRename={(page) => editing.setMode({ kind: "rename", page })}
          onDelete={(page) => editing.setMode({ kind: "delete", page })}
        />
      </div>
    </aside>
  );
}
