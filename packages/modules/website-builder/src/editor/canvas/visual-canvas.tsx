import React from "react";
import { Button } from "@suite/ui";
import { PlusIcon } from "@suite/ui/icons";
import type {
  MediaAssetMap,
  PageAst,
  SectionAst,
  SectionStyleTokens,
} from "../../ast/types.js";
import { renderBlockComponent } from "../../render/section-renderer.js";
import { CanvasBlockWrapper } from "./canvas-block-wrapper.js";
import { ViewportToolbar, VIEWPORT_CONFIGS } from "./viewport-toolbar.js";
import {
  isBlockSelected,
  isSectionSelected,
  NO_SELECTION,
  selectBlock,
  selectSection,
  type CanvasSelection,
  type VisualCanvasProps,
} from "./types.js";

const MAX_WIDTH_CLASSES = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
} as const satisfies Record<NonNullable<SectionStyleTokens["maxWidth"]>, string>;

const SECTION_OUTLINE_CLASSES = {
  selected: "outline outline-2 outline-focus-ring outline-offset-[-2px]",
  resting: "",
} as const satisfies Record<"selected" | "resting", string>;

function maxWidthClass(section: SectionAst): string {
  const width = section.styles?.maxWidth;
  return width === undefined ? MAX_WIDTH_CLASSES.full : MAX_WIDTH_CLASSES[width];
}

function sectionStyle(section: SectionAst): React.CSSProperties {
  const styles = section.styles;
  return {
    backgroundColor: styles?.backgroundColor,
    backgroundImage: styles?.backgroundImageUrl === undefined ? undefined : "url(" + styles.backgroundImageUrl + ")",
    backgroundRepeat: styles?.backgroundRepeat,
    backgroundSize: styles?.backgroundSize,
    paddingTop: styles?.paddingTop === undefined ? undefined : styles.paddingTop + "px",
    paddingBottom: styles?.paddingBottom === undefined ? undefined : styles.paddingBottom + "px",
  };
}

function pageStyle(ast: PageAst): React.CSSProperties {
  return {
    fontFamily: ast.globalStyles?.fontFamily,
    backgroundColor: ast.globalStyles?.backgroundColor,
    color: ast.globalStyles?.textColor,
  };
}

function CanvasEmptyState(props: { readonly onOpenCatalog: () => void }) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-semibold text-text">This page is blank</p>
      <p className="max-w-sm text-xs text-text-muted">
        Add a section from your workspace catalog to start building the page.
      </p>
      <Button type="button" size="sm" onClick={props.onOpenCatalog} className="gap-1.5">
        <PlusIcon size={14} />
        Add a section
      </Button>
    </div>
  );
}

function SectionView(props: {
  readonly section: SectionAst;
  readonly selection: CanvasSelection;
  readonly readOnly: boolean;
  readonly onSelect: (selection: CanvasSelection) => void;
  readonly onHoverBlock: (blockId: string | null) => void;
  readonly hoveredBlockId: string | null;
  readonly media: MediaAssetMap | undefined;
}) {
  const { section, selection } = props;
  const selected = isSectionSelected(selection, section.id);
  const selectThisSection = () => props.onSelect(selectSection(section.id));
  return (
    <section
      role="region"
      tabIndex={props.readOnly ? -1 : 0}
      aria-label={"Section " + (section.name ?? section.id)}
      aria-current={selected ? "true" : undefined}
      data-canvas-section-id={section.id}
      style={sectionStyle(section)}
      className={"relative w-full transition-shadow focus-visible:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring " + SECTION_OUTLINE_CLASSES[selected ? "selected" : "resting"]}
      onClick={(event) => {
        event.stopPropagation();
        selectThisSection();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectThisSection();
        }
      }}
    >
      {section.styles?.backgroundOverlayColor === undefined ? null : (
        <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: section.styles.backgroundOverlayColor }} />
      )}
      <div className={"relative mx-auto w-full " + maxWidthClass(section)}>
        {section.blocks.map((block) => (
          <CanvasBlockWrapper
            key={block.id}
            blockId={block.id}
            blockType={block.type}
            isSelected={isBlockSelected(selection, block.id)}
            isHovered={props.hoveredBlockId === block.id}
            readOnly={props.readOnly}
            onSelect={(blockId) => props.onSelect(selectBlock(section.id, blockId))}
            onHover={props.onHoverBlock}
          >
            {renderBlockComponent(block, { isEditor: true, media: props.media })}
          </CanvasBlockWrapper>
        ))}
      </div>
    </section>
  );
}

/**
 * Renders the production AST inside a device frame. Selection is a controlled
 * discriminated union; nothing is stored locally, so the studio owns history.
 */
export function VisualCanvas(props: VisualCanvasProps) {
  const [hoveredBlockId, setHoveredBlockId] = React.useState<string | null>(null);
  const viewport = VIEWPORT_CONFIGS[props.device];
  const clearSelection = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      props.onSelect(NO_SELECTION);
    }
  };
  return (
    <div role="region" aria-label="Canvas" className="flex h-full min-w-0 flex-1 flex-col bg-surface-sunken">
      <ViewportToolbar
        device={props.device}
        zoom={props.zoom}
        onDeviceChange={props.onDeviceChange}
        onZoomChange={props.onZoomChange}
      />
      <div className="relative flex-1 overflow-auto p-6" onClick={clearSelection} data-canvas-workspace="true">
        <div
          data-viewport-device={props.device}
          data-viewport-width={viewport.width}
          style={{ width: viewport.width + "px", transform: "scale(" + props.zoom + ")" }}
          className="mx-auto my-4 flex min-h-[600px] origin-top flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-1.5 font-mono text-[11px] text-text-muted">
            <span>{viewport.label}</span>
            <span>Scale: {Math.round(props.zoom * 100)}%</span>
          </div>
          <main style={pageStyle(props.ast)} className="flex min-h-full w-full flex-1 flex-col">
            {props.ast.sections.length === 0 ? (
              <CanvasEmptyState onOpenCatalog={props.onOpenCatalog} />
            ) : (
              props.ast.sections.map((section) => (
                <SectionView
                  key={section.id}
                  section={section}
                  selection={props.selection}
                  readOnly={props.readOnly}
                  onSelect={props.onSelect}
                  onHoverBlock={setHoveredBlockId}
                  hoveredBlockId={hoveredBlockId}
                  media={props.media}
                />
              ))
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
