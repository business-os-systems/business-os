import React from "react";
import { Badge, Button } from "@suite/ui";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  LayersIcon,
  PlusIcon,
  TrashIcon,
} from "@suite/ui/icons";
import { renderBlockPropertiesForm } from "./block-forms.js";
import type { BlockPropertyInspectorProps, MoveDirection } from "./types.js";

const ACTION_BUTTON_CLASS = "h-7 gap-1 px-2 text-[11px]";

function InspectorEmpty(props: { readonly section: BlockPropertyInspectorProps["section"] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <LayersIcon size={20} className="text-text-disabled" />
      <p className="text-xs font-semibold text-text">No block selected</p>
      <p className="max-w-[220px] text-[11px] text-text-muted">
        Select a block or section on the canvas to edit its content and structure.
      </p>
      {props.section === null ? null : (
        <p className="mt-2 w-full border-t border-border pt-3 text-left text-[11px] text-text-secondary">
          Active section: <span className="font-mono text-text">{props.section.name ?? props.section.id}</span>
        </p>
      )}
    </div>
  );
}

function SectionActions(props: {
  readonly section: NonNullable<BlockPropertyInspectorProps["section"]>;
  readonly canWrite: boolean;
  readonly onMove: (direction: MoveDirection) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Section actions">
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={() => props.onMove("up")} aria-label="Move section up">
        <ChevronUpIcon size={12} /> Up
      </Button>
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={() => props.onMove("down")} aria-label="Move section down">
        <ChevronDownIcon size={12} /> Down
      </Button>
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={props.onDuplicate} aria-label="Duplicate section">
        <CopyIcon size={12} /> Duplicate
      </Button>
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={props.onDelete} aria-label="Delete section">
        <TrashIcon size={12} /> Delete
      </Button>
    </div>
  );
}

function BlockActions(props: {
  readonly blockId: string;
  readonly blockType: string;
  readonly canWrite: boolean;
  readonly onMove: (direction: MoveDirection) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Block actions">
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={() => props.onMove("up")} aria-label={"Move " + props.blockType + " block up"}>
        <ChevronUpIcon size={12} /> Up
      </Button>
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={() => props.onMove("down")} aria-label={"Move " + props.blockType + " block down"}>
        <ChevronDownIcon size={12} /> Down
      </Button>
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={props.onDuplicate} aria-label={"Duplicate " + props.blockType + " block"}>
        <CopyIcon size={12} /> Duplicate
      </Button>
      <Button type="button" size="sm" variant="outline" className={ACTION_BUTTON_CLASS} disabled={!props.canWrite} onClick={props.onDelete} aria-label={"Delete " + props.blockType + " block"}>
        <TrashIcon size={12} /> Delete
      </Button>
    </div>
  );
}

/** Block inspector: schema-driven content form plus structural actions (FR-022, FR-024). */
export function BlockPropertyInspector(props: BlockPropertyInspectorProps) {
  const { block, section } = props;
  return (
    <aside
      role="region"
      aria-label="Inspector"
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Inspector</h2>
        {block === null ? null : <Badge variant="tertiary" className="text-[10px] uppercase">{block.type}</Badge>}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {section === null ? null : (
          <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Section</p>
            <p className="truncate font-mono text-[11px] text-text">{section.name ?? section.id}</p>
            <SectionActions
              section={section}
              canWrite={props.canWrite}
              onMove={(direction) => props.onMoveSection(section.id, direction)}
              onDuplicate={() => props.onDuplicateSection(section.id)}
              onDelete={() => props.onDeleteSection(section.id)}
            />
          </div>
        )}
        {block === null ? (
          <InspectorEmpty section={section} />
        ) : (
          <>
            <BlockActions
              blockId={block.id}
              blockType={block.type}
              canWrite={props.canWrite}
              onMove={(direction) => props.onMoveBlock(block.id, direction)}
              onDuplicate={() => props.onDuplicateBlock(block.id)}
              onDelete={() => props.onDeleteBlock(block.id)}
            />
            <div className="rounded-lg border border-border p-3">
              {renderBlockPropertiesForm(block, props.media, (props2) => props.onChangeBlockProps(block.id, props2))}
            </div>
          </>
        )}
      </div>
      <div className="border-t border-border p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-text-muted">
          <PlusIcon size={12} /> Use the add-section drawer to insert catalog content.
        </p>
        {props.footer}
      </div>
    </aside>
  );
}
