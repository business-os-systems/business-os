import React from "react";
import { Button, Badge } from "@suite/ui";
import { ArrowRightIcon } from "@suite/ui/icons";
import type {
  HeroBlockProps,
  BlockStyleTokens,
  MediaAssetMap,
} from "../../ast/types.js";
import {
  resolveMediaImage,
  type ResolvedMediaImage,
} from "../../render/media-resolution.js";

export interface HeroBlockComponentProps {
  props: HeroBlockProps;
  styles?: BlockStyleTokens;
  media?: MediaAssetMap;
}

const TEXT_ALIGN_MAP: Record<string, string> = {
  center: "text-center items-center",
  right: "text-right items-end",
  left: "text-left items-start",
};

function heroPaddingStyle(styles?: BlockStyleTokens): React.CSSProperties {
  return {
    paddingTop: styles?.paddingTop === undefined ? "64px" : `${styles.paddingTop}px`,
    paddingBottom: styles?.paddingBottom === undefined ? "64px" : `${styles.paddingBottom}px`,
    backgroundColor: styles?.backgroundColor,
    color: styles?.textColor,
  };
}

function HeroMedia(props: {
  readonly image: ResolvedMediaImage | null;
  readonly headline: string;
}) {
  if (props.image === null) {
    return null;
  }
  return (
    <div className="mt-12 w-full rounded-2xl overflow-hidden shadow-2xl border border-hairline">
      <img
        src={props.image.url}
        alt={props.image.alt ?? props.headline}
        width={props.image.width ?? undefined}
        height={props.image.height ?? undefined}
        className="w-full h-auto object-cover max-h-[500px]"
        loading="lazy"
      />
    </div>
  );
}

export function HeroBlock({ props, styles, media }: HeroBlockComponentProps) {
  const textAlignClass = TEXT_ALIGN_MAP[styles?.textAlign || "left"] || TEXT_ALIGN_MAP.left;
  const image = resolveMediaImage({
    reference: props.image,
    legacyUrl: props.imageUrl,
    legacyAlt: props.imageAlt,
    media,
  });

  return (
    <section
      data-block-type="hero"
      style={heroPaddingStyle(styles)}
      className={`w-full flex flex-col justify-center px-4 sm:px-6 lg:px-8 ${styles?.customClassName || ""}`}
    >
      <div className={`max-w-full mx-auto w-full flex flex-col ${textAlignClass}`}>
        {props.badge ? (
          <Badge variant="secondary" className="mb-4">
            {props.badge}
          </Badge>
        ) : null}

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-heading tracking-tight text-on-surface leading-tight">
          {props.headline}
        </h1>

        {props.subheadline ? (
          <p className="mt-4 text-lg sm:text-xl text-on-surface-variant max-w-2xl">
            {props.subheadline}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-4 items-center">
          {props.primaryCta ? (
            <a href={props.primaryCta.target.url}>
              <Button size="lg" className="gap-2">
                {props.primaryCta.label}
                <ArrowRightIcon size={18} />
              </Button>
            </a>
          ) : null}

          {props.secondaryCta ? (
            <a href={props.secondaryCta.target.url}>
              <Button variant="outline" size="lg">
                {props.secondaryCta.label}
              </Button>
            </a>
          ) : null}
        </div>

        <HeroMedia image={image} headline={props.headline} />
      </div>
    </section>
  );
}
