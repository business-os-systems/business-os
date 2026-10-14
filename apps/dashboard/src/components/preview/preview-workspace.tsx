"use client";

import React, { useState } from "react";
import { AstRenderer } from "@suite/website-builder/render";
import { PreviewHeader } from "./preview-header";
import type { PreviewWorkspaceProps, PreviewDevice } from "./types";

const VIEWPORT_STYLES: Record<
  PreviewDevice,
  { containerClass: string; frameClass: string; widthStyle?: string }
> = {
  mobile: {
    containerClass: "p-8 flex items-start justify-center",
    frameClass:
      "w-[375px] max-w-[375px] rounded-[36px] border-[10px] border-slate-800 bg-white shadow-2xl overflow-hidden my-4",
    widthStyle: "375px",
  },
  tablet: {
    containerClass: "p-8 flex items-start justify-center",
    frameClass:
      "w-[768px] max-w-[768px] rounded-[24px] border-[10px] border-slate-800 bg-white shadow-2xl overflow-hidden my-4",
    widthStyle: "768px",
  },
  desktop: {
    containerClass: "p-8 flex items-start justify-center",
    frameClass:
      "w-[1280px] max-w-[1280px] rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden my-4",
    widthStyle: "1280px",
  },
  responsive: {
    containerClass: "p-0",
    frameClass: "w-full min-h-full bg-white",
    widthStyle: "100%",
  },
};

export function PreviewWorkspace({
  siteId,
  pageId,
  pageTitle = "Untitled Page",
  initialAst,
}: PreviewWorkspaceProps) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  const viewport = VIEWPORT_STYLES[device];

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-900">
      {/* Top Preview Header */}
      <PreviewHeader
        siteId={siteId}
        pageId={pageId}
        pageTitle={pageTitle}
        device={device}
        onDeviceChange={setDevice}
      />

      {/* Main Viewport Sandbox Workspace */}
      <div
        className={`flex-1 overflow-auto bg-slate-100 ${viewport.containerClass}`}
        data-preview-workspace="true"
        data-preview-device={device}
      >
        <div
          className={`${viewport.frameClass} transition-all duration-300 ease-in-out`}
          style={viewport.widthStyle ? { width: viewport.widthStyle } : undefined}
        >
          {device !== "responsive" && (
            <div className="bg-slate-800 text-slate-400 px-4 py-2 flex items-center justify-between text-[11px] font-mono select-none border-b border-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="capitalize">{device} Simulation ({viewport.widthStyle})</span>
              </span>
              <span className="text-slate-500">Live Edge Preview</span>
            </div>
          )}

          {initialAst && initialAst.sections && initialAst.sections.length > 0 ? (
            <AstRenderer ast={initialAst} isEditor={false} />
          ) : (
            <div className="flex flex-col items-center justify-center p-16 text-center text-slate-400">
              <p className="text-sm font-medium text-slate-600">No page content to preview</p>
              <p className="text-xs text-slate-400 mt-1">This page has no sections or content published yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
