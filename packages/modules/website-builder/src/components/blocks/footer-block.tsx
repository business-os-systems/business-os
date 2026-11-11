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
          <span className="font-bold font-heading text-xl text-on-surface tracking-tight">
            {props.logoText}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-on-surface-variant">
        {props.copyrightText ||
          `© ${new Date().getFullYear()} All rights reserved.`}
      </p>
    </div>
  );
}

export function FooterBlock({ props, styles, media }: FooterBlockComponentProps) {
  const containerStyle: React.CSSProperties = {
    backgroundColor: styles?.backgroundColor ?? "#0f172a",
    color: styles?.textColor ?? "#cbd5e1",
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
      className={`w-full py-12 px-4 sm:px-6 lg:px-8 ${styles?.customClassName ?? ""}`}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <FooterBrand
          logo={logo}
          logoText={props.logoText}
          copyrightText={props.copyrightText}
        />

        {props.columns.map((col) => (
          <div key={col.id} className="space-y-3">
            <h4 className="text-sm font-semibold font-heading text-on-surface tracking-wider uppercase">
              {col.title}
            </h4>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.target.url}
                    className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
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
