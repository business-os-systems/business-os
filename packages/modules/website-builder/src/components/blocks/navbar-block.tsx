import React from "react";
import { Button } from "@suite/ui";
import type {
  NavbarBlockProps,
  BlockStyleTokens,
  MediaAssetMap,
} from "../../ast/types.js";
import { resolveMediaImage } from "../../render/media-resolution.js";

export interface NavbarBlockComponentProps {
  props: NavbarBlockProps;
  styles?: BlockStyleTokens;
  media?: MediaAssetMap;
}

export function NavbarBlock({ props, styles, media }: NavbarBlockComponentProps) {
  const containerStyle: React.CSSProperties = {
    backgroundColor: styles?.backgroundColor || "#ffffff",
    color: styles?.textColor || "#0f172a",
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
      className={`w-full border-b border-hairline sticky top-0 z-50 shadow-sm ${styles?.customClassName || ""}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logo === null ? null : (
            <img
              src={logo.url}
              alt={logo.alt ?? "Logo"}
              width={logo.width ?? undefined}
              height={logo.height ?? undefined}
              className="h-8 w-auto"
            />
          )}
          {props.logoText ? (
            <span className="font-bold font-heading text-lg tracking-tight text-on-surface">
              {props.logoText}
            </span>
          ) : null}
        </div>

        <nav className="hidden md:flex items-center gap-6">
          {props.items.map((item) => (
            <a
              key={item.id}
              href={item.target.url}
              className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

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
