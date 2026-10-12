import React from "react";
import { Button, Badge } from "@suite/ui";
import {
  ChevronUpIcon,
  ChevronDownIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  LayersIcon,
} from "@suite/ui/icons";
import type { BlockTreeSidebarProps } from "./types.js";

export function BlockTreeSidebar({
  sections,
  selectedSectionId,
  selectedBlockId,
  onSelectSection,
  onSelectBlock,
  onMoveSection,
  onDeleteSection,
  onToggleSectionVisibility,
  onOpenAddDrawer,
  className = "",
}: BlockTreeSidebarProps) {
  return (
    <aside
      aria-label="Page layers and sections tree"
      className={`w-72 border-r border-slate-200 bg-white flex flex-col h-full select-none ${className}`}
    >
      {/* Sidebar Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2 text-slate-800">
          <LayersIcon size={16} />
          <h3 className="text-xs font-bold uppercase tracking-wider">Page Layers</h3>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onOpenAddDrawer()}
          className="h-7 px-2 text-xs flex items-center gap-1"
          aria-label="Add Section"
        >
          <PlusIcon size={14} />
          <span>Add</span>
        </Button>
      </div>

      {/* Sections Tree List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {sections.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs">
            No sections on page. Click Add to insert a new section.
          </div>
        ) : (
          sections.map((section, index) => {
            const isSectionSelected = selectedSectionId === section.id;
            const isHidden = !!section.visibility?.hideOnDesktop;

            return (
              <div
                key={section.id}
                data-layer-section-id={section.id}
                className={`rounded-lg border transition-all duration-150 ${
                  isSectionSelected
                    ? "border-blue-500 bg-blue-50/40 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                {/* Section Item Header */}
                <div
                  className="px-3 py-2 flex items-center justify-between cursor-pointer"
                  onClick={() => onSelectSection(section.id)}
                >
                  <div className="flex items-center space-x-2 overflow-hidden">
                    <span className="text-[11px] font-mono text-slate-400">
                      #{index + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {section.name || section.id}
                    </span>
                  </div>

                  {/* Section Controls */}
                  <div className="flex items-center space-x-0.5" onClick={(e) => e.stopPropagation()}>
                    {/* Move Up */}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMoveSection(index, index - 1)}
                      aria-label="Move section up"
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronUpIcon size={14} />
                    </button>

                    {/* Move Down */}
                    <button
                      type="button"
                      disabled={index === sections.length - 1}
                      onClick={() => onMoveSection(index, index + 1)}
                      aria-label="Move section down"
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ChevronDownIcon size={14} />
                    </button>

                    {/* Visibility Toggle */}
                    <button
                      type="button"
                      onClick={() => onToggleSectionVisibility(section.id)}
                      aria-label={isHidden ? "Unhide section" : "Hide section"}
                      className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {isHidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                    </button>

                    {/* Delete Section */}
                    <button
                      type="button"
                      onClick={() => onDeleteSection(section.id)}
                      aria-label="Delete section"
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>

                {/* Nested Blocks List */}
                {section.blocks.length > 0 && (
                  <div className="pl-6 pr-2 pb-2 space-y-1 border-t border-slate-100/80 pt-1.5">
                    {section.blocks.map((block) => {
                      const isBlockSelected = selectedBlockId === block.id;
                      return (
                        <div
                          key={block.id}
                          data-layer-block-id={block.id}
                          onClick={() => onSelectBlock(block.id, section.id)}
                          className={`px-2 py-1 rounded text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isBlockSelected
                              ? "bg-blue-600 text-white font-medium"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                        >
                          <span className="truncate">{block.type}</span>
                          <Badge
                            variant={isBlockSelected ? "default" : "outline"}
                            className="text-[9px] uppercase px-1 py-0 h-4"
                          >
                            block
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
