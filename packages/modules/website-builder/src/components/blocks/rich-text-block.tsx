import React from "react";
import type { RichTextBlockProps, BlockStyleTokens } from "../../ast/types.js";

export interface RichTextBlockComponentProps {
  props: RichTextBlockProps;
  styles?: BlockStyleTokens;
}

export function RichTextBlock({ props, styles }: RichTextBlockComponentProps) {
  const paddingStyle: React.CSSProperties = {
    paddingTop: styles?.paddingTop ? `${styles.paddingTop}px` : "48px",
    paddingBottom: styles?.paddingBottom ? `${styles.paddingBottom}px` : "48px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

  return (
    <section
      data-block-type="rich-text"
      style={paddingStyle}
      className={`w-full px-4 sm:px-6 lg:px-8 ${styles?.customClassName || ""}`}
    >
      <div
        className="max-w-4xl mx-auto prose prose-slate sm:prose-lg leading-relaxed"
        dangerouslySetInnerHTML={{ __html: props.contentHtml }}
      />
    </section>
  );
}
