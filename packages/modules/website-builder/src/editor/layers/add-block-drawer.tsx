import React, { useState } from "react";
import { Button, Badge } from "@suite/ui";
import { PlusIcon } from "@suite/ui/icons";
import { BLOCK_BLUEPRINTS } from "./blueprints.js";
import type { AddBlockDrawerProps, BlockBlueprint } from "./types.js";
import type { SectionAst } from "../../ast/types.js";

const CATEGORY_TABS = [
  { id: "all", label: "All Blocks" },
  { id: "marketing", label: "Marketing" },
  { id: "content", label: "Content" },
  { id: "commerce", label: "Commerce" },
  { id: "navigation", label: "Navigation" },
] as const;

export function AddBlockDrawer({
  isOpen,
  onClose,
  onAddBlock,
  onAddSection,
  targetSectionId,
  className = "",
}: AddBlockDrawerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  if (!isOpen) return null;

  const blueprintsList = Object.values(BLOCK_BLUEPRINTS) as BlockBlueprint[];
  const filteredBlueprints =
    selectedCategory === "all"
      ? blueprintsList
      : blueprintsList.filter((b) => b.category === selectedCategory);

  const handleSelectBlueprint = (blueprint: BlockBlueprint) => {
    const timestamp = Date.now().toString(36);
    const newBlockId = `b_${blueprint.type}_${timestamp}`;
    const newBlock = blueprint.createDefaultBlock(newBlockId);

    if (targetSectionId) {
      // Insert into existing target section
      onAddBlock(newBlock, targetSectionId);
    } else {
      // Create new container section for this block
      const newSectionId = `sec_${blueprint.type}_${timestamp}`;
      const newSection: SectionAst = {
        id: newSectionId,
        name: blueprint.title,
        blocks: [newBlock],
      };
      onAddSection(newSection);
    }

    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add Block or Section Template"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Block Blueprint Library
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a pre-built template to insert into your page AST.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close add block drawer"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
          >
            ✕
          </Button>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-white overflow-x-auto">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                selectedCategory === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Blueprints Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredBlueprints.map((blueprint) => (
            <div
              key={blueprint.type}
              data-blueprint-type={blueprint.type}
              onClick={() => handleSelectBlueprint(blueprint)}
              className="p-4 rounded-lg border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer bg-white group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                    {blueprint.title}
                  </h4>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {blueprint.category}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {blueprint.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end text-xs font-medium text-blue-600 gap-1 group-hover:translate-x-0.5 transition-transform">
                <PlusIcon size={14} />
                <span>Insert Block</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
