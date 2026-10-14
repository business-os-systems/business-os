import React, { useState } from "react";
import { ChevronDownIcon } from "@suite/ui/icons";
import type { FaqBlockProps, BlockStyleTokens } from "../../ast/types.js";

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

  const paddingStyle: React.CSSProperties = {
    paddingTop:
      styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : "64px",
    paddingBottom:
      styles?.paddingBottom !== undefined
        ? `${styles.paddingBottom}px`
        : "64px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

  return (
    <section
      data-block-type="faq"
      style={paddingStyle}
      className={`w-full px-4 sm:px-6 lg:px-8 ${styles?.customClassName ?? ""}`}
    >
      <div className="max-w-4xl mx-auto">
        {props.headline || props.subheadline ? (
          <div className="text-center mb-12">
            {props.headline ? (
              <h2 className="text-3xl font-bold font-heading tracking-tight text-on-surface sm:text-4xl">
                {props.headline}
              </h2>
            ) : null}
            {props.subheadline ? (
              <p className="mt-4 text-lg text-on-surface-variant">
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
                className="rounded-lg border border-hairline bg-surface-container-lowest overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="w-full flex justify-between items-center px-6 py-4 text-left font-semibold text-on-surface hover:bg-surface-container-low focus:outline-none"
                >
                  <span className="text-base sm:text-lg font-heading">
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
                  <div className="px-6 pb-4 pt-1 text-on-surface-variant text-sm sm:text-base border-t border-hairline leading-relaxed">
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
