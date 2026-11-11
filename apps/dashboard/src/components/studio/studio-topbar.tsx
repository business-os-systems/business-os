"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button } from "@suite/ui";
import { ArrowLeftIcon, EyeIcon, LayersIcon } from "@suite/ui/icons";
import {
  DeviceSwitch,
  type AutosaveStatus,
} from "@suite/website-builder/editor";
import type { CmsPageDto, CmsSiteDto } from "@/lib/api/site-client";
import { workspacePath } from "@/lib/workspace-paths";
import type { StudioEditorToolbar, StudioViewport } from "./studio-editor-props";
import { AutosaveIndicator } from "./autosave-indicator";
import { studioPreviewPath, studioReviewPath } from "./studio-links.config";

const SAVEABLE_STATUSES: ReadonlySet<AutosaveStatus> = new Set(["dirty", "offline", "error"]);

export interface StudioTopBarProps extends StudioViewport {
  readonly site: CmsSiteDto;
  readonly activePage: CmsPageDto;
  readonly sites: readonly CmsSiteDto[];
  readonly canWrite: boolean;
  readonly canManageAppearance: boolean;
  readonly toolbar: StudioEditorToolbar | null;
  readonly isAppearanceOpen: boolean;
  readonly onToggleAppearance: () => void;
  readonly onSwitchSite: (siteId: string) => void;
}

interface SiteSwitcherProps {
  readonly site: CmsSiteDto;
  readonly sites: readonly CmsSiteDto[];
  readonly onSwitchSite: (siteId: string) => void;
}

function SiteSwitcher(props: SiteSwitcherProps) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <label className="sr-only" htmlFor="studio-site-switcher">
        Switch site
      </label>
      <select
        id="studio-site-switcher"
        value={props.site.id}
        onChange={(event) => props.onSwitchSite(event.target.value)}
        className="h-8 max-w-52 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {props.sites.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
        {props.sites.some((option) => option.id === props.site.id) ? null : (
          <option value={props.site.id}>{props.site.title}</option>
        )}
      </select>
      <Link
        href={workspacePath("/websites")}
        className="hidden rounded-md px-1.5 py-1 text-[11px] font-medium text-text-muted hover:text-text lg:inline"
      >
        All websites
      </Link>
    </div>
  );
}

interface EditorActionsProps {
  readonly canWrite: boolean;
  readonly toolbar: StudioEditorToolbar | null;
  readonly isAppearanceOpen: boolean;
  readonly siteId: string;
  readonly pageId: string;
}

function EditorActions(props: EditorActionsProps) {
  if (props.isAppearanceOpen) {
    return null;
  }
  return (
    <>
      {props.toolbar === null ? null : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!props.canWrite}
          onClick={props.toolbar.onAddSection}
          className="h-8 gap-1.5 text-xs"
        >
          <LayersIcon size={14} />
          Add section
        </Button>
      )}
      <Link
        href={studioPreviewPath(props.siteId, props.pageId)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-text hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <EyeIcon size={14} />
        Preview
      </Link>
    </>
  );
}

interface TopBarActionsProps {
  readonly props: StudioTopBarProps;
  readonly canSaveNow: boolean;
}

function TopBarActions({ props, canSaveNow }: TopBarActionsProps) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-2">
      {props.isAppearanceOpen ? null : (
        <DeviceSwitch device={props.device} onDeviceChange={props.onDeviceChange} />
      )}
      {props.toolbar === null || props.isAppearanceOpen ? null : (
        <AutosaveIndicator
          status={props.toolbar.status}
          revision={props.toolbar.revision}
          error={props.toolbar.error}
          canSaveNow={canSaveNow}
          onSaveNow={props.toolbar.onSaveNow}
        />
      )}
      <EditorActions
        canWrite={props.canWrite}
        toolbar={props.toolbar}
        isAppearanceOpen={props.isAppearanceOpen}
        siteId={props.site.id}
        pageId={props.activePage.id}
      />
      {props.canManageAppearance ? (
        <Button
          type="button"
          size="sm"
          variant={props.isAppearanceOpen ? "default" : "outline"}
          aria-pressed={props.isAppearanceOpen}
          onClick={props.onToggleAppearance}
          className="h-8 text-xs"
        >
          {props.isAppearanceOpen ? "Back to editor" : "Appearance"}
        </Button>
      ) : null}
      <Link
        href={studioReviewPath(props.site.id)}
        className="inline-flex h-8 items-center rounded-md bg-action px-3 text-xs font-semibold text-on-action hover:bg-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Review &amp; publish
      </Link>
    </div>
  );
}

/** The one studio top bar: context, device, save state, appearance, preview, review (FR-101). */
export function StudioTopBar(props: StudioTopBarProps) {
  const canSaveNow =
    props.canWrite &&
    props.toolbar !== null &&
    SAVEABLE_STATUSES.has(props.toolbar.status);
  return (
    <header
      data-studio-topbar="true"
      className="flex h-14 shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-3"
    >
      <Link
        href={workspacePath("/websites")}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <ArrowLeftIcon size={14} />
        Exit studio
      </Link>
      <span className="h-4 w-px bg-border" />
      <SiteSwitcher site={props.site} sites={props.sites} onSwitchSite={props.onSwitchSite} />
      <Badge variant="tertiary" className="text-[10px]">
        {props.site.status}
      </Badge>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-text">{props.activePage.title}</p>
        <p className="truncate font-mono text-[10px] text-text-muted">{props.activePage.path}</p>
      </div>
      <TopBarActions props={props} canSaveNow={canSaveNow} />
    </header>
  );
}
