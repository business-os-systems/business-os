import React, { useState } from "react";
import type { SectionAst, BlockAst } from "../../ast/types.js";
import { ViewportToolbar, VIEWPORT_CONFIGS } from "./viewport-toolbar.js";
import { CanvasBlockWrapper } from "./canvas-block-wrapper.js";
import type {
  ViewportDevice,
  CanvasSelectionState,
  VisualCanvasProps,
} from "./types.js";

const MAX_WIDTH_CLASS_MAP: Record<NonNullable<SectionAst["styles"]>["maxWidth"] & string, string> = {
  sm: "max-w-screen-sm",
  md: "max-w-screen-md",
  lg: "max-w-screen-lg",
  xl: "max-w-screen-xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

export function VisualCanvas({
  ast,
  device: controlledDevice,
  zoom: controlledZoom,
  selection: controlledSelection,
  onSelectBlock,
  onHoverBlock,
  onSelectSection,
  onDeviceChange,
  onZoomChange,
  className = "",
  readOnly = false,
}: VisualCanvasProps) {
  // Support both controlled and uncontrolled states
  const [internalDevice, setInternalDevice] = useState<ViewportDevice>("desktop");
  const [internalZoom, setInternalZoom] = useState<number>(1.0);
  const [internalSelection, setInternalSelection] = useState<CanvasSelectionState>({
    selectedBlockId: null,
    hoveredBlockId: null,
    selectedSectionId: null,
  });

  const device = controlledDevice ?? internalDevice;
  const zoom = controlledZoom ?? internalZoom;
  const selection = controlledSelection ?? internalSelection;

  const handleDeviceChange = (newDevice: ViewportDevice) => {
    setInternalDevice(newDevice);
    onDeviceChange?.(newDevice);
  };

  const handleZoomChange = (newZoom: number) => {
    setInternalZoom(newZoom);
    onZoomChange?.(newZoom);
  };

  const handleBlockSelect = (blockId: string, block: BlockAst) => {
    if (readOnly) return;
    setInternalSelection((prev) => ({
      ...prev,
      selectedBlockId: blockId,
    }));
    onSelectBlock?.(blockId, block);
  };

  const handleBlockHover = (blockId: string | null) => {
    if (readOnly) return;
    setInternalSelection((prev) => ({
      ...prev,
      hoveredBlockId: blockId,
    }));
    onHoverBlock?.(blockId);
  };

  const handleSectionSelect = (sectionId: string, section: SectionAst) => {
    if (readOnly) return;
    setInternalSelection((prev) => ({
      ...prev,
      selectedSectionId: sectionId,
    }));
    onSelectSection?.(sectionId, section);
  };

  const handleCanvasBackdropClick = () => {
    if (readOnly) return;
    setInternalSelection({
      selectedBlockId: null,
      hoveredBlockId: null,
      selectedSectionId: null,
    });
    onSelectBlock?.(null);
    onSelectSection?.(null);
  };

  const viewportWidth = VIEWPORT_CONFIGS[device].width;

  const globalStyle: React.CSSProperties = {
    fontFamily: ast.globalStyles?.fontFamily,
    backgroundColor: ast.globalStyles?.backgroundColor || "#ffffff",
    color: ast.globalStyles?.textColor,
  };

  return (
    <div className={`flex flex-col h-full w-full bg-slate-100 ${className}`}>
      {/* Top Toolbar */}
      <ViewportToolbar
        device={device}
        zoom={zoom}
        onDeviceChange={handleDeviceChange}
        onZoomChange={handleZoomChange}
      />

      {/* Outer Pan / Canvas Scroll Area */}
      <div
        className="flex-1 overflow-auto p-8 flex items-start justify-center relative cursor-default"
        onClick={handleCanvasBackdropClick}
        data-canvas-workspace="true"
      >
        {/* Scaled Viewport Container */}
        <div
          data-viewport-device={device}
          data-viewport-width={viewportWidth}
          style={{
            width: `${viewportWidth}px`,
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            transition: "width 0.25s ease-in-out, transform 0.15s ease-out",
          }}
          className="bg-white shadow-2xl rounded-lg overflow-hidden border border-slate-300 min-h-[600px] flex flex-col my-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Simulation Header Bar */}
          <div className="bg-slate-800 text-slate-300 text-[11px] font-mono px-3 py-1.5 flex items-center justify-between select-none border-b border-slate-700">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block"></span>
              {VIEWPORT_CONFIGS[device].label}
            </span>
            <span className="text-slate-400">Scale: {Math.round(zoom * 100)}%</span>
          </div>

          {/* AST Rendered Content inside simulated frame */}
          <main style={globalStyle} className="min-h-full w-full flex flex-col flex-1">
            {ast.sections.map((section) => {
              const isSectionSelected = selection.selectedSectionId === section.id;
              const maxWidthClass =
                (section.styles?.maxWidth && MAX_WIDTH_CLASS_MAP[section.styles.maxWidth]) ||
                "max-w-full";

              const sectionStyle: React.CSSProperties = {
                backgroundColor: section.styles?.backgroundColor,
                backgroundImage: section.styles?.backgroundImageUrl
                  ? `url(${section.styles.backgroundImageUrl})`
                  : undefined,
                backgroundRepeat: section.styles?.backgroundRepeat || "no-repeat",
                backgroundSize: section.styles?.backgroundSize || "cover",
                paddingTop:
                  section.styles?.paddingTop !== undefined
                    ? `${section.styles.paddingTop}px`
                    : undefined,
                paddingBottom:
                  section.styles?.paddingBottom !== undefined
                    ? `${section.styles.paddingBottom}px`
                    : undefined,
              };

              return (
                <section
                  key={section.id}
                  id={section.id}
                  data-canvas-section-id={section.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSectionSelect(section.id, section);
                  }}
                  style={sectionStyle}
                  className={`relative w-full transition-all duration-150 ${
                    isSectionSelected ? "outline-2 outline-indigo-500 outline-offset-[-2px]" : ""
                  } ${section.styles?.customClassName || ""}`}
                >
                  {section.styles?.backgroundOverlayColor ? (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ backgroundColor: section.styles.backgroundOverlayColor }}
                    />
                  ) : null}

                  <div className={`relative mx-auto w-full ${maxWidthClass}`}>
                    {section.blocks.map((block) => (
                      <CanvasBlockWrapper
                        key={block.id}
                        block={block}
                        isSelected={selection.selectedBlockId === block.id}
                        isHovered={selection.hoveredBlockId === block.id}
                        onSelect={handleBlockSelect}
                        onHover={handleBlockHover}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </main>
        </div>
      </div>
    </div>
  );
}
