"use client";

import React, { useState } from "react";
import { hasPermission, PERMISSIONS } from "@suite/core";
import {
  PageTree,
  type PageReorderDirection,
  type PageTreeCreateInput,
  type PageTreeRenameInput,
  type ViewportDevice,
} from "@suite/website-builder/editor";
import type { CmsPageDto, CmsSiteDto } from "@/lib/api/site-client";
import { AppearanceEditor } from "./appearance-editor";
import { StudioEditor } from "./studio-editor";
import type { StudioEditorToolbar } from "./studio-editor-props";
import { StudioTopBar } from "./studio-topbar";

export interface StudioShellProps {
  readonly site: CmsSiteDto;
  readonly sites: readonly CmsSiteDto[];
  readonly pages: readonly CmsPageDto[];
  readonly activePage: CmsPageDto;
  readonly canWrite: boolean;
  readonly userPermissions: readonly string[];
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly onSelectPage: (pageId: string) => void;
  readonly onCreatePage: (input: PageTreeCreateInput) => Promise<void>;
  readonly onRenamePage: (input: PageTreeRenameInput) => Promise<void>;
  readonly onReorderPage: (
    pageId: string,
    direction: PageReorderDirection,
    expectedRevision: number
  ) => Promise<void>;
  readonly onDuplicatePage: (pageId: string) => Promise<void>;
  readonly onArchivePage: (pageId: string, expectedRevision: number) => Promise<void>;
  readonly onSwitchSite: (siteId: string) => void;
}

interface StudioBodyProps extends StudioShellProps {
  readonly device: ViewportDevice;
  readonly zoom: number;
  readonly toolbar: StudioEditorToolbar | null;
  readonly isAppearanceOpen: boolean;
  readonly canManageAppearance: boolean;
  readonly onDeviceChange: (device: ViewportDevice) => void;
  readonly onZoomChange: (zoom: number) => void;
  readonly onToolbarChange: (toolbar: StudioEditorToolbar) => void;
  readonly onToggleAppearance: () => void;
}

function StudioBody(props: StudioBodyProps) {
  const sites = props.sites.length === 0 ? [props.site] : props.sites;
  return (
    <div data-app="website-builder" className="flex h-screen flex-col overflow-hidden bg-background text-text">
      <StudioTopBar
        site={props.site}
        sites={sites}
        activePage={props.activePage}
        canWrite={props.canWrite}
        canManageAppearance={props.canManageAppearance}
        toolbar={props.toolbar}
        device={props.device}
        zoom={props.zoom}
        onDeviceChange={props.onDeviceChange}
        onZoomChange={props.onZoomChange}
        isAppearanceOpen={props.isAppearanceOpen}
        onToggleAppearance={props.onToggleAppearance}
        onSwitchSite={props.onSwitchSite}
      />
      <div className="flex min-h-0 flex-1">
        <PageTree
          pages={props.pages}
          activePageId={props.activePage.id}
          canWrite={props.canWrite}
          onSelectPage={props.onSelectPage}
          onCreatePage={props.onCreatePage}
          onRenamePage={props.onRenamePage}
          onReorderPage={props.onReorderPage}
          onDuplicatePage={props.onDuplicatePage}
          onArchivePage={props.onArchivePage}
        />
        <div className={props.isAppearanceOpen ? "hidden" : "flex min-w-0 flex-1"}>
          <StudioEditor
            site={props.site}
            page={props.activePage}
            canWrite={props.canWrite}
            userPermissions={props.userPermissions}
            currentUserId={props.currentUserId}
            currentUserName={props.currentUserName}
            device={props.device}
            zoom={props.zoom}
            onDeviceChange={props.onDeviceChange}
            onZoomChange={props.onZoomChange}
            onToolbarChange={props.onToolbarChange}
          />
        </div>
        {props.isAppearanceOpen ? (
          <AppearanceEditor siteId={props.site.id} permissions={props.userPermissions} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The three-region studio shell: page tree, editing canvas and inspector,
 * under one top bar. Appearance renders in the studio body instead of a
 * separate full-screen route, so leaving it never loses the page context
 * (FR-082, FR-101, FR-151).
 */
export function StudioShell(props: StudioShellProps) {
  const [device, setDevice] = useState<ViewportDevice>("desktop");
  const [zoom, setZoom] = useState(1);
  const [toolbar, setToolbar] = useState<StudioEditorToolbar | null>(null);
  const [appearancePageId, setAppearancePageId] = useState<string | null>(null);
  const isAppearanceOpen = appearancePageId === props.activePage.id;
  const canManageAppearance = hasPermission(
    props.userPermissions,
    PERMISSIONS.WEBSITE_BUILDER.THEME_MANAGE
  );
  const toggleAppearance = () => {
    setAppearancePageId(isAppearanceOpen ? null : props.activePage.id);
  };
  return (
    <StudioBody
      {...props}
      device={device}
      zoom={zoom}
      toolbar={toolbar}
      isAppearanceOpen={isAppearanceOpen}
      canManageAppearance={canManageAppearance}
      onDeviceChange={setDevice}
      onZoomChange={setZoom}
      onToolbarChange={setToolbar}
      onToggleAppearance={toggleAppearance}
    />
  );
}
