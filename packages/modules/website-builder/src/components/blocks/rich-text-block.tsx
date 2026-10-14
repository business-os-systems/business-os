import React from "react";
import DOMPurify from "isomorphic-dompurify";
import type { RichTextBlockProps, BlockStyleTokens } from "../../ast/types.js";

export interface RichTextBlockComponentProps {
  props: RichTextBlockProps;
  styles?: BlockStyleTokens;
}

export function RichTextBlock({ props, styles }: RichTextBlockComponentProps) {
  const paddingStyle: React.CSSProperties = {
    paddingTop:
      styles?.paddingTop !== undefined ? `${styles.paddingTop}px` : "48px",
    paddingBottom:
      styles?.paddingBottom !== undefined
        ? `${styles.paddingBottom}px`
        : "48px",
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };

  const sanitizedHtml = React.useMemo(() => {
    return DOMPurify.sanitize(props.contentHtml ?? "", {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed"],
    });
  }, [props.contentHtml]);

  return (
    <section
      data-block-type="rich-text"
      style={paddingStyle}
      className={`w-full px-4 sm:px-6 lg:px-8 ${styles?.customClassName ?? ""}`}
    >
      <div
        className="max-w-4xl mx-auto prose prose-slate sm:prose-lg leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </section>
  );
}
