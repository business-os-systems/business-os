"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@suite/ui";
import {
  createMediaApiClient,
  type MediaAssetView,
} from "@suite/media/react";
import {
  AddSectionDrawer,
  BlockPropertyInspector,
  CasConflictDialog,
  createOfflineDraftStorage,
  NO_SELECTION,
  selectedBlockId,
  selectedSectionId,
  useEditorAutosave,
  VisualCanvas,
  type AutosaveStatus,
  type MediaPickerControls,
  type PageContentSnapshot,
} from "@suite/website-builder/editor";
import type {
  BlockAst,
  MediaAssetMap,
  PageAst,
  SectionAst,
} from "@suite/website-builder/ast";
import { createDraftTransport } from "@/lib/api/cms-editor-client";
import { AutosaveIndicator } from "./autosave-indicator";
import { StudioSiteLinks } from "./studio-site-links";
import type { StudioEditorProps } from "./studio-editor-props";
import {
  useAstMutations,
  useCanvasViewState,
  type AstMutations,
  type CanvasViewState,
} from "./use-studio-editor-state";
import { useCatalogSections } from "./use-catalog-sections";

const SAVEABLE_STATUSES: ReadonlySet<AutosaveStatus> = new Set(["dirty", "offline", "error"]);

interface SessionProps extends StudioEditorProps {
  readonly content: PageContentSnapshot;
}

interface TopBarProps {
  readonly page: StudioEditorProps["page"];
  readonly status: AutosaveStatus;
  readonly revision: number;
  readonly error: string | null;
  readonly canWrite: boolean;
  readonly onSaveNow: () => void;
  readonly onOpenDrawer: () => void;
}

function EditorTopBar(props: TopBarProps) {
  const canSaveNow = props.canWrite && SAVEABLE_STATUSES.has(props.status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-text">{props.page.title}</p>
        <p className="truncate font-mono text-[10px] text-text-muted">{props.page.path}</p>
      </div>
      <div className="flex items-center gap-3">
        <AutosaveIndicator
          status={props.status}
          revision={props.revision}
          error={props.error}
          canSaveNow={canSaveNow}
          onSaveNow={props.onSaveNow}
        />
        <Button type="button" size="sm" disabled={!props.canWrite} onClick={props.onOpenDrawer}>
          Add section
        </Button>
      </div>
    </div>
  );
}

interface CanvasPaneProps extends TopBarProps {
  readonly ast: PageAst;
  readonly view: CanvasViewState;
  readonly media: MediaAssetMap;
}

function EditorCanvasPane(props: CanvasPaneProps) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <EditorTopBar {...props} />
      <VisualCanvas
        ast={props.ast}
        device={props.view.device}
        zoom={props.view.zoom}
        selection={props.view.selection}
        readOnly={!props.canWrite}
        onSelect={props.view.setSelection}
        onDeviceChange={props.view.setDevice}
        onZoomChange={props.view.setZoom}
        onOpenCatalog={props.view.openDrawer}
        media={props.media}
      />
    </main>
  );
}

interface InspectorRailProps {
  readonly block: BlockAst | null;
  readonly section: SectionAst | null;
  readonly canWrite: boolean;
  readonly media: MediaPickerControls;
  readonly mutations: AstMutations;
  readonly siteId: string;
}

function EditorInspectorRail(props: InspectorRailProps) {
  return (
    <BlockPropertyInspector
      block={props.block}
      section={props.section}
      canWrite={props.canWrite}
      media={props.media}
      onChangeBlockProps={props.mutations.changeBlockProps}
      onMoveBlock={props.mutations.moveBlockById}
      onDuplicateBlock={props.mutations.duplicateActiveBlock}
      onDeleteBlock={props.mutations.deleteActiveBlock}
      onMoveSection={props.mutations.moveSectionById}
      onDuplicateSection={props.mutations.duplicateActiveSection}
      onDeleteSection={props.mutations.deleteSectionById}
      footer={<StudioSiteLinks siteId={props.siteId} />}
    />
  );
}

interface OverlaysProps {
  readonly view: CanvasViewState;
  readonly catalog: ReturnType<typeof useCatalogSections>;
  readonly mutations: AstMutations;
  readonly autosave: ReturnType<typeof useEditorAutosave>;
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly timeZone: string;
  readonly locale: string;
}

