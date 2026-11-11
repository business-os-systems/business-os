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
import {
  BLOCK_CARD_SHADOW,
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_RADII,
  resolveSectionStyle,
} from "./block-tokens.js";

export interface HeroBlockComponentProps {
  props: HeroBlockProps;
  styles?: BlockStyleTokens;
  media?: MediaAssetMap;
}

const TEXT_ALIGN_CLASSES = {
  center: "text-center items-center",
  right: "text-right items-end",
  left: "text-left items-start",
  justify: "text-justify items-start",
} as const satisfies Record<NonNullable<BlockStyleTokens["textAlign"]>, string>;

function HeroIntroduction(props: Pick<HeroBlockProps, "badge" | "headline" | "subheadline">) {
  return (
    <>
      {props.badge ? (
        <Badge variant="secondary" className="mb-4">
          {props.badge}
        </Badge>
      ) : null}
      <h1
        className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight"
        style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
      >
        {props.headline}
      </h1>
      {props.subheadline ? (
        <p
          className="mt-4 text-lg sm:text-xl max-w-2xl"
          style={{ fontFamily: BLOCK_FONTS.body, color: BLOCK_COLORS.textMuted }}
        >
          {props.subheadline}
        </p>
      ) : null}
    </>
  );
}

function HeroActions(props: Pick<HeroBlockProps, "primaryCta" | "secondaryCta">) {
  return (
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
  );
}

function HeroMedia(props: {
  readonly image: ResolvedMediaImage | null;
  readonly headline: string;
}) {
  if (props.image === null) {
    return null;
  }
  return (
    <div
      className="mt-12 w-full overflow-hidden border"
      style={{
        borderColor: BLOCK_COLORS.border,
        borderRadius: BLOCK_RADII.lg,
        boxShadow: BLOCK_CARD_SHADOW,
      }}
    >
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
  const textAlignClass = TEXT_ALIGN_CLASSES[styles?.textAlign ?? "left"];
  const image = resolveMediaImage({
    reference: props.image,
    legacyUrl: props.imageUrl,
    legacyAlt: props.imageAlt,
    media,
  });
  const sectionStyle = resolveSectionStyle(styles);

  return (
    <section
      data-block-type="hero"
      style={sectionStyle}
      className="w-full flex flex-col justify-center px-4 sm:px-6 lg:px-8"
    >
      <div className={`max-w-full mx-auto w-full flex flex-col ${textAlignClass}`}>
        <HeroIntroduction
          badge={props.badge}
          headline={props.headline}
          subheadline={props.subheadline}
        />
        <HeroActions primaryCta={props.primaryCta} secondaryCta={props.secondaryCta} />
        <HeroMedia image={image} headline={props.headline} />
      </div>
    </section>
  );
}
