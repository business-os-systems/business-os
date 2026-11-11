import React, { useEffect, useState } from "react";
import { Button, Input, Label } from "@suite/ui";
import { isBrowser } from "@suite/ui";
import { LayersIcon, PlusIcon, RotateCcwIcon, XIcon } from "@suite/ui/icons";
import type { AddSectionDrawerProps, CatalogSection, CatalogSectionsState } from "./types.js";

export interface CatalogGroup {
  readonly category: string;
  readonly label: string;
  readonly sections: readonly CatalogSection[];
}

function humanizeCategory(category: string): string {
  const words = category.replace(/[-_]+/g, " ").trim();
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function matchesCatalogQuery(section: CatalogSection, query: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const haystack = [section.name, section.slug, section.category, ...section.industries].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function groupCatalogSections(sections: readonly CatalogSection[]): readonly CatalogGroup[] {
  const buckets = new Map<string, CatalogSection[]>();
  for (const section of sections) {
    const bucket = buckets.get(section.category);
    if (bucket === undefined) {
      buckets.set(section.category, [section]);
    } else {
      bucket.push(section);
    }
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, items]) => ({ category, label: humanizeCategory(category), sections: items }));
}

function CatalogCard(props: { readonly section: CatalogSection; readonly onInsert: () => void }) {
  const section = props.section;
  return (
    <button
      type="button"
      data-catalog-section-id={section.id}
      data-catalog-section-slug={section.slug}
      onClick={props.onInsert}
      className="flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text">{section.name}</span>
        <span className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] uppercase text-text-muted">
          {section.definition.block.type}
        </span>
      </span>
      <span className="text-[11px] text-text-secondary">
        {section.industries.length === 0 ? "All industries" : section.industries.join(", ")}
      </span>
      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-action">
        <PlusIcon size={12} /> Insert section
      </span>
    </button>
  );
}

function CatalogBody(props: {
  readonly catalog: CatalogSectionsState;
  readonly query: string;
  readonly onRetry: () => void;
  readonly onInsert: (section: CatalogSection) => void;
}) {
  if (props.catalog.kind === "loading") {
    return <p role="status" className="p-6 text-center text-xs text-text-muted">Loading sections from the catalog...</p>;
  }
  if (props.catalog.kind === "error") {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <p role="alert" className="text-xs font-medium text-danger">{props.catalog.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={props.onRetry} className="gap-1.5">
          <RotateCcwIcon size={12} /> Try again
        </Button>
      </div>
    );
  }
  if (props.catalog.sections.length === 0) {
    return (
      <p className="p-6 text-center text-xs text-text-muted">
        No sections are available for this workspace yet. An administrator publishes sections in the catalog first.
      </p>
    );
  }
  const visible = props.catalog.sections.filter((section) => matchesCatalogQuery(section, props.query));
  if (visible.length === 0) {
    return <p className="p-6 text-center text-xs text-text-muted">No sections match "{props.query}".</p>;
  }
  return (
    <div className="space-y-5">
      {groupCatalogSections(visible).map((group) => (
        <section key={group.category} aria-label={group.label} data-catalog-group={group.category}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{group.label}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.sections.map((section) => (
              <CatalogCard key={section.id} section={section} onInsert={() => props.onInsert(section)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Adds a section from the tenant-visible catalog; no section list is hardcoded. */
export function AddSectionDrawer(props: AddSectionDrawerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isBrowser || !props.isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props.isOpen, props.onClose]);

  if (!props.isOpen) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-section-title"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="add-section-title" className="flex items-center gap-1.5 text-sm font-bold text-text">
              <LayersIcon size={15} /> Add a section
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">Sections available to this workspace, from the published catalog.</p>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close add-section drawer" onClick={props.onClose} className="h-7 w-7">
            <XIcon size={14} />
          </Button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <Label htmlFor="catalog-section-search" className="text-[11px] font-medium text-text">Search sections</Label>
          <Input
            id="catalog-section-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, category or industry"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <CatalogBody catalog={props.catalog} query={query} onRetry={props.onRetry} onInsert={props.onInsert} />
        </div>
      </div>
    </div>
  );
}
