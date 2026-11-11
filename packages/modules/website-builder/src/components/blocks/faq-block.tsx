import React, { useState } from "react";
import { ChevronDownIcon } from "@suite/ui/icons";
import type { FaqBlockProps, BlockStyleTokens } from "../../ast/types.js";
import {
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_RADII,
  resolveSectionStyle,
} from "./block-tokens.js";

export interface FaqBlockComponentProps {
  props: FaqBlockProps;
  styles?: BlockStyleTokens;
}

export function FaqBlock({ props, styles }: FaqBlockComponentProps) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const toggleItem = (id: string) => {
    setOpenIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const sectionStyle = resolveSectionStyle(styles);

  return (
    <section
      data-block-type="faq"
      style={sectionStyle}
      className="w-full px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto">
        {props.headline || props.subheadline ? (
          <div className="text-center mb-12">
            {props.headline ? (
              <h2
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
              >
                {props.headline}
              </h2>
            ) : null}
            {props.subheadline ? (
              <p className="mt-4 text-lg" style={{ color: BLOCK_COLORS.textMuted }}>
                {props.subheadline}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4">
          {props.items.map((item) => {
            const isOpen = !!openIds[item.id];
            return (
              <div
                key={item.id}
                className="border overflow-hidden transition-colors"
                style={{
                  backgroundColor: BLOCK_COLORS.surface,
                  borderColor: BLOCK_COLORS.border,
                  borderRadius: BLOCK_RADII.md,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="w-full flex justify-between items-center px-6 py-4 text-left font-semibold hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: BLOCK_COLORS.text, outlineColor: BLOCK_COLORS.primary }}
                >
                  <span className="text-base sm:text-lg" style={{ fontFamily: BLOCK_FONTS.heading }}>
                    {item.question}
                  </span>
                  <span
                    className={`ml-4 transform transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <ChevronDownIcon size={20} />
                  </span>
                </button>

                {isOpen ? (
                  <div
                    className="px-6 pb-4 pt-1 text-sm sm:text-base border-t leading-relaxed"
                    style={{ color: BLOCK_COLORS.textMuted, borderColor: BLOCK_COLORS.border }}
                  >
                    {item.answer}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
