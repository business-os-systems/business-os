"use client";

import React, { useState } from "react";
import { AstRenderer } from "@suite/website-builder/render";
import type { PageAst } from "@suite/website-builder/ast";
import { PreviewHeader } from "./preview-header";
import type { PreviewWorkspaceProps, PreviewDevice } from "./types";

const DEFAULT_PREVIEW_AST: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  meta: {
    title: "Flagship Bistro & Wine Bar",
    description: "Artisanal seasonal dining and private reservations",
  },
  globalStyles: {
    fontFamily: "Inter, sans-serif",
    backgroundColor: "#ffffff",
    textColor: "#0f172a",
  },
  sections: [
    {
      id: "sec_hero",
      name: "Hero Showcase",
      styles: { maxWidth: "xl", paddingTop: 40, paddingBottom: 40 },
      blocks: [
        {
          id: "b_hero_1",
          type: "hero",
          props: {
            headline: "Artisanal Dining by the Waterfront",
            subheadline:
              "Handcrafted farm-to-table cuisine, natural wines, and panoramic river vistas.",
            badge: "Now Accepting Spring Reservations",
            primaryCta: {
              label: "Book a Table",
              target: { url: "/reservations" },
            },
            secondaryCta: {
              label: "Explore Menu",
              target: { url: "/menu" },
            },
          },
        },
      ],
    },
    {
      id: "sec_features",
      name: "Core Highlights",
      styles: { maxWidth: "xl", paddingTop: 32, paddingBottom: 32 },
      blocks: [
        {
          id: "b_feat_1",
          type: "features",
          props: {
            headline: "The Culinary Experience",
            subheadline: "Every dish crafted with obsessive dedication to local provenance.",
            columns: 3,
            features: [
              {
                id: "feat_1",
                title: "Seasonal Harvest",
                description: "Organic ingredients sourced within 40 miles every morning.",
              },
              {
                id: "feat_2",
                title: "Curated Cellar",
                description: "Over 200 biodynamic and low-intervention vintage wines.",
              },
              {
                id: "feat_3",
                title: "Private Dining",
                description: "Dedicated tasting room for intimate celebrations and events.",
              },
            ],
          },
        },
      ],
    },
    {
      id: "sec_pricing",
      name: "Tasting Menus",
      styles: { maxWidth: "xl", paddingTop: 32, paddingBottom: 40 },
      blocks: [
        {
          id: "b_pricing_1",
          type: "pricing",
          props: {
            headline: "Chef's Tasting Menus",
            subheadline: "Five-course and seven-course journeys with optional pairings.",
            tiers: [
              {
                id: "tier_5",
                name: "Five-Course Tasting",
                description: "Seasonal Chef selection",
                priceAmount: 125,
                currency: "$",
                interval: "one-time",
                isFeatured: false,
                cta: {
                  label: "Reserve Experience",
                  target: { url: "/reservations" },
                },
                features: [
                  { text: "Seasonal amuse-bouche", included: true },
                  { text: "Prime local meats", included: true },
                  { text: "Signature dessert", included: true },
                ],
              },
              {
                id: "tier_7",
                name: "Grand Seven-Course",
                description: "Full culinary immersion",
                priceAmount: 185,
                currency: "$",
                interval: "one-time",
                isFeatured: true,
                badge: "Most Popular",
                cta: {
                  label: "Reserve Experience",
                  target: { url: "/reservations" },
                },
                features: [
                  { text: "Full Chef immersion", included: true },
                  { text: "Rare reserve pairings", included: true },
                  { text: "Tableside preparation", included: true },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};

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
  pageTitle = "Homepage & Welcome Hero",
  initialAst = DEFAULT_PREVIEW_AST,
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

          <AstRenderer ast={initialAst} isEditor={false} />
        </div>
      </div>
    </div>
  );
}
