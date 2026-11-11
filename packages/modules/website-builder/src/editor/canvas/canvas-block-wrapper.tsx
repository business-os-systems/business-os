import React from "react";
import type { BlockType } from "../../ast/types.js";

type BlockOutlineState = "selected" | "hovered" | "resting";

const BLOCK_OUTLINE_CLASSES = {
  selected: "ring-2 ring-focus-ring ring-offset-1 shadow-sm",
  hovered: "ring-1 ring-border-strong ring-offset-1",
  resting: "ring-0",
} as const satisfies Record<BlockOutlineState, string>;

const BLOCK_BADGE_CLASSES = {
  selected: "bg-action text-on-action",
  hovered: "bg-action-tint text-action border border-border",
} as const satisfies Record<"selected" | "hovered", string>;

function outlineState(isSelected: boolean, isHovered: boolean): BlockOutlineState {
  if (isSelected) {
    return "selected";
  }
  return isHovered ? "hovered" : "resting";
}

export interface CanvasBlockWrapperProps {
  readonly blockId: string;
  readonly blockType: BlockType;
  readonly isSelected: boolean;
  readonly isHovered: boolean;
  readonly readOnly: boolean;
  readonly onSelect: (blockId: string) => void;
  readonly onHover: (blockId: string | null) => void;
  readonly children: React.ReactNode;
}

function handleBlockKeyDown(
  event: React.KeyboardEvent,
  onSelect: () => void
): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

/**
 * Selection shell around one production block. The visual outline is paired
 * with `aria-current` and keyboard activation so selection is not pointer-only.
 */
export function CanvasBlockWrapper(props: CanvasBlockWrapperProps) {
  const state = outlineState(props.isSelected, props.isHovered);
  const badgeVisible = props.isSelected || props.isHovered;
  return (
    <div
      role="group"
      tabIndex={props.readOnly ? -1 : 0}
      aria-label={"Select " + props.blockType + " block"}
      aria-current={props.isSelected ? "true" : undefined}
      data-canvas-block-id={props.blockId}
      data-canvas-block-type={props.blockType}
      data-selected={props.isSelected ? "true" : undefined}
      data-hovered={props.isHovered ? "true" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(props.blockId);
      }}
      onKeyDown={(event) => handleBlockKeyDown(event, () => props.onSelect(props.blockId))}
      onMouseEnter={() => props.onHover(props.blockId)}
      onMouseLeave={() => props.onHover(null)}
      className={"group relative rounded-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " + BLOCK_OUTLINE_CLASSES[state]}
    >
      {badgeVisible ? (
        <span
          className={
            "pointer-events-none absolute -top-6 left-2 z-30 rounded-t px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider shadow-sm " +
            BLOCK_BADGE_CLASSES[props.isSelected ? "selected" : "hovered"]
          }
        >
          {props.blockType}
        </span>
      ) : null}
      {props.children}
    </div>
  );
}
