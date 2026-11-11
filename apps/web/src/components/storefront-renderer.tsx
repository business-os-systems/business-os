"use client";

import type { AppearanceTokens } from "@suite/website-builder/appearance";
import type { MediaAssetMap, PageAst } from "@suite/website-builder/ast";
import { AstRenderer } from "@suite/website-builder/render";

export interface StorefrontRendererProps {
  readonly ast: PageAst;
  readonly media: MediaAssetMap;
  readonly tokens: AppearanceTokens;
}

/**
 * The visitor-facing renderer. It is the production AST renderer with the
 * editor switched off; AstRenderer mounts the T-09 ThemeProvider whenever the
 * site's published token snapshot is supplied, so no token is inlined here.
 */
export function StorefrontRenderer({ ast, media, tokens }: StorefrontRendererProps) {
  return <AstRenderer ast={ast} isEditor={false} media={media} tokens={tokens} />;
}
