import React from "react";
import type { BlockAst } from "../../ast/types.js";
import { renderBlockComponent } from "../../render/section-renderer.js";

export interface CanvasBlockWrapperProps {
  block: BlockAst;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (blockId: string, block: BlockAst) => void;
  onHover: (blockId: string | null) => void;
}

export function CanvasBlockWrapper({
  block,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: CanvasBlockWrapperProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(block.id, block);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    e.stopPropagation();
    onHover(block.id);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onHover(null);
  };

  // State-driven outline styles
  const outlineClass = isSelected
    ? "ring-2 ring-blue-600 ring-offset-1 shadow-sm"
    : isHovered
    ? "ring-1 ring-blue-400 ring-offset-1"
    : "ring-0";

  return (
    <div
      role="region"
      aria-label={`Block ${block.type} (${block.id})`}
      data-canvas-block-id={block.id}
      data-canvas-block-type={block.type}
      data-selected={isSelected ? "true" : undefined}
      data-hovered={isHovered ? "true" : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative group transition-all duration-150 cursor-pointer ${outlineClass}`}
    >
      {/* Selection / Hover Indicator Badge */}
      {(isSelected || isHovered) && (
        <div
          className={`absolute -top-6 left-2 z-30 px-2 py-0.5 text-[11px] font-medium font-mono uppercase tracking-wider rounded-t shadow-sm pointer-events-none ${
            isSelected
              ? "bg-blue-600 text-white"
              : "bg-blue-100 text-blue-800 border border-blue-300"
          }`}
        >
          {block.type}
        </div>
      )}

      {/* Render the inner block component */}
      {renderBlockComponent(block, true)}
    </div>
  );
}
