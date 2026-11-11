"use client";

import React, { useId } from "react";
import { Button, Checkbox, Input, Label, PlusIcon, Select } from "@suite/ui";
import {
  MEDIA_TYPE_FILTER_OPTIONS,
  toMediaTypeFilter,
  type MediaTypeFilter,
} from "@suite/media/react";

export interface MediaTableToolbarProps {
  readonly searchDraft: string;
  readonly onSearchDraftChange: (value: string) => void;
  readonly onSearchSubmit: () => void;
  readonly typeFilter: MediaTypeFilter;
  readonly onTypeFilterChange: (value: MediaTypeFilter) => void;
  readonly unusedOnly: boolean;
  readonly onUnusedOnlyChange: (value: boolean) => void;
  readonly canUpload: boolean;
  readonly onUpload: () => void;
}

interface SearchFormProps {
  readonly searchId: string;
  readonly searchDraft: string;
  readonly onSearchDraftChange: (value: string) => void;
  readonly onSearchSubmit: () => void;
}

function MediaSearchForm({
  searchId,
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
}: SearchFormProps) {
  return (
    <form
      className="flex flex-1 items-end gap-2"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearchSubmit();
      }}
    >
      <div className="flex-1">
        <Label htmlFor={searchId}>Search media</Label>
        <Input
          id={searchId}
          type="search"
          value={searchDraft}
          placeholder="Search by file name"
          onChange={(event) => onSearchDraftChange(event.target.value)}
        />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}

interface ToolbarControlsProps {
  readonly searchId: string;
  readonly typeFilter: MediaTypeFilter;
  readonly onTypeFilterChange: (value: MediaTypeFilter) => void;
  readonly unusedOnly: boolean;
  readonly onUnusedOnlyChange: (value: boolean) => void;
  readonly canUpload: boolean;
  readonly onUpload: () => void;
}

function MediaToolbarControls({
  searchId,
  typeFilter,
  onTypeFilterChange,
  unusedOnly,
  onUnusedOnlyChange,
  canUpload,
  onUpload,
}: ToolbarControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        <Label htmlFor={`${searchId}-type`}>Asset type</Label>
        <Select
          id={`${searchId}-type`}
          value={typeFilter}
          options={MEDIA_TYPE_FILTER_OPTIONS.map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          onChange={(value) => onTypeFilterChange(toMediaTypeFilter(value))}
        />
      </div>
      <Checkbox
        id={`${searchId}-unused`}
        label="Unused only"
        checked={unusedOnly}
        onChange={(event) => onUnusedOnlyChange(event.target.checked)}
      />
      {canUpload ? (
        <Button type="button" onClick={onUpload} className="gap-1.5">
          <PlusIcon className="h-4 w-4" />
          Upload image
        </Button>
      ) : null}
    </div>
  );
}

export function MediaTableToolbar({
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
  typeFilter,
  onTypeFilterChange,
  unusedOnly,
  onUnusedOnlyChange,
  canUpload,
  onUpload,
}: MediaTableToolbarProps) {
  const searchId = useId();
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <MediaSearchForm
        searchId={searchId}
        searchDraft={searchDraft}
        onSearchDraftChange={onSearchDraftChange}
        onSearchSubmit={onSearchSubmit}
      />
      <MediaToolbarControls
        searchId={searchId}
        typeFilter={typeFilter}
        onTypeFilterChange={onTypeFilterChange}
        unusedOnly={unusedOnly}
        onUnusedOnlyChange={onUnusedOnlyChange}
        canUpload={canUpload}
        onUpload={onUpload}
      />
    </div>
  );
}
