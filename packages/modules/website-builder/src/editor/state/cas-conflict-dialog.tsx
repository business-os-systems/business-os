import React from "react";
import { Button, Badge } from "@suite/ui";
import type { AutosaveConflictData } from "./types.js";

export interface CasConflictDialogProps {
  isOpen: boolean;
  conflict: AutosaveConflictData | null;
  onKeepMine: () => void;
  onKeepServer: () => void;
  className?: string;
}

export function CasConflictDialog({
  isOpen,
  conflict,
  onKeepMine,
  onKeepServer,
  className = "",
}: CasConflictDialogProps) {
  if (!isOpen || !conflict) return null;

  const localSectionCount = conflict.localAst.sections.length;
  const serverSectionCount = conflict.serverAst.sections.length;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cas-conflict-title"
      aria-describedby="cas-conflict-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
    >
      <div
        className={`bg-white rounded-xl shadow-2xl border border-red-200 w-full max-w-lg overflow-hidden flex flex-col ${className}`}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 text-sm font-bold">
              ⚠
            </span>
            <h3 id="cas-conflict-title" className="text-sm font-bold text-red-900">
              Concurrent Editing Conflict Detected
            </h3>
          </div>
          <Badge variant="destructive" className="text-[10px] font-mono uppercase">
            Rev #{conflict.serverRevision}
          </Badge>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs text-slate-600">
          <p id="cas-conflict-desc" className="leading-relaxed">
            Another collaborator or background process published or saved a newer version of this page on the server.
            Saving now would silently overwrite their changes.
          </p>

          {/* Quick Comparison Summary */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="space-y-1">
              <span className="font-semibold text-slate-700 block">Your Local Draft</span>
              <span className="text-slate-500 font-mono">Sections: {localSectionCount}</span>
            </div>
            <div className="space-y-1 border-l border-slate-200 pl-3">
              <span className="font-semibold text-slate-700 block">Server Version</span>
              <span className="text-slate-500 font-mono">Sections: {serverSectionCount}</span>
              <span className="text-slate-500 font-mono block">Revision: #{conflict.serverRevision}</span>
            </div>
          </div>

          <p className="text-slate-500 italic">
            Choose whether to overwrite the server version with your local changes or discard local changes to load the server version.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onKeepServer}
            className="text-xs"
          >
            Load Server Version (Discard Mine)
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onKeepMine}
            className="text-xs"
          >
            Overwrite Server Version
          </Button>
        </div>
      </div>
    </div>
  );
}
