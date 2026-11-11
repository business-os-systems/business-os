import React from "react";
import DOMPurify from "isomorphic-dompurify";
import type { RichTextBlockProps, BlockStyleTokens } from "../../ast/types.js";
import { BLOCK_PROSE_VARIABLES, resolveSectionStyle } from "./block-tokens.js";

export interface RichTextBlockComponentProps {
  props: RichTextBlockProps;
  styles?: BlockStyleTokens;
}

export function RichTextBlock({ props, styles }: RichTextBlockComponentProps) {
  const sectionStyle = resolveSectionStyle(styles);

  const sanitizedHtml = React.useMemo(() => {
    return DOMPurify.sanitize(props.contentHtml ?? "", {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed"],
    });
  }, [props.contentHtml]);

  return (
    <section
      data-block-type="rich-text"
      style={sectionStyle}
      className="w-full px-4 sm:px-6 lg:px-8"
    >
      <div
        className="max-w-4xl mx-auto prose sm:prose-lg leading-relaxed"
        style={BLOCK_PROSE_VARIABLES}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </section>
  );
}