function EditorOverlays(props: OverlaysProps) {
  return (
    <>
      <AddSectionDrawer
        isOpen={props.view.isDrawerOpen}
        catalog={props.catalog.state}
        onClose={props.view.closeDrawer}
        onRetry={() => void props.catalog.reload()}
        onInsert={props.mutations.insertCatalog}
      />
      <CasConflictDialog
        conflict={props.autosave.state.conflict}
        currentUserId={props.currentUserId}
        currentUserName={props.currentUserName}
        timeZone={props.timeZone}
        locale={props.locale}
        onKeepMine={() => void props.autosave.resolveKeepMine()}
        onKeepTheirs={props.autosave.resolveKeepTheirs}
      />
    </>
  );
}

function mergeResolvedAsset(
  assets: MediaAssetMap,
  asset: MediaAssetView
): MediaAssetMap {
  return {
    ...assets,
    [asset.id]: {
      assetId: asset.id,
      url: asset.url,
      fileName: asset.fileName,
      width: asset.width,
      height: asset.height,
    },
  };
}

/**
 * The initial snapshot and every later adopted snapshot contribute resolved
 * URLs, so a conflict resolved by keeping the server draft keeps rendering
 * assets the first load never saw (FR-051, FR-120).
 */
function mergeResolvedAssets(
  content: PageContentSnapshot,
  adopted: MediaAssetMap
): MediaAssetMap {
  return { ...content.media, ...adopted };
}

function useStudioMedia(
  content: PageContentSnapshot,
  adopted: MediaAssetMap,
  userPermissions: readonly string[]
): { readonly assets: MediaAssetMap; readonly controls: MediaPickerControls } {
  const [assets, setAssets] = useState<MediaAssetMap>(() =>
    mergeResolvedAssets(content, adopted)
  );
  const client = useMemo(() => createMediaApiClient(), []);

  useEffect(() => {
    setAssets(mergeResolvedAssets(content, adopted));
  }, [content, adopted]);

  const controls = useMemo<MediaPickerControls>(
    () => ({
      client,
      userPermissions,
      assets,
      onAssetSelected: (asset) =>
        setAssets((previous) => mergeResolvedAsset(previous, asset)),
    }),
    [client, userPermissions, assets]
  );
  return { assets, controls };
}

function useStudioEditorState(props: SessionProps) {
  const autosave = useEditorAutosave({
    pageId: props.page.id,
    organizationId: props.site.organizationId,
    initial: props.content,
    transport: useMemo(() => createDraftTransport(props.page.id), [props.page.id]),
    storage: useMemo(
      () => createOfflineDraftStorage(window.localStorage, props.site.organizationId),
      [props.site.organizationId]
    ),
    authorName: props.currentUserName,
  });
  const catalog = useCatalogSections();
  const view = useCanvasViewState();
  const ast = autosave.state.ast;
  const section =
    ast.sections.find((entry) => entry.id === selectedSectionId(view.selection)) ?? null;
  const block =
    section === null
      ? null
      : section.blocks.find((entry) => entry.id === selectedBlockId(view.selection)) ?? null;
  const mutations = useAstMutations({
    ast,
    section,
    block,
    updateAst: autosave.updateAst,
    clearSelection: () => view.setSelection(NO_SELECTION),
    closeDrawer: view.closeDrawer,
  });
  return { autosave, catalog, view, ast, section, block, mutations };
}

export function StudioEditorSession(props: SessionProps) {
  const state = useStudioEditorState(props);
  const media = useStudioMedia(
    props.content,
    state.autosave.state.media,
    props.userPermissions
  );
  return (
    <>
      <EditorCanvasPane
        page={props.page}
        ast={state.ast}
        view={state.view}
        status={state.autosave.state.status}
        revision={state.autosave.state.revision}
        error={state.autosave.state.error}
        canWrite={props.canWrite}
        onSaveNow={() => void state.autosave.flushSave()}
        onOpenDrawer={state.view.openDrawer}
        media={media.assets}
      />
      <EditorInspectorRail
        block={state.block}
        section={state.section}
        canWrite={props.canWrite}
        media={media.controls}
        mutations={state.mutations}
        siteId={props.site.id}
      />
      <EditorOverlays
        view={state.view}
        catalog={state.catalog}
        mutations={state.mutations}
        autosave={state.autosave}
        currentUserId={props.currentUserId}
        currentUserName={props.currentUserName}
        timeZone={props.site.timezone}
        locale={props.site.primaryLocale}
      />
    </>
  );
}
