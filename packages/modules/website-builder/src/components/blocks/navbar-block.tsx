import React from "react";
import { Button } from "@suite/ui";
import type {
  NavbarBlockProps,
  BlockStyleTokens,
  MediaAssetMap,
  NavItem,
} from "../../ast/types.js";
import {
  resolveMediaImage,
  type ResolvedMediaImage,
} from "../../render/media-resolution.js";
import {
  BLOCK_CARD_SHADOW,
  BLOCK_COLORS,
  BLOCK_FONTS,
  resolveBlockSurface,
} from "./block-tokens.js";

export interface NavbarBlockComponentProps {
  props: NavbarBlockProps;
  styles?: BlockStyleTokens;
  media?: MediaAssetMap;
}

function NavbarBrand(props: {
  readonly logo: ResolvedMediaImage | null;
  readonly logoText: string | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
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
          className="font-bold text-lg tracking-tight"
          style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
        >
          {props.logoText}
        </span>
      ) : null}
    </div>
  );
}

function NavbarLinks(props: { readonly items: readonly NavItem[] }) {
  return (
    <nav className="hidden md:flex items-center gap-6">
      {props.items.map((item) => (
        <a
          key={item.id}
          href={item.target.url}
          className="text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: BLOCK_COLORS.textMuted }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function NavbarBlock({ props, styles, media }: NavbarBlockComponentProps) {
  const containerStyle: React.CSSProperties = {
    ...resolveBlockSurface(styles, {
      background: BLOCK_COLORS.surface,
      text: BLOCK_COLORS.text,
      border: BLOCK_COLORS.border,
    }),
    fontFamily: BLOCK_FONTS.body,
    boxShadow: BLOCK_CARD_SHADOW,
  };
  const logo = resolveMediaImage({
    reference: props.logo,
    legacyUrl: props.logoUrl,
    legacyAlt: props.logoText,
    media,
  });

  return (
    <header
      data-block-type="navbar"
      style={containerStyle}
      className="w-full border-b sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <NavbarBrand logo={logo} logoText={props.logoText} />
        <NavbarLinks items={props.items} />
        {props.ctaButton ? (
          <div>
            <a href={props.ctaButton.target.url}>
              <Button size="sm">{props.ctaButton.label}</Button>
            </a>
          </div>
        ) : null}
      </div>
    </header>
  );
}
