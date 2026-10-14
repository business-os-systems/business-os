import React, { useState } from "react";
import { Button, Badge } from "@suite/ui";
import { renderBlockPropertiesForm } from "./block-forms.js";
import { DesignTokenEditor } from "./design-token-editor.js";
import type { BlockPropertyInspectorProps } from "./types.js";

export function BlockPropertyInspector({
  block,
  section,
  onChangeBlockProps,
  onChangeBlockStyles,
  onClose,
  className = "",
}: BlockPropertyInspectorProps) {
  const [activeTab, setActiveTab] = useState<"content" | "style">("content");

  if (!block) {
    return (
      <aside
        aria-label="Block inspector"
        className={`w-80 border-l border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center text-slate-500 ${className}`}
      >
        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3 text-lg font-bold">
          ⚙
        </div>
        <h4 className="text-sm font-semibold text-slate-700">No Block Selected</h4>
        <p className="text-xs text-slate-500 mt-1 max-w-[200px]">
          Click on any block on the canvas to inspect and edit its content, actions, and design tokens.
        </p>
        {section && (
          <div className="mt-4 pt-4 border-t border-slate-200 w-full text-left">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Active Section
            </span>
            <span className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
              {section.id}
            </span>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      aria-label={`Block inspector for ${block.type}`}
      className={`w-80 border-l border-slate-200 bg-white flex flex-col h-full shadow-lg ${className}`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="uppercase font-mono text-[10px]">
            {block.type}
          </Badge>
          <span className="text-xs font-mono text-slate-500 truncate max-w-[120px]">
            {block.id}
          </span>
        </div>

        {onClose && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close inspector panel"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
          >
            ✕
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "content"}
          onClick={() => setActiveTab("content")}
          className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
            activeTab === "content"
              ? "border-primary text-primary bg-surface-brand-tint"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Content
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "style"}
          onClick={() => setActiveTab("style")}
          className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-colors ${
            activeTab === "style"
              ? "border-primary text-primary bg-surface-brand-tint"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Style & Tokens
        </button>
      </div>

      {/* Tab Content Panels */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "content" ? (
          <div>{renderBlockPropertiesForm(block, (props) => onChangeBlockProps(block.id, props))}</div>
        ) : (
          <DesignTokenEditor
            styles={block.styles}
            onChange={(updatedStyles) => onChangeBlockStyles(block.id, updatedStyles)}
          />
        )}
      </div>
    </aside>
  );
}
