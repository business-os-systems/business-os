"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  VisualCanvas,
  BlockTreeSidebar,
  BlockPropertyInspector,
  AddBlockDrawer,
  type CanvasSelectionState,
} from "@suite/website-builder/editor";
import type {
  PageAst,
  SectionAst,
  BlockAst,
  BlockStyleTokens,
} from "@suite/website-builder/ast";
import { StudioHeader } from "./studio-header";
import type { StudioWorkspaceProps } from "./types";

const DEFAULT_SEED_AST: PageAst = {
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

export function StudioWorkspace({
  siteId,
  pageId,
  pageTitle = "Homepage & Welcome Hero",
  initialAst = DEFAULT_SEED_AST,
  revision = 4,
  status = "PUBLISHED",
}: StudioWorkspaceProps) {
  const [pageAst, setPageAst] = useState<PageAst>(initialAst);
  const [selection, setSelection] = useState<CanvasSelectionState>({
    selectedBlockId: "b_hero_1",
    selectedSectionId: "sec_hero",
    hoveredBlockId: null,
  });

  const [isLayersOpen, setIsLayersOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [targetSectionIdForAdd, setTargetSectionIdForAdd] = useState<string | null>(null);

  // Active Block and Section resolution
  const activeBlock = useMemo<BlockAst | null>(() => {
    if (!selection.selectedBlockId) return null;
    for (const section of pageAst.sections) {
      for (const block of section.blocks) {
        if (block.id === selection.selectedBlockId) {
          return block;
        }
      }
    }
    return null;
  }, [pageAst, selection.selectedBlockId]);

  const activeSection = useMemo<SectionAst | null>(() => {
    if (selection.selectedSectionId) {
      const match = pageAst.sections.find((s) => s.id === selection.selectedSectionId);
      if (match) return match;
    }
    if (selection.selectedBlockId) {
      const match = pageAst.sections.find((s) =>
        s.blocks.some((b) => b.id === selection.selectedBlockId)
      );
      if (match) return match;
    }
    return null;
  }, [pageAst, selection.selectedSectionId, selection.selectedBlockId]);

  // Block Selection
  const handleSelectBlock = useCallback(
    (blockId: string | null, _block?: BlockAst) => {
      if (!blockId) {
        setSelection((prev) => ({
          ...prev,
          selectedBlockId: null,
        }));
        return;
      }

      const parentSection = pageAst.sections.find((s) =>
        s.blocks.some((b) => b.id === blockId)
      );

      setSelection((prev) => ({
        ...prev,
        selectedBlockId: blockId,
        selectedSectionId: parentSection ? parentSection.id : prev.selectedSectionId,
      }));
    },
    [pageAst]
  );

  // Section Selection
  const handleSelectSection = useCallback((sectionId: string | null) => {
    setSelection((prev) => ({
      ...prev,
      selectedSectionId: sectionId,
      selectedBlockId: null,
    }));
  }, []);

  // Update Block Properties
  const handleChangeBlockProps = useCallback(
    (blockId: string, newProps: Record<string, unknown>) => {
      setPageAst((prev) => ({
        ...prev,
        sections: prev.sections.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.id !== blockId) return b;
            return {
              ...b,
              props: {
                ...b.props,
                ...newProps,
              },
            } as BlockAst;
          }),
        })),
      }));
    },
    []
  );

  // Update Block Styles
  const handleChangeBlockStyles = useCallback(
    (blockId: string, newStyles: BlockStyleTokens) => {
      setPageAst((prev) => ({
        ...prev,
        sections: prev.sections.map((sec) => ({
          ...sec,
          blocks: sec.blocks.map((b) => {
            if (b.id !== blockId) return b;
            return {
              ...b,
              styles: {
                ...b.styles,
                ...newStyles,
              },
            } as BlockAst;
          }),
        })),
      }));
    },
    []
  );

  // Move Section
  const handleMoveSection = useCallback((fromIndex: number, toIndex: number) => {
    setPageAst((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.sections.length ||
        toIndex < 0 ||
        toIndex >= prev.sections.length
      ) {
        return prev;
      }
      const newSections = [...prev.sections];
      const [moved] = newSections.splice(fromIndex, 1);
      if (moved) {
        newSections.splice(toIndex, 0, moved);
      }
      return { ...prev, sections: newSections };
    });
  }, []);

  // Delete Section
  const handleDeleteSection = useCallback((sectionId: string) => {
    setPageAst((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
    setSelection((prev) => ({
      ...prev,
      selectedSectionId: prev.selectedSectionId === sectionId ? null : prev.selectedSectionId,
      selectedBlockId: null,
    }));
  }, []);

  // Toggle Visibility
  const handleToggleSectionVisibility = useCallback((sectionId: string) => {
    setPageAst((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const currentVis = sec.visibility || {};
        return {
          ...sec,
          visibility: {
            ...currentVis,
            hideOnDesktop: !currentVis.hideOnDesktop,
          },
        };
      }),
    }));
  }, []);

  // Add Block
  const handleAddBlock = useCallback(
    (newBlock: BlockAst, targetSecId?: string) => {
      setPageAst((prev) => {
        if (!targetSecId) {
          const lastSec = prev.sections[prev.sections.length - 1];
          if (!lastSec) {
            return {
              ...prev,
              sections: [
                {
                  id: `sec_${Date.now()}`,
                  name: "New Section",
                  blocks: [newBlock],
                },
              ],
            };
          }
          return {
            ...prev,
            sections: prev.sections.map((sec) =>
              sec.id === lastSec.id
                ? { ...sec, blocks: [...sec.blocks, newBlock] }
                : sec
            ),
          };
        }
        return {
          ...prev,
          sections: prev.sections.map((sec) => {
            if (sec.id !== targetSecId) return sec;
            return {
              ...sec,
              blocks: [...sec.blocks, newBlock],
            };
          }),
        };
      });
      setSelection({
        selectedBlockId: newBlock.id,
        selectedSectionId: targetSecId || null,
        hoveredBlockId: null,
      });
    },
    []
  );

  // Add Section
  const handleAddSection = useCallback((newSection: SectionAst) => {
    setPageAst((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
    const firstBlock = newSection.blocks[0];
    setSelection({
      selectedSectionId: newSection.id,
      selectedBlockId: firstBlock ? firstBlock.id : null,
      hoveredBlockId: null,
    });
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-900">
      {/* Studio Header Bar */}
      <StudioHeader
        siteId={siteId}
        pageId={pageId}
        pageTitle={pageTitle}
        revision={revision}
        status={status}
        isLayersOpen={isLayersOpen}
        isInspectorOpen={isInspectorOpen}
        onToggleLayers={() => setIsLayersOpen((prev) => !prev)}
        onToggleInspector={() => setIsInspectorOpen((prev) => !prev)}
        onOpenAddDrawer={() => {
          setTargetSectionIdForAdd(selection.selectedSectionId);
          setIsAddDrawerOpen(true);
        }}
      />

      {/* Main Studio Body Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Layer Tree Sidebar */}
        {isLayersOpen && (
          <BlockTreeSidebar
            sections={pageAst.sections}
            selectedSectionId={selection.selectedSectionId}
            selectedBlockId={selection.selectedBlockId}
            onSelectSection={handleSelectSection}
            onSelectBlock={(blockId, _secId) => handleSelectBlock(blockId)}
            onMoveSection={handleMoveSection}
            onDeleteSection={handleDeleteSection}
            onToggleSectionVisibility={handleToggleSectionVisibility}
            onOpenAddDrawer={(targetSectionIndex) => {
              const sec =
                typeof targetSectionIndex === "number"
                  ? pageAst.sections[targetSectionIndex]
                  : null;
              setTargetSectionIdForAdd(sec ? sec.id : null);
              setIsAddDrawerOpen(true);
            }}
          />
        )}

        {/* Center: Live Scaled Visual Canvas */}
        <div className="flex-1 h-full min-w-0 overflow-hidden relative bg-slate-100">
          <VisualCanvas
            ast={pageAst}
            selection={selection}
            onSelectBlock={handleSelectBlock}
            onHoverBlock={(blockId) =>
              setSelection((prev) => ({ ...prev, hoveredBlockId: blockId }))
            }
            onSelectSection={(secId) => handleSelectSection(secId)}
          />
        </div>

        {/* Right: Property & Token Inspector */}
        {isInspectorOpen && (
          <BlockPropertyInspector
            block={activeBlock}
            section={activeSection}
            onChangeBlockProps={handleChangeBlockProps}
            onChangeBlockStyles={handleChangeBlockStyles}
            onClose={() => setIsInspectorOpen(false)}
          />
        )}
      </div>

      {/* Add Block / Section Template Drawer Modal */}
      <AddBlockDrawer
        isOpen={isAddDrawerOpen}
        onClose={() => {
          setIsAddDrawerOpen(false);
          setTargetSectionIdForAdd(null);
        }}
        onAddBlock={handleAddBlock}
        onAddSection={handleAddSection}
        targetSectionId={targetSectionIdForAdd}
      />
    </div>
  );
}
