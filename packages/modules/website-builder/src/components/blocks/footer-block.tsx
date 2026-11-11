import React from "react";
import type {
  FooterBlockProps,
  BlockStyleTokens,
  MediaAssetMap,
} from "../../ast/types.js";
import {
  resolveMediaImage,
  type ResolvedMediaImage,
} from "../../render/media-resolution.js";
import {
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_SECTION_PADDING,
  resolveBlockSurface,
} from "./block-tokens.js";

export interface FooterBlockComponentProps {
  props: FooterBlockProps;
  styles?: BlockStyleTokens;
  media?: MediaAssetMap;
}

function FooterBrand(props: {
  readonly logo: ResolvedMediaImage | null;
  readonly logoText: string | undefined;
  readonly copyrightText: string | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {props.logo === null ? null : (
          <img
            src={props.logo.url}
            alt={props.logo.alt ?? "Logo"}
            width={props.logo.width ?? undefined}
            height={props.logo.height ?? undefined}
            className="h-8 w-auto"
          />
        )}
        {props.logoText ? (
          <span
            className="font-bold text-xl tracking-tight"
            style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
          >
            {props.logoText}
          </span>
        ) : null}
      </div>
      <p className="text-xs" style={{ color: BLOCK_COLORS.textMuted }}>
        {props.copyrightText ||
          `© ${new Date().getFullYear()} All rights reserved.`}
      </p>
    </div>
  );
}

export function FooterBlock({ props, styles, media }: FooterBlockComponentProps) {
  const containerStyle: React.CSSProperties = {
    ...resolveBlockSurface(styles, {
      background: BLOCK_COLORS.surface,
      text: BLOCK_COLORS.textMuted,
      border: BLOCK_COLORS.border,
    }),
    ...BLOCK_SECTION_PADDING,
    fontFamily: BLOCK_FONTS.body,
  };
  const logo = resolveMediaImage({
    reference: props.logo,
    legacyUrl: props.logoUrl,
    legacyAlt: props.logoText,
    media,
  });

  return (
    <footer
      data-block-type="footer"
      style={containerStyle}
      className="w-full border-t px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <FooterBrand
          logo={logo}
          logoText={props.logoText}
          copyrightText={props.copyrightText}
        />

        {props.columns.map((col) => (
          <div key={col.id} className="space-y-3">
            <h4
              className="text-sm font-semibold tracking-wider uppercase"
              style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
            >
              {col.title}
            </h4>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.target.url}
                    className="text-sm transition-opacity hover:opacity-80"
                    style={{ color: BLOCK_COLORS.textMuted }}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
