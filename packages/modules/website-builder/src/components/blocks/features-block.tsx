import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@suite/ui";
import { SparklesIcon, ArrowRightIcon } from "@suite/ui/icons";
import type {
  FeaturesBlockProps,
  BlockStyleTokens,
  FeatureItem,
} from "../../ast/types.js";
import {
  BLOCK_CARD_SHADOW,
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_RADII,
  resolveSectionStyle,
} from "./block-tokens.js";

export interface FeaturesBlockComponentProps {
  props: FeaturesBlockProps;
  styles?: BlockStyleTokens;
}

const GRID_COLUMNS_MAP: Record<number, string> = {
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

function FeaturesHeading(props: Pick<FeaturesBlockProps, "headline" | "subheadline">) {
  if (!props.headline && !props.subheadline) {
    return null;
  }
  return (
    <div className="text-center max-w-3xl mx-auto mb-12">
      {props.headline ? (
        <h2
          className="text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
        >
          {props.headline}
        </h2>
      ) : null}
      {props.subheadline ? (
        <p className="mt-4 text-lg" style={{ color: BLOCK_COLORS.textMuted }}>
          {props.subheadline}
        </p>
      ) : null}
    </div>
  );
}

function FeatureCard(props: { readonly feature: FeatureItem }) {
  return (
    <Card
      style={{
        backgroundColor: BLOCK_COLORS.surface,
        color: BLOCK_COLORS.text,
        borderColor: BLOCK_COLORS.border,
        borderRadius: BLOCK_RADII.md,
        boxShadow: BLOCK_CARD_SHADOW,
      }}
    >
      <CardHeader className="pb-3">
        <div
          className="h-10 w-10 flex items-center justify-center mb-2"
          style={{
            backgroundColor: BLOCK_COLORS.background,
            color: BLOCK_COLORS.primary,
            borderRadius: BLOCK_RADII.sm,
          }}
        >
          <SparklesIcon size={20} />
        </div>
        <CardTitle
          className="text-xl"
          style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
        >
          {props.feature.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed" style={{ color: BLOCK_COLORS.textMuted }}>
          {props.feature.description}
        </p>
        {props.feature.link ? (
          <a
            href={props.feature.link.url}
            className="inline-flex items-center text-sm font-medium hover:underline mt-4 gap-1"
            style={{ color: BLOCK_COLORS.primary }}
          >
            Learn more <ArrowRightIcon size={14} />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FeaturesBlock({ props, styles }: FeaturesBlockComponentProps) {
  const columns = props.columns || 3;
  const gridColsClass = GRID_COLUMNS_MAP[columns] ?? GRID_COLUMNS_MAP[3];
  const sectionStyle = resolveSectionStyle(styles);

  return (
    <section
      data-block-type="features"
      style={sectionStyle}
      className="w-full px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-full mx-auto">
        <FeaturesHeading headline={props.headline} subheadline={props.subheadline} />
        <div className={`grid gap-8 ${gridColsClass}`}>
          {(props.features || []).map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
