import React from "react";
import type { MediaAssetMap, PageAst } from "../ast/types.js";
import type { AppearanceTokens } from "../appearance/index.js";
import { SectionRenderer } from "./section-renderer.js";
import { ThemeProvider } from "./theme-provider.js";

export interface AstRendererProps {
  ast: PageAst | null;
  isEditor?: boolean;
  /** The site appearance snapshot; when present it wins over page-level styles. */
  tokens?: AppearanceTokens | null;
  /** Server-resolved asset URLs for identity-first media slots. */
  media?: MediaAssetMap;
  className?: string;
}

const TOKEN_PAGE_STYLE: React.CSSProperties = {
  fontFamily: "var(--cms-font-body)",
  backgroundColor: "var(--cms-color-background)",
  color: "var(--cms-color-text)",
};

function resolveGlobalStyle(
  ast: PageAst,
  tokens: AppearanceTokens | null
): React.CSSProperties {
  if (tokens !== null) {
    return TOKEN_PAGE_STYLE;
  }
  return {
    fontFamily: ast.globalStyles?.fontFamily,
    backgroundColor: ast.globalStyles?.backgroundColor,
    color: ast.globalStyles?.textColor,
  };
}

export function AstRenderer({
  ast,
  isEditor = false,
  tokens = null,
  media,
  className = "",
}: AstRendererProps) {
  if (ast === null || !Array.isArray(ast.sections)) {
    return (
      <div className="p-8 text-center text-text-muted bg-surface-muted rounded-xl">
        No content available to render.
      </div>
    );
  }

  const globalStyle = resolveGlobalStyle(ast, tokens);

  const page = (
    <main
      data-cms-page="true"
      style={globalStyle}
      className={`min-h-screen w-full flex flex-col ${className}`}
    >
      {ast.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} isEditor={isEditor} media={media} />
      ))}
    </main>
  );

  if (tokens === null) {
    return page;
  }
  return <ThemeProvider tokens={tokens}>{page}</ThemeProvider>;
}
