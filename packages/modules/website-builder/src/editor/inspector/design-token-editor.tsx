import React from "react";
import { Input } from "@suite/ui";
import type { DesignTokenEditorProps } from "./types.js";
import type { BlockStyleTokens } from "../../ast/types.js";

const TEXT_ALIGN_OPTIONS: Array<NonNullable<BlockStyleTokens["textAlign"]>> = [
  "left",
  "center",
  "right",
  "justify",
];

export function DesignTokenEditor({
  styles = {},
  onChange,
  className = "",
}: DesignTokenEditorProps) {
  const updateStyle = (key: keyof BlockStyleTokens, value: unknown) => {
    onChange({
      ...styles,
      [key]: value,
    });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="border-b border-slate-200 pb-2">
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Style & Design Tokens
        </h4>
      </div>

      {/* Background & Text Color */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Background</label>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={styles.backgroundColor || "#ffffff"}
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              className="h-8 w-8 rounded border border-slate-300 cursor-pointer p-0.5"
            />
            <Input
              type="text"
              value={styles.backgroundColor || ""}
              placeholder="#ffffff"
              onChange={(e) => updateStyle("backgroundColor", e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Text Color</label>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={styles.textColor || "#0f172a"}
              onChange={(e) => updateStyle("textColor", e.target.value)}
              className="h-8 w-8 rounded border border-slate-300 cursor-pointer p-0.5"
            />
            <Input
              type="text"
              value={styles.textColor || ""}
              placeholder="#0f172a"
              onChange={(e) => updateStyle("textColor", e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Padding Sliders */}
      <div className="space-y-3 pt-2">
        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>Padding Top</span>
            <span className="font-mono">{styles.paddingTop ?? 0}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={128}
            step={4}
            value={styles.paddingTop ?? 0}
            onChange={(e) => updateStyle("paddingTop", Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>Padding Bottom</span>
            <span className="font-mono">{styles.paddingBottom ?? 0}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={128}
            step={4}
            value={styles.paddingBottom ?? 0}
            onChange={(e) => updateStyle("paddingBottom", Number(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>
      </div>

      {/* Text Alignment */}
      <div className="pt-2">
        <label className="block text-xs font-medium text-slate-600 mb-1.5">Text Alignment</label>
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-md">
          {TEXT_ALIGN_OPTIONS.map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => updateStyle("textAlign", align)}
              className={`py-1 text-xs font-medium rounded capitalize transition-colors ${
                (styles.textAlign || "left") === align
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </div>

      {/* Custom CSS Class Name */}
      <div className="pt-2">
        <label className="block text-xs font-medium text-slate-600 mb-1">Custom CSS Class</label>
        <Input
          type="text"
          value={styles.customClassName || ""}
          placeholder="e.g. custom-glow my-header"
          onChange={(e) => updateStyle("customClassName", e.target.value)}
          className="h-8 text-xs font-mono"
        />
      </div>
    </div>
  );
}
