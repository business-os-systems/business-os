import React from "react";
import { Button, Badge, Card, CardHeader, CardTitle, CardContent, CardFooter } from "@suite/ui";
import { CheckIcon } from "@suite/ui/icons";
import type { PricingBlockProps, BlockStyleTokens } from "../../ast/types.js";
import {
  BLOCK_CARD_SHADOW,
  BLOCK_COLORS,
  BLOCK_FONTS,
  BLOCK_RADII,
  resolveSectionStyle,
} from "./block-tokens.js";

export interface PricingBlockComponentProps {
  props: PricingBlockProps;
  styles?: BlockStyleTokens;
}

export function PricingBlock({ props, styles }: PricingBlockComponentProps) {
  const sectionStyle = resolveSectionStyle(styles);

  return (
    <section
      data-block-type="pricing"
      style={sectionStyle}
      className="w-full px-4 sm:px-6 lg:px-8"
    >
      <div className="max-w-full mx-auto">
        {props.headline || props.subheadline ? (
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
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
          {(props.tiers || []).map((tier) => (
            <Card
              key={tier.id}
              className={`flex flex-col justify-between ${tier.isFeatured ? "border-2 relative" : "border"}`}
              style={{
                backgroundColor: BLOCK_COLORS.surface,
                color: BLOCK_COLORS.text,
                borderColor: tier.isFeatured ? BLOCK_COLORS.primary : BLOCK_COLORS.border,
                borderRadius: BLOCK_RADII.md,
                boxShadow: BLOCK_CARD_SHADOW,
              }}
            >
              <CardHeader>
                {tier.badge ? (
                  <Badge variant={tier.isFeatured ? "default" : "secondary"} className="w-fit mb-2">
                    {tier.badge}
                  </Badge>
                ) : null}
                <CardTitle
                  className="text-2xl"
                  style={{ fontFamily: BLOCK_FONTS.heading, color: BLOCK_COLORS.text }}
                >
                  {tier.name}
                </CardTitle>
                {tier.description ? (
                  <p className="text-sm mt-1" style={{ color: BLOCK_COLORS.textMuted }}>
                    {tier.description}
                  </p>
                ) : null}
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold" style={{ color: BLOCK_COLORS.text }}>
                    {`${tier.currency} ${tier.priceAmount}`}
                  </span>
                  <span className="ml-1 text-sm" style={{ color: BLOCK_COLORS.textMuted }}>
                    {`/${tier.interval}`}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="flex-1">
                <ul className="space-y-3 mt-4">
                  {tier.features.map((feat, idx) => (
                    <li key={idx} className="flex items-center text-sm">
                      <span
                        className="mr-3 inline-flex h-5 w-5 items-center justify-center"
                        style={{
                          backgroundColor: BLOCK_COLORS.surface,
                          color: feat.included ? BLOCK_COLORS.accent : BLOCK_COLORS.textMuted,
                          borderRadius: BLOCK_RADII.sm,
                        }}
                      >
                        <CheckIcon size={14} />
                      </span>
                      <span
                        className={feat.included ? "" : "line-through"}
                        style={{ color: feat.included ? BLOCK_COLORS.text : BLOCK_COLORS.textMuted }}
                      >
                        {feat.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-4">
                <a href={tier.cta.target.url} className="w-full">
                  <Button
                    variant={tier.isFeatured ? "default" : "outline"}
                    className="w-full"
                    size="lg"
                  >
                    {tier.cta.label}
                  </Button>
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
